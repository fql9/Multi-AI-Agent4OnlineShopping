/**
 * Knowledge Tools - RAG Evidence Retrieval
 * 
 * Provides:
 * - knowledge.search: Hybrid search (BM25 + vector similarity)
 * - knowledge.get_chunk: Get full chunk with offsets
 * - knowledge.index_product: Index product content for RAG
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { query, queryOne } from '../db.js';

// ============================================================
// Tool Definitions
// ============================================================

export const knowledgeTools: Tool[] = [
  {
    name: 'knowledge.search',
    description: 'Search evidence chunks using hybrid retrieval (keyword + semantic). Returns relevant chunks with citations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Search query text' 
        },
        source_types: { 
          type: 'array', 
          items: { 
            type: 'string', 
            enum: ['product_description', 'manual', 'policy', 'qa', 'review', 'compliance', 'shipping'] 
          },
          description: 'Filter by source types' 
        },
        offer_id: { 
          type: 'string', 
          description: 'Filter by specific offer ID' 
        },
        category_id: { 
          type: 'string', 
          description: 'Filter by category ID' 
        },
        language: { 
          type: 'string', 
          default: 'en',
          description: 'Language filter (en, zh)' 
        },
        limit: { 
          type: 'integer', 
          default: 10,
          description: 'Maximum number of results' 
        },
        min_score: {
          type: 'number',
          default: 0.3,
          description: 'Minimum relevance score (0-1)'
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'knowledge.get_chunk',
    description: 'Get full chunk content with offsets for UI highlighting',
    inputSchema: {
      type: 'object',
      properties: {
        chunk_id: { 
          type: 'string', 
          description: 'Chunk ID to retrieve' 
        },
      },
      required: ['chunk_id'],
    },
  },
  {
    name: 'knowledge.index_product',
    description: 'Index product content into RAG evidence chunks',
    inputSchema: {
      type: 'object',
      properties: {
        offer_id: { 
          type: 'string', 
          description: 'Offer ID to index' 
        },
        content: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            specifications: { type: 'object' },
            policies: { type: 'object' },
            qa: { type: 'array', items: { type: 'object' } },
          },
          description: 'Content to index'
        },
        source_type: {
          type: 'string',
          enum: ['product_description', 'manual', 'policy', 'qa', 'review'],
          default: 'product_description'
        },
        language: {
          type: 'string',
          default: 'en'
        },
      },
      required: ['offer_id', 'content'],
    },
  },
  {
    name: 'knowledge.batch_index_xoobay',
    description: 'Batch index XOOBAY products into RAG system',
    inputSchema: {
      type: 'object',
      properties: {
        page_start: {
          type: 'integer',
          default: 1,
          description: 'Starting page number'
        },
        page_end: {
          type: 'integer',
          default: 10,
          description: 'Ending page number'
        },
        language: {
          type: 'string',
          default: 'en'
        },
      },
    },
  },
];

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
  doc_version_hash: string | null;
  offsets: { start: number; end: number } | null;
  created_at: Date;
  similarity?: number;
  // Enhanced fields from 003 migration
  chunk_type: string | null;
  confidence: number;
  citation_count: number;
}

interface SearchResult {
  chunk_id: string;
  text: string;
  source_type: string;
  chunk_type: string | null;
  offer_id: string | null;
  score: number;
  confidence: number;
  offsets: { start: number; end: number } | null;
  citation: string;
  citation_count: number;
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Generate a simple text embedding using TF-IDF-like approach
 * In production, use OpenAI embeddings or similar
 */
function generateSimpleEmbedding(text: string): number[] {
  // Normalize and tokenize
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  
  // Create a simple 1536-dimensional vector (to match OpenAI's ada-002)
  const embedding = new Array(1536).fill(0);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // Hash the token to get consistent indices
    let hash = 0;
    for (let j = 0; j < token.length; j++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(j);
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Distribute across multiple dimensions
    for (let k = 0; k < 4; k++) {
      const idx = Math.abs((hash + k * 17) % 1536);
      embedding[idx] += 1.0 / (1 + i * 0.1); // Position-weighted
    }
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

/**
 * Calculate cosine similarity between two vectors
 * Used for semantic similarity scoring in RAG
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Chunk text into smaller pieces for indexing
 */
function chunkText(text: string, maxChunkSize: number = 500, overlap: number = 50): Array<{ text: string; start: number; end: number }> {
  const chunks: Array<{ text: string; start: number; end: number }> = [];
  
  if (!text || text.length === 0) {
    return chunks;
  }
  
  // Split by sentences first
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  let currentStart = 0;
  let position = 0;
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        start: currentStart,
        end: position,
      });
      
      // Start new chunk with overlap
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(overlap / 5));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
      currentStart = position - overlapWords.join(' ').length;
    } else {
      if (currentChunk.length === 0) {
        currentStart = position;
      }
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    }
    
    position += sentence.length + 1;
  }
  
  // Add remaining text
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
 * Generate citation string
 */
function generateCitation(chunk: EvidenceChunk): string {
  const parts: string[] = [];
  
  if (chunk.offer_id) {
    parts.push(`offer:${chunk.offer_id}`);
  }
  if (chunk.source_type) {
    parts.push(`type:${chunk.source_type}`);
  }
  parts.push(`chunk:${chunk.id}`);
  
  return `[${parts.join(', ')}]`;
}

// ============================================================
// Tool Handlers
// ============================================================

/**
 * Search evidence chunks using hybrid retrieval
 */
async function searchKnowledge(params: Record<string, unknown>): Promise<unknown> {
  const searchQuery = String(params.query || '').trim();
  if (!searchQuery) {
    return {
      chunks: [],
      total_count: 0,
      query: '',
    };
  }

  const sourceTypes = params.source_types as string[] | undefined;
  const offerId = params.offer_id as string | undefined;
  const categoryId = params.category_id as string | undefined;
  const language = (params.language as string) || 'en';
  const limit = Math.min((params.limit as number) || 10, 50);
  const minScore = (params.min_score as number) || 0.3;

  console.log('[knowledge.search] Searching:', { query: searchQuery, sourceTypes, offerId, limit });

  try {
    // Build SQL query for keyword search (BM25-like)
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Text search condition
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

    // Query chunks with keyword matching - using enhanced fields
    values.push(limit * 3); // Get more for re-ranking
    const keywordResults = await query<EvidenceChunk>(
      `SELECT id, text, source_type, chunk_type, offer_id, sku_id, category_id, language, offsets, created_at, confidence, citation_count
       FROM agent.evidence_chunks
       ${whereClause}
       ORDER BY confidence DESC, citation_count DESC, created_at DESC
       LIMIT $${paramIndex}`,
      values
    );

    console.log('[knowledge.search] Keyword results:', keywordResults.length);

    // If no results from keyword search, try vector similarity if embeddings exist
    if (keywordResults.length === 0) {
      // Try semantic search with embeddings
      const queryEmbedding = generateSimpleEmbedding(searchQuery);
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      try {
        const vectorResults = await query<EvidenceChunk & { similarity: number }>(
          `SELECT id, text, source_type, offer_id, sku_id, category_id, language, offsets, created_at,
                  1 - (embedding <=> $1::vector) as similarity
           FROM agent.evidence_chunks
           WHERE embedding IS NOT NULL
             AND language = $2
           ORDER BY embedding <=> $1::vector
           LIMIT $3`,
          [embeddingStr, language, limit]
        );

        console.log('[knowledge.search] Vector results:', vectorResults.length);

        const results: SearchResult[] = vectorResults
          .filter(r => r.similarity >= minScore)
          .map(chunk => ({
            chunk_id: chunk.id,
            text: chunk.text,
            source_type: chunk.source_type,
            chunk_type: chunk.chunk_type,
            offer_id: chunk.offer_id,
            score: chunk.similarity,
            confidence: parseFloat(String(chunk.confidence ?? 0.8)),
            offsets: chunk.offsets,
            citation: generateCitation(chunk),
            citation_count: chunk.citation_count ?? 0,
          }));

        return {
          chunks: results.slice(0, limit),
          total_count: results.length,
          query: searchQuery,
          method: 'semantic',
        };
      } catch (vectorError) {
        console.log('[knowledge.search] Vector search failed, returning empty:', vectorError);
      }
    }

    // Re-rank keyword results using simple TF-IDF scoring + enhanced fields
    const queryTokens = searchQuery.toLowerCase().split(/\s+/);
    const scoredResults = keywordResults.map(chunk => {
      let score = 0;
      const textLower = chunk.text.toLowerCase();
      
      // Exact phrase match bonus
      if (textLower.includes(searchQuery.toLowerCase())) {
        score += 0.5;
      }
      
      // Token matching
      for (const token of queryTokens) {
        if (textLower.includes(token)) {
          score += 0.1;
          // Title/beginning bonus
          if (textLower.indexOf(token) < 100) {
            score += 0.05;
          }
        }
      }
      
      // Boost score by confidence and citation count
      const chunkConfidence = parseFloat(String(chunk.confidence ?? 0.8));
      score = score * (0.5 + chunkConfidence * 0.5);
      
      // Citation count bonus (popular chunks are more reliable)
      if (chunk.citation_count > 0) {
        score += Math.min(0.1, chunk.citation_count * 0.01);
      }
      
      // Normalize score
      score = Math.min(score, 1.0);
      
      return {
        chunk_id: chunk.id,
        text: chunk.text,
        source_type: chunk.source_type,
        chunk_type: chunk.chunk_type,
        offer_id: chunk.offer_id,
        score,
        confidence: chunkConfidence,
        offsets: chunk.offsets,
        citation: generateCitation(chunk),
        citation_count: chunk.citation_count ?? 0,
      };
    });

    // Filter by minimum score and sort
    const filteredResults = scoredResults
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log('[knowledge.search] Returning:', filteredResults.length, 'results');

    return {
      chunks: filteredResults,
      total_count: filteredResults.length,
      query: searchQuery,
      method: 'keyword',
    };
  } catch (error) {
    console.error('[knowledge.search] Error:', error);
    throw error;
  }
}

/**
 * Get full chunk content
 */
async function getChunk(params: Record<string, unknown>): Promise<unknown> {
  const chunkId = params.chunk_id as string;
  
  if (!chunkId) {
    return { error: { code: 'INVALID_ARGUMENT', message: 'chunk_id is required' } };
  }

  const chunk = await queryOne<EvidenceChunk>(
    `SELECT * FROM agent.evidence_chunks WHERE id = $1`,
    [chunkId]
  );

  if (!chunk) {
    return { error: { code: 'NOT_FOUND', message: `Chunk ${chunkId} not found` } };
  }

  return {
    chunk_id: chunk.id,
    text: chunk.text,
    source_type: chunk.source_type,
    offer_id: chunk.offer_id,
    sku_id: chunk.sku_id,
    category_id: chunk.category_id,
    language: chunk.language,
    offsets: chunk.offsets,
    doc_version_hash: chunk.doc_version_hash,
    created_at: chunk.created_at,
    citation: generateCitation(chunk),
  };
}

/**
 * Index product content into evidence chunks
 */
async function indexProduct(params: Record<string, unknown>): Promise<unknown> {
  const offerId = params.offer_id as string;
  const content = params.content as Record<string, unknown>;
  const sourceType = (params.source_type as string) || 'product_description';
  const language = (params.language as string) || 'en';

  if (!offerId || !content) {
    return { error: { code: 'INVALID_ARGUMENT', message: 'offer_id and content are required' } };
  }

  console.log('[knowledge.index_product] Indexing:', offerId);

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

    // Index specifications as a single chunk
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

    // Index QA pairs
    if (Array.isArray(content.qa)) {
      for (const qa of content.qa as Array<{ question?: string; answer?: string }>) {
        if (qa.question && qa.answer) {
          const qaText = `Q: ${qa.question}\nA: ${qa.answer}`;
          const embedding = generateSimpleEmbedding(qaText);
          const embeddingStr = `[${embedding.join(',')}]`;
          
          const result = await queryOne<{ id: string }>(
            `INSERT INTO agent.evidence_chunks (text, source_type, offer_id, language, embedding)
             VALUES ($1, 'qa', $2, $3, $4::vector)
             RETURNING id`,
            [qaText, offerId, language, embeddingStr]
          );
          
          if (result) {
            indexedChunks.push(result.id);
          }
        }
      }
    }

    console.log('[knowledge.index_product] Indexed chunks:', indexedChunks.length);

    return {
      offer_id: offerId,
      indexed_chunks: indexedChunks.length,
      chunk_ids: indexedChunks,
    };
  } catch (error) {
    console.error('[knowledge.index_product] Error:', error);
    throw error;
  }
}

/**
 * Batch index XOOBAY products
 */
async function batchIndexXoobay(params: Record<string, unknown>): Promise<unknown> {
  const pageStart = (params.page_start as number) || 1;
  const pageEnd = (params.page_end as number) || 10;
  const language = (params.language as string) || 'en';

  const apiKey = process.env.XOOBAY_API_KEY || 'xoobay_api_ai_geo';
  const baseUrl = process.env.XOOBAY_BASE_URL || 'https://www.xoobay.com';

  console.log('[knowledge.batch_index_xoobay] Starting batch index:', { pageStart, pageEnd });

  const results = {
    pages_processed: 0,
    products_indexed: 0,
    chunks_created: 0,
    errors: [] as string[],
  };

  for (let page = pageStart; page <= pageEnd; page++) {
    try {
      const url = `${baseUrl}/api-geo/product-list?pageNo=${page}&apiKey=${apiKey}&lang=${language}`;
      console.log(`[knowledge.batch_index_xoobay] Fetching page ${page}...`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json() as {
        code: number;
        data?: {
          list?: Array<{
            id: number;
            name: string;
            money: string;
          }>;
        };
      };

      if (data.code !== 200 || !data.data?.list) {
        console.log(`[knowledge.batch_index_xoobay] Page ${page}: No data`);
        continue;
      }

      for (const product of data.data.list) {
        try {
          // Fetch full product details
          const detailUrl = `${baseUrl}/api-geo/product-info?id=${product.id}&apiKey=${apiKey}&lang=${language}`;
          const detailResponse = await fetch(detailUrl);
          
          if (!detailResponse.ok) continue;
          
          const detailData = await detailResponse.json() as {
            code: number;
            data?: {
              id: string;
              name: string;
              description?: string;
              short_description?: string;
              category?: string;
            };
          };

          if (detailData.code !== 200 || !detailData.data) continue;

          const productDetail = detailData.data;
          const offerId = `xoobay_${product.id}`;
          
          // Create content to index
          const description = [
            productDetail.name,
            productDetail.short_description,
            productDetail.description,
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
                [chunk.text, offerId, productDetail.category || 'other', language, { start: chunk.start, end: chunk.end }, embeddingStr]
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
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (pageError) {
      results.errors.push(`Page ${page}: ${pageError instanceof Error ? pageError.message : String(pageError)}`);
    }
  }

  console.log('[knowledge.batch_index_xoobay] Completed:', results);
  return results;
}

// ============================================================
// Main Handler
// ============================================================

export function handleKnowledgeTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;

    switch (tool) {
      case 'search':
        return searchKnowledge(p);

      case 'get_chunk':
        return getChunk(p);

      case 'index_product':
        return indexProduct(p);

      case 'batch_index_xoobay':
        return batchIndexXoobay(p);

      default:
        throw new Error(`Unknown knowledge tool: ${tool}`);
    }
  };
}

