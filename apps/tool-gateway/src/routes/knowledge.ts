/**
 * Knowledge Tool Routes - RAG 证据检索工具
 * 
 * 实现:
 * - knowledge.search: 证据检索（hybrid search）
 * - knowledge.get_chunk: 获取完整 chunk
 * 
 * 遵循 doc/10_rag_graphrag.md 规范
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query, queryOne } from '@shopping-agent/common';

const logger = createLogger('knowledge');

/**
 * Chunk 结果类型
 */
interface ChunkResult {
  chunk_id: string;
  text: string;
  source_type: string;
  offer_id: string | null;
  sku_id: string | null;
  category_id: string | null;
  language: string;
  doc_version_hash: string | null;
  offsets: { start: number; end: number } | null;
  score: number;
  citation: {
    chunk_id: string;
    doc_version_hash: string | null;
    offsets: { start: number; end: number } | null;
  };
}

export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * knowledge.search
   * 
   * 证据检索（Hybrid Search: BM25 + 向量）
   * 
   * 输入:
   * - query: 查询文本
   * - scope: 搜索范围 (offer|category|policy|logistics|support)
   * - filters: 过滤条件
   * - top_k: 返回数量
   * 
   * 输出:
   * - chunks[]: 匹配的证据块（带 citations）
   */
  app.post('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        query?: string;
        scope?: 'offer' | 'category' | 'policy' | 'logistics' | 'support' | 'all';
        filters?: {
          offer_id?: string;
          sku_id?: string;
          category_id?: string;
          language?: string;
          source_type?: string;
        };
        top_k?: number;
      }
    };

    const searchQuery = body.params?.query;
    const scope = body.params?.scope ?? 'all';
    const filters = body.params?.filters ?? {};
    const topK = Math.min(body.params?.top_k ?? 10, 50);

    if (!searchQuery) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'query is required')
      );
    }

    logger.info({ 
      query: searchQuery.substring(0, 100),
      scope,
      filters,
      top_k: topK,
    }, 'Searching knowledge base');

    try {
      // 构建过滤条件
      const conditions: string[] = [];
      const params: (string | number)[] = [topK];
      let paramIndex = 2;

      if (filters.offer_id) {
        conditions.push(`offer_id = $${paramIndex}`);
        params.push(filters.offer_id);
        paramIndex++;
      }

      if (filters.sku_id) {
        conditions.push(`sku_id = $${paramIndex}`);
        params.push(filters.sku_id);
        paramIndex++;
      }

      if (filters.category_id) {
        conditions.push(`category_id = $${paramIndex}`);
        params.push(filters.category_id);
        paramIndex++;
      }

      if (filters.language) {
        conditions.push(`language = $${paramIndex}`);
        params.push(filters.language);
        paramIndex++;
      }

      if (filters.source_type) {
        conditions.push(`source_type = $${paramIndex}`);
        params.push(filters.source_type);
        paramIndex++;
      }

      // 根据 scope 添加 source_type 过滤
      if (scope !== 'all') {
        const scopeToSourceType: Record<string, string[]> = {
          offer: ['manual', 'spec'],
          category: ['category_guide'],
          policy: ['policy', 'terms'],
          logistics: ['shipping_policy', 'customs'],
          support: ['qa', 'faq'],
        };
        const sourceTypes = scopeToSourceType[scope];
        if (sourceTypes && sourceTypes.length > 0) {
          conditions.push(`source_type = ANY($${paramIndex})`);
          params.push(sourceTypes as unknown as string);
          paramIndex++;
        }
      }

      const whereClause = conditions.length > 0 
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      // 混合检索（Hybrid Search）：BM25 + 向量（遵循 doc/10_rag_graphrag.md）
      // 1. BM25 全文检索
      // 2. 向量相似度检索（如果有 embedding）
      // 3. 合并结果并重排序
      
      // BM25 全文检索
      const bm25Chunks = await query<{
        id: string;
        text: string;
        source_type: string;
        offer_id: string | null;
        sku_id: string | null;
        category_id: string | null;
        language: string;
        doc_version_hash: string | null;
        offsets: unknown;
        rank: number;
      }>(
        `SELECT 
          id,
          text,
          source_type,
          offer_id,
          sku_id,
          category_id,
          language,
          doc_version_hash,
          offsets,
          ts_rank(to_tsvector('english', text), plainto_tsquery('english', $${paramIndex})) as rank
        FROM agent.evidence_chunks
        ${whereClause}
        ORDER BY rank DESC
        LIMIT $1`,
        [...params, searchQuery]
      );

      // 向量检索（如果 embedding 列已填充）
      // 注意: 需要外部服务生成 query embedding
      // 此处使用简化逻辑：如果 BM25 结果不足，尝试模糊匹配补充
      let vectorChunks: typeof bm25Chunks = [];
      if (bm25Chunks.length < topK) {
        // 备选：使用 ILIKE 模糊匹配作为向量检索的降级方案
        const keywords = searchQuery.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
        if (keywords.length > 0) {
          const existingIds = bm25Chunks.map(c => c.id);
          const likeConditions = keywords.map((_, i) => `text ILIKE $${paramIndex + i}`).join(' OR ');
          const likeParams = keywords.map(k => `%${k}%`);
          
          vectorChunks = await query<typeof bm25Chunks[0]>(
            `SELECT 
              id,
              text,
              source_type,
              offer_id,
              sku_id,
              category_id,
              language,
              doc_version_hash,
              offsets,
              0.5 as rank
            FROM agent.evidence_chunks
            ${whereClause ? whereClause + ' AND ' : 'WHERE '}
            (${likeConditions})
            ${existingIds.length > 0 ? `AND id NOT IN (${existingIds.map((_, i) => `$${paramIndex + keywords.length + i}`).join(',')})` : ''}
            LIMIT ${topK - bm25Chunks.length}`,
            [...params, ...likeParams, ...existingIds]
          );
        }
      }

      // 合并结果（BM25 优先，向量补充）
      const chunks = [...bm25Chunks, ...vectorChunks].slice(0, topK);

      // 转换为标准输出格式
      const results: ChunkResult[] = chunks.map(chunk => ({
        chunk_id: chunk.id,
        text: chunk.text,
        source_type: chunk.source_type,
        offer_id: chunk.offer_id,
        sku_id: chunk.sku_id,
        category_id: chunk.category_id,
        language: chunk.language,
        doc_version_hash: chunk.doc_version_hash,
        offsets: chunk.offsets as { start: number; end: number } | null,
        score: chunk.rank,
        citation: {
          chunk_id: chunk.id,
          doc_version_hash: chunk.doc_version_hash,
          offsets: chunk.offsets as { start: number; end: number } | null,
        },
      }));

      logger.info({ 
        query: searchQuery.substring(0, 50),
        results_count: results.length,
      }, 'Search completed');

      return reply.send(
        createSuccessResponse({
          chunks: results,
          total: results.length,
          query: searchQuery,
          scope,
          retrieval_debug: {
            method: 'hybrid_bm25_fuzzy',
            bm25_count: bm25Chunks.length,
            vector_count: vectorChunks.length,
            filters_applied: Object.keys(filters).length,
          },
        }, { ttl_seconds: 300 }) // 5 分钟 TTL
      );
    } catch (error) {
      logger.error({ error }, 'Failed to search knowledge base');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to search knowledge base')
      );
    }
  });

  /**
   * knowledge.get_chunk
   * 
   * 获取完整 chunk 内容（用于 UI 高亮引用）
   */
  app.post('/get_chunk', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        chunk_id?: string;
        chunk_ids?: string[];
      }
    };

    const chunkId = body.params?.chunk_id;
    const chunkIds = body.params?.chunk_ids ?? (chunkId ? [chunkId] : []);

    if (chunkIds.length === 0) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'chunk_id or chunk_ids is required')
      );
    }

    if (chunkIds.length > 20) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'Maximum 20 chunks per request')
      );
    }

    try {
      const chunks = await query<{
        id: string;
        text: string;
        source_type: string;
        offer_id: string | null;
        sku_id: string | null;
        category_id: string | null;
        language: string;
        doc_version_hash: string | null;
        offsets: unknown;
        created_at: Date;
      }>(
        `SELECT * FROM agent.evidence_chunks WHERE id = ANY($1)`,
        [chunkIds]
      );

      if (chunks.length === 0) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Chunks not found')
        );
      }

      const results = chunks.map(chunk => ({
        chunk_id: chunk.id,
        text: chunk.text,
        source_type: chunk.source_type,
        offer_id: chunk.offer_id,
        sku_id: chunk.sku_id,
        category_id: chunk.category_id,
        language: chunk.language,
        doc_version_hash: chunk.doc_version_hash,
        offsets: chunk.offsets,
        created_at: chunk.created_at,
        // UI 高亮用
        highlight_info: {
          can_highlight: chunk.offsets !== null,
          source_reference: chunk.doc_version_hash 
            ? `${chunk.source_type}:${chunk.doc_version_hash}`
            : null,
        },
      }));

      return reply.send(
        createSuccessResponse({
          chunks: results,
          total: results.length,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get chunks');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get chunks')
      );
    }
  });

  /**
   * knowledge.index_chunk
   * 
   * 添加新的证据块（内部使用）
   */
  app.post('/index_chunk', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        text: string;
        source_type: string;
        offer_id?: string;
        sku_id?: string;
        category_id?: string;
        language?: string;
        doc_version_hash?: string;
        offsets?: { start: number; end: number };
      }
    };

    const params = body.params;
    if (!params?.text || !params?.source_type) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'text and source_type are required')
      );
    }

    try {
      const result = await queryOne<{ id: string }>(
        `INSERT INTO agent.evidence_chunks (
          text, source_type, offer_id, sku_id, category_id,
          language, doc_version_hash, offsets, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id`,
        [
          params.text,
          params.source_type,
          params.offer_id ?? null,
          params.sku_id ?? null,
          params.category_id ?? null,
          params.language ?? 'en',
          params.doc_version_hash ?? null,
          params.offsets ? JSON.stringify(params.offsets) : null,
        ]
      );

      logger.info({ chunk_id: result?.id }, 'Chunk indexed');

      return reply.send(
        createSuccessResponse({
          chunk_id: result?.id,
          indexed_at: new Date().toISOString(),
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to index chunk');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to index chunk')
      );
    }
  });
}

