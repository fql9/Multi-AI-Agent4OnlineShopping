/**
 * Knowledge Graph Tool Routes - 知识图谱查询工具
 * 
 * 实现:
 * - kg.get_compatible_models: 获取 SKU 兼容的设备型号
 * - kg.get_substitutes: 获取替代商品
 * - kg.get_complements: 获取配件/组合商品
 * - kg.get_sku_certificates: 获取 SKU 的证书
 * 
 * 遵循 doc/09_kg_design.md 规范
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query } from '@shopping-agent/common';

const logger = createLogger('kg');

export async function kgRoutes(app: FastifyInstance): Promise<void> {
  /**
   * kg.get_compatible_models
   * 
   * 获取 SKU 兼容的设备型号
   */
  app.post('/get_compatible_models', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        sku_id?: string;
        offer_id?: string;
      }
    };

    const skuId = body.params?.sku_id;
    const offerId = body.params?.offer_id;

    if (!skuId && !offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'sku_id or offer_id is required')
      );
    }

    try {
      let targetSkuIds: string[] = [];

      if (skuId) {
        targetSkuIds = [skuId];
      } else if (offerId) {
        // 获取该 offer 下所有 SKU
        const skus = await query<{ id: string }>(
          'SELECT id FROM agent.skus WHERE offer_id = $1',
          [offerId]
        );
        targetSkuIds = skus.map(s => s.id);
      }

      if (targetSkuIds.length === 0) {
        return reply.send(
          createSuccessResponse({
            models: [],
            total: 0,
          })
        );
      }

      // 查询兼容性关系
      const compatibilities = await query<{
        sku_id: string;
        model_id: string;
        model_name: string;
        brand_name: string;
        compatibility_type: string;
        confidence: number;
        source: string;
      }>(
        `SELECT 
          c.sku_id,
          c.model_id,
          m.name as model_name,
          b.name as brand_name,
          c.compatibility_type,
          c.confidence,
          c.source
        FROM agent.kg_sku_compatibility c
        JOIN agent.models m ON c.model_id = m.id
        LEFT JOIN agent.brands b ON m.brand_id = b.id
        WHERE c.sku_id = ANY($1)
        ORDER BY c.confidence DESC`,
        [targetSkuIds]
      );

      const models = compatibilities.map(c => ({
        model_id: c.model_id,
        model_name: c.model_name,
        brand: c.brand_name,
        sku_id: c.sku_id,
        compatibility_type: c.compatibility_type,
        confidence: parseFloat(String(c.confidence)),
        source: c.source,
      }));

      logger.info({ 
        sku_ids: targetSkuIds,
        models_count: models.length,
      }, 'Compatible models retrieved');

      return reply.send(
        createSuccessResponse({
          models,
          total: models.length,
        }, { ttl_seconds: 600 })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get compatible models');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get compatible models')
      );
    }
  });

  /**
   * kg.get_substitutes
   * 
   * 获取替代商品
   */
  app.post('/get_substitutes', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        offer_id: string;
        min_similarity?: number;
        limit?: number;
      }
    };

    const offerId = body.params?.offer_id;
    const minSimilarity = body.params?.min_similarity ?? 0.5;
    const limit = Math.min(body.params?.limit ?? 10, 50);

    if (!offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'offer_id is required')
      );
    }

    try {
      const substitutes = await query<{
        substitute_offer_id: string;
        title_en: string;
        title_zh: string;
        brand_name: string;
        base_price: number;
        currency: string;
        similarity_score: number;
        reason: string;
        confidence: number;
      }>(
        `SELECT 
          s.substitute_offer_id,
          o.title_en,
          o.title_zh,
          o.brand_name,
          o.base_price,
          o.currency,
          s.similarity_score,
          s.reason,
          s.confidence
        FROM agent.kg_offer_substitutes s
        JOIN agent.offers o ON s.substitute_offer_id = o.id
        WHERE s.offer_id = $1 AND s.similarity_score >= $2
        ORDER BY s.similarity_score DESC
        LIMIT $3`,
        [offerId, minSimilarity, limit]
      );

      const results = substitutes.map(s => ({
        offer_id: s.substitute_offer_id,
        title: { en: s.title_en, zh: s.title_zh },
        brand: s.brand_name,
        price: { amount: parseFloat(String(s.base_price)), currency: s.currency },
        similarity_score: parseFloat(String(s.similarity_score)),
        reason: s.reason,
        confidence: parseFloat(String(s.confidence)),
      }));

      logger.info({ 
        offer_id: offerId,
        substitutes_count: results.length,
      }, 'Substitutes retrieved');

      return reply.send(
        createSuccessResponse({
          original_offer_id: offerId,
          substitutes: results,
          total: results.length,
        }, { ttl_seconds: 600 })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get substitutes');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get substitutes')
      );
    }
  });

  /**
   * kg.get_complements
   * 
   * 获取配件/组合商品
   */
  app.post('/get_complements', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        offer_id: string;
        relation_type?: 'accessory' | 'bundle' | 'frequently_bought_together' | 'all';
        limit?: number;
      }
    };

    const offerId = body.params?.offer_id;
    const relationType = body.params?.relation_type ?? 'all';
    const limit = Math.min(body.params?.limit ?? 10, 50);

    if (!offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'offer_id is required')
      );
    }

    try {
      let whereClause = 'c.offer_id = $1';
      const params: (string | number)[] = [offerId, limit];

      if (relationType !== 'all') {
        whereClause += ' AND c.relation_type = $3';
        params.push(relationType);
      }

      const complements = await query<{
        complement_offer_id: string;
        title_en: string;
        title_zh: string;
        brand_name: string;
        base_price: number;
        currency: string;
        relation_type: string;
        strength: number;
        reason: string;
      }>(
        `SELECT 
          c.complement_offer_id,
          o.title_en,
          o.title_zh,
          o.brand_name,
          o.base_price,
          o.currency,
          c.relation_type,
          c.strength,
          c.reason
        FROM agent.kg_offer_complements c
        JOIN agent.offers o ON c.complement_offer_id = o.id
        WHERE ${whereClause}
        ORDER BY c.strength DESC
        LIMIT $2`,
        params
      );

      const results = complements.map(c => ({
        offer_id: c.complement_offer_id,
        title: { en: c.title_en, zh: c.title_zh },
        brand: c.brand_name,
        price: { amount: parseFloat(String(c.base_price)), currency: c.currency },
        relation_type: c.relation_type,
        strength: parseFloat(String(c.strength)),
        reason: c.reason,
      }));

      logger.info({ 
        offer_id: offerId,
        complements_count: results.length,
      }, 'Complements retrieved');

      return reply.send(
        createSuccessResponse({
          original_offer_id: offerId,
          complements: results,
          total: results.length,
        }, { ttl_seconds: 600 })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get complements');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get complements')
      );
    }
  });

  /**
   * kg.get_sku_certificates
   * 
   * 获取 SKU 的认证证书
   */
  app.post('/get_sku_certificates', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        sku_id?: string;
        offer_id?: string;
      }
    };

    const skuId = body.params?.sku_id;
    const offerId = body.params?.offer_id;

    if (!skuId && !offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'sku_id or offer_id is required')
      );
    }

    try {
      let targetSkuIds: string[] = [];

      if (skuId) {
        targetSkuIds = [skuId];
      } else if (offerId) {
        const skus = await query<{ id: string }>(
          'SELECT id FROM agent.skus WHERE offer_id = $1',
          [offerId]
        );
        targetSkuIds = skus.map(s => s.id);
      }

      if (targetSkuIds.length === 0) {
        return reply.send(
          createSuccessResponse({
            certificates: [],
            total: 0,
          })
        );
      }

      const certificates = await query<{
        sku_id: string;
        certificate_id: string;
        cert_name: string;
        cert_type: string;
        issuing_authority: string;
        valid_from: Date | null;
        valid_to: Date | null;
        verified: boolean;
        confidence: string;
      }>(
        `SELECT 
          sc.sku_id,
          c.id as certificate_id,
          c.name as cert_name,
          c.type as cert_type,
          c.issuing_authority,
          c.valid_from,
          c.valid_to,
          sc.verified,
          c.confidence
        FROM agent.kg_sku_certificates sc
        JOIN agent.certificates c ON sc.certificate_id = c.id
        WHERE sc.sku_id = ANY($1)
        ORDER BY c.type`,
        [targetSkuIds]
      );

      const results = certificates.map(c => ({
        sku_id: c.sku_id,
        certificate_id: c.certificate_id,
        name: c.cert_name,
        type: c.cert_type,
        issuing_authority: c.issuing_authority,
        valid_from: c.valid_from?.toISOString() ?? null,
        valid_to: c.valid_to?.toISOString() ?? null,
        verified: c.verified,
        confidence: c.confidence,
      }));

      logger.info({ 
        sku_ids: targetSkuIds,
        certificates_count: results.length,
      }, 'Certificates retrieved');

      return reply.send(
        createSuccessResponse({
          certificates: results,
          total: results.length,
        }, { ttl_seconds: 3600 }) // 证书缓存 1 小时
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get certificates');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get certificates')
      );
    }
  });

  /**
   * kg.get_brand_info
   * 
   * 获取品牌信息
   */
  app.post('/get_brand_info', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        brand_id?: string;
        brand_name?: string;
      }
    };

    const brandId = body.params?.brand_id;
    const brandName = body.params?.brand_name;

    if (!brandId && !brandName) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'brand_id or brand_name is required')
      );
    }

    try {
      const brand = await query<{
        id: string;
        name: string;
        normalized_name: string;
        country_of_origin: string | null;
        confidence: string;
        source: string;
      }>(
        brandId 
          ? 'SELECT * FROM agent.brands WHERE id = $1'
          : 'SELECT * FROM agent.brands WHERE normalized_name = LOWER($1)',
        [brandId ?? brandName]
      );

      if (brand.length === 0) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Brand not found')
        );
      }

      const b = brand[0];

      return reply.send(
        createSuccessResponse({
          brand_id: b.id,
          name: b.name,
          normalized_name: b.normalized_name,
          country_of_origin: b.country_of_origin,
          confidence: b.confidence,
          source: b.source,
        }, { ttl_seconds: 3600 })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get brand info');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get brand info')
      );
    }
  });

  /**
   * kg.get_merchant_info
   * 
   * 获取商家信息
   */
  app.post('/get_merchant_info', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        merchant_id: string;
      }
    };

    const merchantId = body.params?.merchant_id;

    if (!merchantId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'merchant_id is required')
      );
    }

    try {
      const merchant = await query<{
        id: string;
        name: string;
        legal_name: string | null;
        country: string | null;
        rating: number;
        verified: boolean;
        capabilities: unknown;
        service_languages: string[];
        ship_out_sla_hours: number;
      }>(
        'SELECT * FROM agent.merchants WHERE id = $1',
        [merchantId]
      );

      if (merchant.length === 0) {
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Merchant not found')
        );
      }

      const m = merchant[0];

      return reply.send(
        createSuccessResponse({
          merchant_id: m.id,
          name: m.name,
          legal_name: m.legal_name,
          country: m.country,
          rating: parseFloat(String(m.rating)),
          verified: m.verified,
          capabilities: m.capabilities,
          service_languages: m.service_languages,
          ship_out_sla_hours: m.ship_out_sla_hours,
        }, { ttl_seconds: 3600 })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get merchant info');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get merchant info')
      );
    }
  });
}

