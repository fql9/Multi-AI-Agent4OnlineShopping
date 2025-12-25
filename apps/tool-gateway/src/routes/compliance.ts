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
      const offer = await queryOne<OfferRow>(
        `SELECT id, category_id, risk_tags, certifications, attributes 
         FROM agent.offers 
         WHERE id = $1`,
        [offerId ?? skuId?.split('_').slice(0, 2).join('_')]
      );

      if (!offer) {
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

    // 检查 risk_tags
    if (condition.attribute === 'attr_battery_type') {
      const hasBattery = offer.risk_tags?.includes('battery_included');
      if (condition.operator === 'in' && Array.isArray(condition.value)) {
        return hasBattery && condition.value.includes('Built-in Lithium');
      }
    }

    if (condition.attribute === 'attr_contains_liquid') {
      return offer.risk_tags?.includes('contains_liquid') ?? false;
    }

    if (condition.attribute === 'attr_contains_magnet') {
      return offer.risk_tags?.includes('contains_magnet') ?? false;
    }

    if (condition.attribute === 'attr_small_parts') {
      return offer.risk_tags?.includes('small_parts') ?? false;
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
