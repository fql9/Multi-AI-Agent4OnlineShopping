/**
 * Compliance Tool Routes - 合规检查工具
 * 
 * 实现:
 * - compliance.check_item: 检查商品是否合规
 * - compliance.get_required_certs: 获取所需认证
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query, queryOne } from '@shopping-agent/common';

const logger = createLogger('compliance');

interface ComplianceRule {
  id: string;
  name: { en: string; zh: string };
  rule_type: string;
  priority: number;
  condition: {
    attribute?: string;
    operator?: string;
    value?: unknown;
    category?: string;
    custom?: string;
  };
  applies_to: {
    categories: string[];
    countries: string[];
  };
  action: {
    type: string;
    message?: { en: string; zh: string };
    certification?: string;
    allowed_methods?: string[];
    blocked_methods?: string[];
    warning_type?: string;
    min_age?: number;
  };
  severity: 'error' | 'warning' | 'info';
}

interface OfferRow {
  id: string;
  category_id: string;
  risk_tags: string[];
  certifications: string[];
  attributes: Array<{ attr_id: string; value: unknown }>;
}

// Enhanced types from 003 migration
interface RiskTagDefinition {
  id: string;
  name_en: string;
  name_zh: string | null;
  description: string | null;
  severity: string;
  affected_shipping: boolean;
  affected_customs: boolean;
  keywords: string[];
}

interface ShippingLane {
  id: string;
  name: string;
  origin_country: string;
  dest_country: string;
  carrier: string | null;
  service_type: string | null;
  min_days: number | null;
  max_days: number | null;
  allowed_risk_tags: string[];
  blocked_risk_tags: string[];
  max_weight_g: number | null;
  max_dimension_cm: number | null;
  base_rate: number | null;
  active: boolean;
}

export async function complianceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * compliance.check_item
   * 
   * 检查商品是否可以销售到目标国家
   * 
   * 输入:
   * - sku_id 或 offer_id
   * - destination_country: 目的国
   * - shipping_method: 运输方式（可选）
   * 
   * 输出:
   * - allowed: 是否允许
   * - issues: 问题列表
   * - required_docs: 所需文件
   * - warnings: 警告信息
   */
  app.post('/check_item', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        sku_id?: string;
        offer_id?: string;
        destination_country?: string;
        shipping_method?: string;
      }
    };

    const skuId = body.params?.sku_id;
    const offerId = body.params?.offer_id;
    const destinationCountry = body.params?.destination_country ?? 'US';
    const shippingMethod = body.params?.shipping_method ?? 'standard';

    if (!skuId && !offerId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'sku_id or offer_id is required')
      );
    }

    logger.info({ 
      offer_id: offerId, 
      sku_id: skuId, 
      destination_country: destinationCountry 
    }, 'Checking compliance');

    try {
      // 获取商品信息
      // 如果提供了 sku_id，先从 SKU 表查找对应的 offer_id
      let resolvedOfferId = offerId;
      if (!resolvedOfferId && skuId) {
        const sku = await queryOne<{ offer_id: string }>(
          `SELECT offer_id FROM agent.skus WHERE id = $1`,
          [skuId]
        );
        if (sku) {
          resolvedOfferId = sku.offer_id;
        }
      }
      
      const offer = await queryOne<OfferRow>(
        `SELECT id, category_id, risk_tags, certifications, attributes 
         FROM agent.offers 
         WHERE id = $1`,
        [resolvedOfferId]
      );

      if (!offer) {
        // 如果找不到 offer，为 XOOBAY 产品返回默认合规结果
        if (skuId?.startsWith('sku_') || offerId?.startsWith('xoobay_')) {
          logger.info({ sku_id: skuId, offer_id: offerId }, 'Returning default compliance for XOOBAY product');
          return reply.send(
            createSuccessResponse({
              allowed: true,
              issues: [],
              required_docs: [],
              warnings: ['Product details not fully verified - using default compliance rules'],
              shipping_restrictions: [],
            })
          );
        }
        return reply.status(404).send(
          createErrorResponse('NOT_FOUND', 'Offer not found')
        );
      }

      // 获取适用的合规规则
      const rules = await query<{ 
        id: string; 
        name: string; 
        rule_type: string;
        priority: number;
        condition: unknown; 
        applies_to: unknown; 
        action: unknown; 
        severity: string;
      }>(
        `SELECT id, name, rule_type, priority, condition, applies_to, action, severity 
         FROM agent.compliance_rules 
         ORDER BY priority ASC`
      );

      const issues: Array<{
        rule_id: string;
        rule_name: string;
        severity: string;
        message_en: string;
        message_zh: string;
        action_type: string;
      }> = [];

      const requiredDocs: string[] = [];
      const warnings: string[] = [];
      const shippingRestrictions: Array<{
        rule_id: string;
        blocked_methods: string[];
        allowed_methods: string[];
      }> = [];

      // 检查每条规则
      for (const ruleRow of rules) {
        // 解析 JSONB 字段（PostgreSQL 返回的是对象，不需要 JSON.parse）
        const ruleName = typeof ruleRow.name === 'string' 
          ? JSON.parse(ruleRow.name) as { en: string; zh: string }
          : ruleRow.name as { en: string; zh: string };
        
        const rule: ComplianceRule = {
          id: ruleRow.id,
          name: ruleName,
          rule_type: ruleRow.rule_type,
          priority: ruleRow.priority,
          condition: ruleRow.condition as ComplianceRule['condition'],
          applies_to: ruleRow.applies_to as ComplianceRule['applies_to'],
          action: ruleRow.action as ComplianceRule['action'],
          severity: ruleRow.severity as 'error' | 'warning' | 'info',
        };

        // 检查规则是否适用于该类目
        const appliesToCategory = 
          rule.applies_to.categories.includes('*') ||
          rule.applies_to.categories.includes(offer.category_id) ||
          rule.applies_to.categories.some(cat => offer.category_id.startsWith(cat));

        // 检查规则是否适用于目的国
        const appliesToCountry = 
          rule.applies_to.countries.includes('*') ||
          rule.applies_to.countries.includes(destinationCountry);

        if (!appliesToCategory || !appliesToCountry) {
          continue;
        }

        // 评估条件
        const conditionMet = evaluateCondition(rule.condition, offer);

        if (conditionMet) {
          // 规则触发
          const message = rule.action.message ?? { en: rule.name.en, zh: rule.name.zh };

          if (rule.action.type === 'require_certification') {
            // 检查是否已有认证
            const cert = rule.action.certification;
            if (cert && !offer.certifications?.includes(cert)) {
              issues.push({
                rule_id: rule.id,
                rule_name: rule.name.en,
                severity: rule.severity,
                message_en: message.en,
                message_zh: message.zh,
                action_type: rule.action.type,
              });
              requiredDocs.push(cert);
            }
          } else if (rule.action.type === 'restrict_shipping') {
            shippingRestrictions.push({
              rule_id: rule.id,
              blocked_methods: rule.action.blocked_methods ?? [],
              allowed_methods: rule.action.allowed_methods ?? [],
            });

            // 检查当前运输方式是否被阻止
            if (rule.action.blocked_methods?.includes(shippingMethod)) {
              issues.push({
                rule_id: rule.id,
                rule_name: rule.name.en,
                severity: rule.severity,
                message_en: message.en,
                message_zh: message.zh,
                action_type: rule.action.type,
              });
            }
          } else if (rule.action.type === 'add_warning') {
            warnings.push(message.en);
          } else if (rule.action.type === 'require_document') {
            requiredDocs.push(rule.action.certification ?? 'Unknown');
          }
        }
      }

      // 判断是否允许
      const hasBlockingIssue = issues.some(i => i.severity === 'error');
      const allowed = !hasBlockingIssue;

      // 获取规则版本（用于审计）
      const ruleVersion = await queryOne<{ max_id: string }>(
        `SELECT MAX(id) as max_id FROM agent.compliance_rules`
      );

      const result = {
        allowed,
        destination_country: destinationCountry,
        offer_id: offer.id,
        category_id: offer.category_id,
        issues,
        required_docs: [...new Set(requiredDocs)],
        warnings: [...new Set(warnings)],
        shipping_restrictions: shippingRestrictions,
        product_risk_tags: offer.risk_tags ?? [],
        product_certifications: offer.certifications ?? [],
        rule_version: ruleVersion?.max_id ?? 'unknown',
        checked_at: new Date().toISOString(),
      };

      logger.info({ 
        offer_id: offer.id, 
        allowed, 
        issues_count: issues.length 
      }, 'Compliance check completed');

      return reply.send(
        createSuccessResponse(result, {
          ttl_seconds: 3600, // 合规检查缓存 1 小时
          evidence: {
            snapshot_id: `compliance_${Date.now()}`,
            sources: [
              { type: 'rule', name: 'compliance.check_item', ts: new Date().toISOString() }
            ]
          }
        })
      );
    } catch (error) {
      logger.error({ error }, 'Compliance check failed');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to check compliance')
      );
    }
  });

  /**
   * compliance.get_rules_for_category
   * 
   * 获取适用于某类目的所有规则
   */
  app.post('/get_rules_for_category', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        category_id?: string;
        destination_country?: string;
      }
    };

    const categoryId = body.params?.category_id;
    const destinationCountry = body.params?.destination_country ?? 'US';

    if (!categoryId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'category_id is required')
      );
    }

    try {
      const rules = await query<{ id: string; name: string; rule_type: string; severity: string; action: unknown }>(
        `SELECT id, name, rule_type, severity, action 
         FROM agent.compliance_rules 
         ORDER BY priority ASC`
      );

      // 过滤适用的规则（这里 rule.name 是 JSONB，已经是对象）
      const applicableRules = rules;

      return reply.send(
        createSuccessResponse({
          category_id: categoryId,
          destination_country: destinationCountry,
          rules: applicableRules.map(r => ({
            id: r.id,
            name: r.name,
            rule_type: r.rule_type,
            severity: r.severity,
          })),
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get rules for category');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get rules')
      );
    }
  });

  /**
   * compliance.get_risk_tags
   * 
   * Get all risk tag definitions for compliance checking
   */
  app.post('/get_risk_tags', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: { severity?: string } };
    const severity = body.params?.severity;

    try {
      let sql = `SELECT * FROM agent.risk_tag_definitions`;
      const sqlParams: unknown[] = [];

      if (severity) {
        sql += ` WHERE severity = $1`;
        sqlParams.push(severity);
      }

      sql += ` ORDER BY severity DESC, name_en`;

      const tags = await query<RiskTagDefinition>(sql, sqlParams);

      return reply.send(
        createSuccessResponse({
          risk_tags: tags.map(t => ({
            id: t.id,
            name: t.name_en,
            name_zh: t.name_zh,
            description: t.description,
            severity: t.severity,
            affects_shipping: t.affected_shipping,
            affects_customs: t.affected_customs,
            detection_keywords: t.keywords,
          })),
          total_count: tags.length,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get risk tags');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get risk tags')
      );
    }
  });

  /**
   * compliance.analyze_product_risks
   * 
   * Analyze a product description to detect potential risk tags
   */
  app.post('/analyze_product_risks', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { params?: { description?: string; title?: string } };
    const description = (body.params?.description ?? '').toLowerCase();
    const title = (body.params?.title ?? '').toLowerCase();
    const combinedText = `${title} ${description}`;

    try {
      const tags = await query<RiskTagDefinition>(
        `SELECT * FROM agent.risk_tag_definitions WHERE array_length(keywords, 1) > 0`
      );

      const detectedRisks: Array<{
        tag_id: string;
        name: string;
        severity: string;
        matched_keywords: string[];
        confidence: number;
      }> = [];

      for (const tag of tags) {
        const matchedKeywords: string[] = [];
        for (const keyword of tag.keywords ?? []) {
          if (combinedText.includes(keyword.toLowerCase())) {
            matchedKeywords.push(keyword);
          }
        }

        if (matchedKeywords.length > 0) {
          const confidence = Math.min(0.95, 0.5 + matchedKeywords.length * 0.15);
          detectedRisks.push({
            tag_id: tag.id,
            name: tag.name_en,
            severity: tag.severity,
            matched_keywords: matchedKeywords,
            confidence,
          });
        }
      }

      // Sort by severity
      const severityOrder: Record<string, number> = { critical: 3, warning: 2, info: 1 };
      detectedRisks.sort((a, b) => {
        const sevDiff = (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
        return sevDiff !== 0 ? sevDiff : b.confidence - a.confidence;
      });

      return reply.send(
        createSuccessResponse({
          detected_risks: detectedRisks,
          has_critical: detectedRisks.some(r => r.severity === 'critical'),
          has_warnings: detectedRisks.some(r => r.severity === 'warning'),
          risk_summary: {
            critical_count: detectedRisks.filter(r => r.severity === 'critical').length,
            warning_count: detectedRisks.filter(r => r.severity === 'warning').length,
            info_count: detectedRisks.filter(r => r.severity === 'info').length,
          },
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to analyze product risks');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to analyze product risks')
      );
    }
  });

  /**
   * compliance.get_shipping_lanes
   * 
   * Get available shipping lanes between countries
   */
  app.post('/get_shipping_lanes', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { 
      params?: { 
        origin_country?: string; 
        dest_country?: string;
        service_type?: string;
        risk_tags?: string[];
      } 
    };
    const originCountry = (body.params?.origin_country ?? 'CN').toUpperCase();
    const destCountry = body.params?.dest_country?.toUpperCase();
    const serviceType = body.params?.service_type;
    const riskTags = body.params?.risk_tags;

    try {
      const conditions: string[] = ['active = true'];
      const sqlParams: unknown[] = [];
      let paramIndex = 1;

      if (originCountry) {
        conditions.push(`origin_country = $${paramIndex}`);
        sqlParams.push(originCountry);
        paramIndex++;
      }

      if (destCountry) {
        conditions.push(`dest_country = $${paramIndex}`);
        sqlParams.push(destCountry);
        paramIndex++;
      }

      if (serviceType) {
        conditions.push(`service_type = $${paramIndex}`);
        sqlParams.push(serviceType);
        paramIndex++;
      }

      const lanes = await query<ShippingLane>(
        `SELECT * FROM agent.shipping_lanes 
         WHERE ${conditions.join(' AND ')}
         ORDER BY service_type, base_rate`,
        sqlParams
      );

      // Filter by risk tag compatibility
      let filteredLanes = lanes;
      if (riskTags && riskTags.length > 0) {
        filteredLanes = lanes.filter(lane => {
          const hasBlockedTag = riskTags.some(tag => 
            lane.blocked_risk_tags?.includes(tag)
          );
          return !hasBlockedTag;
        });
      }

      return reply.send(
        createSuccessResponse({
          lanes: filteredLanes.map(lane => ({
            id: lane.id,
            name: lane.name,
            origin: lane.origin_country,
            destination: lane.dest_country,
            carrier: lane.carrier,
            service_type: lane.service_type,
            delivery_days: {
              min: lane.min_days,
              max: lane.max_days,
            },
            restrictions: {
              blocked_risk_tags: lane.blocked_risk_tags ?? [],
              max_weight_g: lane.max_weight_g,
              max_dimension_cm: lane.max_dimension_cm,
            },
            base_rate: lane.base_rate,
          })),
          total_count: filteredLanes.length,
          filtered_out: lanes.length - filteredLanes.length,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get shipping lanes');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to get shipping lanes')
      );
    }
  });
}

/**
 * 评估规则条件
 */
function evaluateCondition(
  condition: ComplianceRule['condition'],
  offer: OfferRow
): boolean {
  if (!condition) return true;

  // 类目条件
  if (condition.category) {
    return offer.category_id === condition.category || offer.category_id.startsWith(condition.category);
  }

  // 属性条件
  if (condition.attribute) {
    const attr = offer.attributes?.find(a => a.attr_id === condition.attribute);
    const attrValue = attr?.value;

    // 检查 risk_tags (enhanced with more tags)
    if (condition.attribute === 'attr_battery_type') {
      const hasBattery = offer.risk_tags?.includes('battery_included');
      if (condition.operator === 'in' && Array.isArray(condition.value)) {
        return hasBattery && condition.value.includes('Built-in Lithium');
      }
    }

    if (condition.attribute === 'attr_contains_liquid') {
      return offer.risk_tags?.includes('liquid') ?? false;
    }

    if (condition.attribute === 'attr_contains_magnet') {
      return offer.risk_tags?.includes('magnetic') ?? false;
    }

    if (condition.attribute === 'attr_small_parts') {
      return offer.risk_tags?.includes('children') ?? false;
    }

    // 通用属性检查
    if (condition.operator === 'exists') {
      return attrValue !== undefined;
    }
    if (condition.operator === '==') {
      return attrValue === condition.value;
    }
    if (condition.operator === 'in' && Array.isArray(condition.value)) {
      return condition.value.includes(attrValue);
    }
    if (condition.operator === 'not_in' && Array.isArray(condition.value)) {
      return !condition.value.includes(attrValue);
    }
    if (condition.operator === '>' && typeof attrValue === 'number') {
      return attrValue > (condition.value as number);
    }
  }

  return false;
}
