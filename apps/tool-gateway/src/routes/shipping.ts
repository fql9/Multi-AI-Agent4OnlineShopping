/**
 * Shipping Tool Routes - 物流工具
 * 
 * 实现:
 * - shipping.validate_address: 验证地址
 * - shipping.quote_options: 获取运输报价
 * - shipping.estimate_delivery: 估算送达时间
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, createLogger, query } from '@shopping-agent/common';

const logger = createLogger('shipping');

// 支持的国家列表
const SUPPORTED_COUNTRIES = new Set([
  'US', 'CA', 'GB', 'DE', 'FR', 'IT', 'ES', 'JP', 'AU', 'CN', 
  'KR', 'SG', 'HK', 'TW', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI'
]);

// 运输方式配置
const SHIPPING_OPTIONS = {
  standard: {
    id: 'ship_standard',
    name: 'Standard Shipping',
    carrier: 'Various',
    service_level: 'standard',
    base_cost: 5.99,
    cost_per_kg: 2.00,
    eta_min_days: 7,
    eta_max_days: 14,
    tracking_supported: true,
  },
  express: {
    id: 'ship_express',
    name: 'Express Shipping',
    carrier: 'DHL/FedEx',
    service_level: 'express',
    base_cost: 15.99,
    cost_per_kg: 5.00,
    eta_min_days: 3,
    eta_max_days: 5,
    tracking_supported: true,
  },
  economy: {
    id: 'ship_economy',
    name: 'Economy Shipping',
    carrier: 'Various',
    service_level: 'economy',
    base_cost: 2.99,
    cost_per_kg: 1.00,
    eta_min_days: 14,
    eta_max_days: 30,
    tracking_supported: false,
  },
};

// 国家运输时间调整（相对于基础时间）
const COUNTRY_ADJUSTMENTS: Record<string, { etaAdjust: number; costMultiplier: number }> = {
  US: { etaAdjust: 0, costMultiplier: 1.0 },
  CA: { etaAdjust: 1, costMultiplier: 1.1 },
  GB: { etaAdjust: 2, costMultiplier: 1.2 },
  DE: { etaAdjust: 2, costMultiplier: 1.2 },
  FR: { etaAdjust: 2, costMultiplier: 1.2 },
  JP: { etaAdjust: 1, costMultiplier: 1.3 },
  AU: { etaAdjust: 3, costMultiplier: 1.5 },
  CN: { etaAdjust: -1, costMultiplier: 0.9 },
};

interface ShippingItem {
  sku_id: string;
  qty: number;
  weight_g?: number;
}

export async function shippingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * shipping.validate_address
   * 
   * 验证并标准化地址
   */
  app.post('/validate_address', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { 
      params?: { 
        country?: string;
        state?: string;
        city?: string;
        postal_code?: string;
        address_line1?: string;
        address_line2?: string;
      } 
    };
    const params = body.params ?? {};

    const country = params.country?.toUpperCase() ?? 'US';
    
    logger.info({ country }, 'Validating address');

    // 检查是否支持该国家
    if (!SUPPORTED_COUNTRIES.has(country)) {
      return reply.send(
        createSuccessResponse({
          is_valid: false,
          is_deliverable: false,
          errors: [`Country ${country} is not supported`],
          suggestions: Array.from(SUPPORTED_COUNTRIES).slice(0, 10),
        })
      );
    }

    // 验证必填字段
    const errors: string[] = [];
    if (!params.postal_code) errors.push('Postal code is required');
    if (!params.address_line1) errors.push('Address line 1 is required');
    if (!params.city) errors.push('City is required');

    if (errors.length > 0) {
      return reply.send(
        createSuccessResponse({
          is_valid: false,
          is_deliverable: false,
          errors,
          suggestions: [],
        })
      );
    }

    // 标准化地址
    const normalizedAddress = {
      country: country,
      state: params.state?.toUpperCase() ?? '',
      city: params.city ?? '',
      postal_code: params.postal_code ?? '',
      address_line1: params.address_line1 ?? '',
      address_line2: params.address_line2 ?? '',
    };

    // 简单的邮编验证
    const postalCodeValid = validatePostalCode(country, params.postal_code ?? '');

    return reply.send(
      createSuccessResponse({
        is_valid: postalCodeValid,
        is_deliverable: postalCodeValid,
        normalized_address: normalizedAddress,
        errors: postalCodeValid ? [] : ['Invalid postal code format'],
        address_type: 'residential', // 假设都是住宅地址
        is_po_box: false,
        is_remote: false,
        additional_fees: 0,
      })
    );
  });

  /**
   * shipping.quote_options
   * 
   * 获取运输选项和报价
   */
  app.post('/quote_options', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: { 
        items?: ShippingItem[];
        destination_country?: string;
        destination_postal_code?: string;
      };
    };
    const params = body.params ?? {};
    const items = params.items ?? [];
    const destinationCountry = params.destination_country?.toUpperCase() ?? 'US';

    logger.info({ 
      items_count: items.length, 
      destination: destinationCountry 
    }, 'Quoting shipping options');

    // 检查是否支持该国家
    if (!SUPPORTED_COUNTRIES.has(destinationCountry)) {
      return reply.status(400).send(
        createErrorResponse('ADDRESS_INVALID', `Shipping to ${destinationCountry} is not supported`)
      );
    }

    try {
      // 计算总重量
      let totalWeightG = 0;
      const skuIds = items.map(item => item.sku_id);
      
      if (skuIds.length > 0) {
        // 从数据库获取商品重量
        const offers = await query<{ id: string; weight_g: number }>(
          `SELECT o.id, o.weight_g 
           FROM agent.offers o
           JOIN agent.skus s ON s.offer_id = o.id
           WHERE s.id = ANY($1)`,
          [skuIds]
        );

        for (const item of items) {
          const offer = offers.find(o => o.id === item.sku_id.split('_').slice(0, 2).join('_'));
          const weight = item.weight_g ?? offer?.weight_g ?? 500; // 默认 500g
          totalWeightG += weight * item.qty;
        }
      } else {
        totalWeightG = 500; // 默认重量
      }

      const totalWeightKg = totalWeightG / 1000;

      // 获取国家调整系数
      const adjustment = COUNTRY_ADJUSTMENTS[destinationCountry] ?? { etaAdjust: 3, costMultiplier: 1.5 };

      // 检查是否有受限商品（电池、液体等）
      const restrictedItems = await checkItemRestrictions(skuIds);

      // 生成运输选项
      const options = Object.values(SHIPPING_OPTIONS).map(option => {
        // 计算价格
        const baseCost = option.base_cost * adjustment.costMultiplier;
        const weightCost = option.cost_per_kg * totalWeightKg * adjustment.costMultiplier;
        const totalCost = Math.round((baseCost + weightCost) * 100) / 100;

        // 计算时间
        const etaMin = option.eta_min_days + adjustment.etaAdjust;
        const etaMax = option.eta_max_days + adjustment.etaAdjust;

        // 检查限制
        const constraints: string[] = [];
        if (restrictedItems.hasBattery && option.service_level === 'express') {
          constraints.push('Battery items may have additional delays');
        }
        if (restrictedItems.hasLiquid) {
          constraints.push('Liquid items have volume restrictions');
        }

        return {
          shipping_option_id: option.id,
          name: option.name,
          carrier: option.carrier,
          service_level: option.service_level,
          price: totalCost,
          currency: 'USD',
          eta_min_days: Math.max(1, etaMin),
          eta_max_days: Math.max(3, etaMax),
          tracking_supported: option.tracking_supported,
          constraints,
          is_available: true,
        };
      });

      // 按价格排序
      options.sort((a, b) => a.price - b.price);

      return reply.send(
        createSuccessResponse({
          destination_country: destinationCountry,
          total_weight_g: totalWeightG,
          items_count: items.length,
          options,
          restrictions: restrictedItems,
          quote_expire_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }, {
          ttl_seconds: 300,
        })
      );
    } catch (error) {
      logger.error({ error }, 'Failed to quote shipping options');
      return reply.status(500).send(
        createErrorResponse('INTERNAL_ERROR', 'Failed to quote shipping options')
      );
    }
  });

  /**
   * shipping.get_delivery_estimate
   * 
   * 获取特定运输选项的送达时间估算
   */
  app.post('/get_delivery_estimate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      params?: {
        shipping_option_id?: string;
        destination_country?: string;
      }
    };

    const shippingOptionId = body.params?.shipping_option_id;
    const destinationCountry = body.params?.destination_country?.toUpperCase() ?? 'US';

    if (!shippingOptionId) {
      return reply.status(400).send(
        createErrorResponse('INVALID_ARGUMENT', 'shipping_option_id is required')
      );
    }

    // 查找运输选项
    const optionKey = Object.keys(SHIPPING_OPTIONS).find(
      key => SHIPPING_OPTIONS[key as keyof typeof SHIPPING_OPTIONS].id === shippingOptionId
    );

    if (!optionKey) {
      return reply.status(404).send(
        createErrorResponse('NOT_FOUND', 'Shipping option not found')
      );
    }

    const option = SHIPPING_OPTIONS[optionKey as keyof typeof SHIPPING_OPTIONS];
    const adjustment = COUNTRY_ADJUSTMENTS[destinationCountry] ?? { etaAdjust: 3, costMultiplier: 1.5 };

    const now = new Date();
    const etaMin = new Date(now);
    etaMin.setDate(etaMin.getDate() + option.eta_min_days + adjustment.etaAdjust);
    const etaMax = new Date(now);
    etaMax.setDate(etaMax.getDate() + option.eta_max_days + adjustment.etaAdjust);

    return reply.send(
      createSuccessResponse({
        shipping_option_id: shippingOptionId,
        destination_country: destinationCountry,
        estimated_delivery: {
          min_date: etaMin.toISOString().split('T')[0],
          max_date: etaMax.toISOString().split('T')[0],
          min_days: option.eta_min_days + adjustment.etaAdjust,
          max_days: option.eta_max_days + adjustment.etaAdjust,
        },
        carrier: option.carrier,
        tracking_supported: option.tracking_supported,
      })
    );
  });
}

/**
 * 验证邮编格式
 */
function validatePostalCode(country: string, postalCode: string): boolean {
  const patterns: Record<string, RegExp> = {
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,
    GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
    DE: /^\d{5}$/,
    FR: /^\d{5}$/,
    JP: /^\d{3}-?\d{4}$/,
    AU: /^\d{4}$/,
    CN: /^\d{6}$/,
  };

  const pattern = patterns[country];
  if (!pattern) return postalCode.length > 0; // 其他国家只检查非空
  return pattern.test(postalCode);
}

/**
 * 检查商品运输限制
 */
async function checkItemRestrictions(skuIds: string[]): Promise<{
  hasBattery: boolean;
  hasLiquid: boolean;
  hasMagnet: boolean;
  restrictions: string[];
}> {
  if (skuIds.length === 0) {
    return { hasBattery: false, hasLiquid: false, hasMagnet: false, restrictions: [] };
  }

  try {
    const offers = await query<{ risk_tags: string[] }>(
      `SELECT o.risk_tags 
       FROM agent.offers o
       JOIN agent.skus s ON s.offer_id = o.id
       WHERE s.id = ANY($1)`,
      [skuIds]
    );

    const allRiskTags = offers.flatMap(o => o.risk_tags ?? []);
    
    return {
      hasBattery: allRiskTags.includes('battery_included'),
      hasLiquid: allRiskTags.includes('contains_liquid'),
      hasMagnet: allRiskTags.includes('contains_magnet'),
      restrictions: [...new Set(allRiskTags)],
    };
  } catch {
    return { hasBattery: false, hasLiquid: false, hasMagnet: false, restrictions: [] };
  }
}
