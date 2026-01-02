/**
 * Knowledge Tool Routes - RAG Evidence Retrieval
 * 
 * Implements:
 * - knowledge.search: Hybrid search for evidence chunks
 * - knowledge.get_chunk: Get full chunk with citation
 * - knowledge.index_product: Index product content
 * - knowledge.sync_xoobay: Sync XOOBAY products to RAG
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query, queryOne } from '@shopping-agent/common';
import { getXOOBAYClient } from '../services/xoobay.js';

const logger = createLogger('knowledge');

// ============================================================
// Types
// ============================================================

interface EvidenceChunk {
  id: string;
  text: string;
  source_type: string;
  offer_id: string | null;
  sku_id: string | null;
  category_id: string | null;
  language: string;
  offsets: { start: number; end: number } | null;
  created_at: Date;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Generate simple embedding for text (TF-IDF-like approach)
 * In production, use OpenAI embeddings or similar
 */
function generateSimpleEmbedding(text: string): number[] {
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  
  const embedding = new Array(1536).fill(0);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let hash = 0;
    for (let j = 0; j < token.length; j++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(j);
      hash = hash & hash;
    }
    
    for (let k = 0; k < 4; k++) {
      const idx = Math.abs((hash + k * 17) % 1536);
      embedding[idx] += 1.0 / (1 + i * 0.1);
    }
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

/**
 * Chunk text into smaller pieces
 */
function chunkText(text: string, maxSize = 500): Array<{ text: string; start: number; end: number }> {
  const chunks: Array<{ text: string; start: number; end: number }> = [];
  
  if (!text || text.length === 0) return chunks;
  
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  let currentStart = 0;
  let position = 0;
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        start: currentStart,
        end: position,
      });
      currentChunk = sentence;
      currentStart = position;
    } else {
      if (currentChunk.length === 0) currentStart = position;
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    }
    position += sentence.length + 1;
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      start: currentStart,
      end: position,
    });
  }
  
  return chunks;
}

/**
 * Generate citation
 */
function generateCitation(chunk: EvidenceChunk): string {
  const parts: string[] = [];
  if (chunk.offer_id) parts.push(`offer:${chunk.offer_id}`);
  if (chunk.source_type) parts.push(`type:${chunk.source_type}`);
  parts.push(`chunk:${chunk.id}`);
  return `[${parts.join(', ')}]`;
}

// ============================================================
// Routes
// ============================================================

export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * knowledge.search
   * 
   * Hybrid search for evidence chunks (keyword + semantic)
   */
  app.post('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: Record<string, unknown> };
    const params = body.params ?? {};

    const searchQuery = String(params.query || '').trim();
    const sourceTypes = params.source_types as string[] | undefined;
    const offerId = params.offer_id as string | undefined;
    const categoryId = params.category_id as string | undefined;
    const language = (params.language as string) || 'en';
    const limit = Math.min((params.limit as number) || 10, 50);
    const minScore = (params.min_score as number) || 0.3;

    if (!searchQuery) {
      return reply.send(
        createSuccessResponse({
          chunks: [],
          total_count: 0,
          query: '',
        })
      );
    }

    logger.info({ query: searchQuery, sourceTypes, offerId, limit }, 'Searching knowledge');

    try {
      // Build SQL query
      const conditions: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      // Text search
      conditions.push(`text ILIKE $${paramIndex}`);
      values.push(`%${searchQuery}%`);
      paramIndex++;

      // Source type filter
      if (sourceTypes && sourceTypes.length > 0) {
        conditions.push(`source_type = ANY($${paramIndex})`);
        values.push(sourceTypes);
        paramIndex++;
      }

      // Offer ID filter
      if (offerId) {
        conditions.push(`offer_id = $${paramIndex}`);
        values.push(offerId);
        paramIndex++;
      }

      // Category ID filter
      if (categoryId) {
        conditions.push(`category_id = $${paramIndex}`);
        values.push(categoryId);
        paramIndex++;
      }

      // Language filter
      conditions.push(`language = $${paramIndex}`);
      values.push(language);
      paramIndex++;

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Query chunks
      values.push(limit * 3);
      const chunks = await query<EvidenceChunk>(
        `SELECT id, text, source_type, offer_id, sku_id, category_id, language, offsets, created_at
         FROM agent.evidence_chunks
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex}`,
        values
      );

      // Score and rank results
      const queryTokens = searchQuery.toLowerCase().split(/\s+/);
      const scoredResults = chunks.map(chunk => {
        let score = 0;
        const textLower = chunk.text.toLowerCase();
        
        if (textLower.includes(searchQuery.toLowerCase())) {
          score += 0.5;
        }
        
        for (const token of queryTokens) {
          if (textLower.includes(token)) {
            score += 0.1;
            if (textLower.indexOf(token) < 100) {
              score += 0.05;
            }
          }
        }
        
        score = Math.min(score, 1.0);
        
        return {
          chunk_id: chunk.id,
          text: chunk.text,
          source_type: chunk.source_type,
          offer_id: chunk.offer_id,
          score,
          offsets: chunk.offsets,
          citation: generateCitation(chunk),
        };
      });

      const filteredResults = scoredResults
        .filter(r => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      logger.info({ 
        query: searchQuery, 
        results: filteredResults.length 
      }, 'Knowledge search completed');

      return reply.send(
        createSuccessResponse({
          chunks: filteredResults,
          total_count: filteredResults.length,
          query: searchQuery,
          method: 'keyword',
        }, {
          ttl_seconds: 300,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Knowledge search failed');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to search knowledge')
      );
    }
  });

  /**
   * knowledge.get_chunk
   * 
   * Get full chunk content with citation
   */
  app.post('/get_chunk', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: { chunk_id?: string } };
    const chunkId = body.params?.chunk_id;

    if (!chunkId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'chunk_id is required')
      );
    }

    try {
      const chunk = await queryOne<EvidenceChunk>(
        `SELECT * FROM agent.evidence_chunks WHERE id = $1`,
        [chunkId]
      );

      if (!chunk) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', `Chunk ${chunkId} not found`)
        );
      }

      return reply.send(
        createSuccessResponse({
          chunk_id: chunk.id,
          text: chunk.text,
          source_type: chunk.source_type,
          offer_id: chunk.offer_id,
          sku_id: chunk.sku_id,
          category_id: chunk.category_id,
          language: chunk.language,
          offsets: chunk.offsets,
          created_at: chunk.created_at,
          citation: generateCitation(chunk),
        })
      );
    } catch (error) {
      logger.error({ error, chunkId }, 'Failed to get chunk');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get chunk')
      );
    }
  });

  /**
   * knowledge.index_product
   * 
   * Index product content into evidence chunks
   */
  app.post('/index_product', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: Record<string, unknown> };
    const params = body.params ?? {};

    const offerId = params.offer_id as string;
    const content = params.content as Record<string, unknown>;
    const sourceType = (params.source_type as string) || 'product_description';
    const language = (params.language as string) || 'en';

    if (!offerId || !content) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'offer_id and content are required')
      );
    }

    logger.info({ offerId }, 'Indexing product');

    try {
      const indexedChunks: string[] = [];

      // Index description
      if (content.description && typeof content.description === 'string') {
        const chunks = chunkText(content.description);
        
        for (const chunk of chunks) {
          const embedding = generateSimpleEmbedding(chunk.text);
          const embeddingStr = `[${embedding.join(',')}]`;
          
          const result = await queryOne<{ id: string }>(
            `INSERT INTO agent.evidence_chunks (text, source_type, offer_id, language, offsets, embedding)
             VALUES ($1, $2, $3, $4, $5, $6::vector)
             RETURNING id`,
            [chunk.text, sourceType, offerId, language, { start: chunk.start, end: chunk.end }, embeddingStr]
          );
          
          if (result) {
            indexedChunks.push(result.id);
          }
        }
      }

      // Index specifications
      if (content.specifications && typeof content.specifications === 'object') {
        const specText = Object.entries(content.specifications as Record<string, unknown>)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        
        if (specText.length > 0) {
          const embedding = generateSimpleEmbedding(specText);
          const embeddingStr = `[${embedding.join(',')}]`;
          
          const result = await queryOne<{ id: string }>(
            `INSERT INTO agent.evidence_chunks (text, source_type, offer_id, language, embedding)
             VALUES ($1, 'specification', $2, $3, $4::vector)
             RETURNING id`,
            [specText, offerId, language, embeddingStr]
          );
          
          if (result) {
            indexedChunks.push(result.id);
          }
        }
      }

      logger.info({ offerId, chunks: indexedChunks.length }, 'Product indexed');

      return reply.send(
        createSuccessResponse({
          offer_id: offerId,
          indexed_chunks: indexedChunks.length,
          chunk_ids: indexedChunks,
        })
      );
    } catch (error) {
      logger.error({ error, offerId }, 'Failed to index product');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to index product')
      );
    }
  });

  /**
   * knowledge.sync_xoobay
   * 
   * Sync XOOBAY products to RAG system
   */
  app.post('/sync_xoobay', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: Record<string, unknown> };
    const params = body.params ?? {};

    const pageStart = (params.page_start as number) || 1;
    const pageEnd = (params.page_end as number) || 10;
    const language = (params.language as string) || 'en';

    logger.info({ pageStart, pageEnd }, 'Starting XOOBAY sync');

    const results = {
      pages_processed: 0,
      products_indexed: 0,
      chunks_created: 0,
      errors: [] as string[],
    };

    try {
      const client = getXOOBAYClient();

      for (let page = pageStart; page <= pageEnd; page++) {
        try {
          const productList = await client.getProductList({ pageNo: page, lang: language });
          
          if (!productList.list || productList.list.length === 0) {
            continue;
          }

          for (const product of productList.list) {
            try {
              // Get product details
              const detail = await client.getProductInfo(product.id, language);
              const offerId = `xoobay_${product.id}`;
              
              // Create content
              const description = [
                detail.name,
                detail.short_description,
                detail.description,
              ].filter(Boolean).join('\n\n');

              if (description.length > 0) {
                const chunks = chunkText(description);
                
                for (const chunk of chunks) {
                  const embedding = generateSimpleEmbedding(chunk.text);
                  const embeddingStr = `[${embedding.join(',')}]`;
                  
                  await query(
                    `INSERT INTO agent.evidence_chunks (text, source_type, offer_id, category_id, language, offsets, embedding)
                     VALUES ($1, 'product_description', $2, $3, $4, $5, $6::vector)
                     ON CONFLICT DO NOTHING`,
                    [chunk.text, offerId, detail.category || 'other', language, { start: chunk.start, end: chunk.end }, embeddingStr]
                  );
                  
                  results.chunks_created++;
                }
              }

              results.products_indexed++;
            } catch (productError) {
              results.errors.push(`Product ${product.id}: ${productError instanceof Error ? productError.message : String(productError)}`);
            }
          }

          results.pages_processed++;
          
          // Check circuit breaker status
          const status = client.getCircuitStatus();
          if (status.state === 'OPEN') {
            logger.warn('Circuit breaker open, stopping sync');
            break;
          }
        } catch (pageError) {
          results.errors.push(`Page ${page}: ${pageError instanceof Error ? pageError.message : String(pageError)}`);
        }
      }

      logger.info(results, 'XOOBAY sync completed');

      return reply.send(
        createSuccessResponse(results)
      );
    } catch (error) {
      logger.error({ error }, 'XOOBAY sync failed');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to sync XOOBAY products')
      );
    }
  });

  /**
   * knowledge.stats
   * 
   * Get knowledge base statistics
   */
  app.post('/stats', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await queryOne<{
        total_chunks: string;
        source_types: Record<string, number>;
        languages: Record<string, number>;
      }>(
        `SELECT 
          COUNT(*) as total_chunks,
          jsonb_object_agg(source_type, count) as source_types,
          jsonb_object_agg(language, lang_count) as languages
         FROM (
           SELECT source_type, COUNT(*) as count
           FROM agent.evidence_chunks
           GROUP BY source_type
         ) st,
         (
           SELECT language, COUNT(*) as lang_count
           FROM agent.evidence_chunks
           GROUP BY language
         ) lg`
      );

      // Get XOOBAY client status
      const xoobayClient = getXOOBAYClient();
      const circuitStatus = xoobayClient.getCircuitStatus();

      return reply.send(
        createSuccessResponse({
          total_chunks: parseInt(stats?.total_chunks || '0'),
          source_types: stats?.source_types || {},
          languages: stats?.languages || {},
          xoobay_circuit: circuitStatus,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get stats');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get knowledge stats')
      );
    }
  });
}


