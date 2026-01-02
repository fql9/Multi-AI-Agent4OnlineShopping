/**
 * Shipping Tools
 * 
 * Enhanced with shipping_lanes from database for real routing
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { query, queryOne } from '../db.js';

// ============================================================
// Types
// ============================================================

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

interface SkuRow {
  id: string;
  offer_id: string;
  price: number;
  stock: number;
  risk_tags: string[] | null;
}

interface OfferRow {
  id: string;
  weight_g: number;
  dimensions_mm: { l: number; w: number; h: number };
  risk_tags: string[] | null;
}

// ============================================================
// Tool Definitions
// ============================================================

export const shippingTools: Tool[] = [
  {
    name: 'shipping.validate_address',
    description: 'Validate and normalize shipping address',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string' },
        state: { type: 'string' },
        city: { type: 'string' },
        postal_code: { type: 'string' },
        address_line1: { type: 'string' },
      },
      required: ['country'],
    },
  },
  {
    name: 'shipping.quote_options',
    description: 'Get available shipping options and quotes based on shipping lanes',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku_id: { type: 'string' },
              qty: { type: 'integer' },
            },
          },
        },
        destination: {
          type: 'object',
          properties: {
            country: { type: 'string' },
            postal_code: { type: 'string' },
          },
        },
        origin_country: { type: 'string', default: 'CN' },
      },
      required: ['items'],
    },
  },
  {
    name: 'shipping.get_available_lanes',
    description: 'Get all available shipping lanes for a route',
    inputSchema: {
      type: 'object',
      properties: {
        origin_country: { type: 'string', default: 'CN' },
        dest_country: { type: 'string' },
        service_type: { type: 'string', enum: ['express', 'standard', 'economy'] },
      },
      required: ['dest_country'],
    },
  },
  {
    name: 'shipping.check_weight_limit',
    description: 'Check if items exceed shipping weight limits',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku_id: { type: 'string' },
              qty: { type: 'integer' },
            },
          },
        },
        shipping_lane_id: { type: 'string' },
      },
      required: ['items', 'shipping_lane_id'],
    },
  },
];

// ============================================================
// Tool Handlers
// ============================================================

/**
 * Validate address
 */
async function validateAddress(params: Record<string, unknown>): Promise<unknown> {
  const country = String(params.country || 'US').toUpperCase();
  
  // Check if we have any shipping lanes to this country
  const hasLanes = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM agent.shipping_lanes WHERE dest_country = $1 AND active = true`,
    [country]
  );
  
  const isDeliverable = parseInt(hasLanes?.count ?? '0') > 0;

  return {
    normalized_address: {
      country: country,
      state: params.state ?? '',
      city: params.city ?? '',
      postal_code: params.postal_code ?? '',
      address_line1: params.address_line1 ?? '',
    },
    is_deliverable: isDeliverable,
    delivery_zones_available: parseInt(hasLanes?.count ?? '0'),
    suggestions: isDeliverable ? [] : ['This destination may not be supported'],
  };
}

/**
 * Get shipping quotes based on shipping_lanes table
 */
async function quoteOptions(params: Record<string, unknown>): Promise<unknown> {
  const items = params.items as Array<{ sku_id: string; qty: number }> | undefined;
  const destination = params.destination as { country?: string; postal_code?: string } | undefined;
  const originCountry = String(params.origin_country || 'CN').toUpperCase();
  const destCountry = String(destination?.country || 'US').toUpperCase();

  if (!items || items.length === 0) {
    return { error: { code: 'INVALID_ARGUMENT', message: 'items array is required' } };
  }

  console.log('[shipping.quote_options] Getting quotes:', { items, originCountry, destCountry });

  // Get item details to calculate weight and check risk tags
  let totalWeight = 0;
  const allRiskTags: Set<string> = new Set();

  for (const item of items) {
    const sku = await queryOne<SkuRow>(
      `SELECT s.id, s.offer_id, s.price, s.stock, s.risk_tags 
       FROM agent.skus s WHERE s.id = $1`,
      [item.sku_id]
    );

    if (sku) {
      const offer = await queryOne<OfferRow>(
        `SELECT weight_g, dimensions_mm, risk_tags FROM agent.offers WHERE id = $1`,
        [sku.offer_id]
      );

      if (offer) {
        totalWeight += (offer.weight_g ?? 0) * item.qty;
        (offer.risk_tags ?? []).forEach(t => allRiskTags.add(t));
        (sku.risk_tags ?? []).forEach(t => allRiskTags.add(t));
      }
    }
  }

  const riskTagsArray = Array.from(allRiskTags);

  // Get available shipping lanes
  const lanes = await query<ShippingLane>(
    `SELECT * FROM agent.shipping_lanes 
     WHERE origin_country = $1 AND dest_country = $2 AND active = true
     ORDER BY service_type, base_rate`,
    [originCountry, destCountry]
  );

  // Filter lanes based on weight and risk tags
  const options = lanes
    .filter(lane => {
      // Check weight limit
      if (lane.max_weight_g && totalWeight > lane.max_weight_g) return false;
      
      // Check blocked risk tags
      const hasBlockedTag = riskTagsArray.some(tag => 
        lane.blocked_risk_tags?.includes(tag)
      );
      return !hasBlockedTag;
    })
    .map(lane => {
      // Calculate price based on weight and base rate
      const baseRate = parseFloat(String(lane.base_rate ?? 10));
      const weightKg = totalWeight / 1000;
      const price = Math.round((baseRate + weightKg * 2) * 100) / 100;

      return {
        shipping_option_id: lane.id,
        carrier: lane.carrier ?? lane.name,
        service_level: lane.service_type ?? 'standard',
        price,
        currency: 'USD',
        eta_min_days: lane.min_days ?? 7,
        eta_max_days: lane.max_days ?? 14,
        tracking_supported: true,
        restrictions: {
          max_weight_g: lane.max_weight_g,
          blocked_risk_tags: lane.blocked_risk_tags,
        },
      };
    });

  // If no database lanes available, return defaults
  if (options.length === 0) {
    return {
      options: [
        {
          shipping_option_id: 'ship_standard',
          carrier: 'Standard Shipping',
          service_level: 'standard',
          price: 5.99,
          currency: 'USD',
          eta_min_days: 7,
          eta_max_days: 14,
          tracking_supported: true,
        },
        {
          shipping_option_id: 'ship_express',
          carrier: 'Express Shipping',
          service_level: 'express',
          price: 15.99,
          currency: 'USD',
          eta_min_days: 3,
          eta_max_days: 5,
          tracking_supported: true,
        },
      ],
      quote_expire_at: new Date(Date.now() + 300000).toISOString(),
      source: 'default',
    };
  }

  return {
    options,
    total_weight_g: totalWeight,
    item_risk_tags: riskTagsArray,
    quote_expire_at: new Date(Date.now() + 300000).toISOString(),
    source: 'database',
  };
}

/**
 * Get available shipping lanes
 */
async function getAvailableLanes(params: Record<string, unknown>): Promise<unknown> {
  const originCountry = String(params.origin_country || 'CN').toUpperCase();
  const destCountry = String(params.dest_country || '').toUpperCase();
  const serviceType = params.service_type as string | undefined;

  const conditions: string[] = ['active = true'];
  const values: unknown[] = [];
  let paramIndex = 1;

  conditions.push(`origin_country = $${paramIndex}`);
  values.push(originCountry);
  paramIndex++;

  if (destCountry) {
    conditions.push(`dest_country = $${paramIndex}`);
    values.push(destCountry);
    paramIndex++;
  }

  if (serviceType) {
    conditions.push(`service_type = $${paramIndex}`);
    values.push(serviceType);
    paramIndex++;
  }

  const lanes = await query<ShippingLane>(
    `SELECT * FROM agent.shipping_lanes 
     WHERE ${conditions.join(' AND ')}
     ORDER BY service_type, base_rate`,
    values
  );

  return {
    lanes: lanes.map(lane => ({
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
      base_rate: lane.base_rate,
      restrictions: {
        max_weight_g: lane.max_weight_g,
        max_dimension_cm: lane.max_dimension_cm,
        blocked_risk_tags: lane.blocked_risk_tags ?? [],
      },
    })),
    total_count: lanes.length,
  };
}

/**
 * Check weight limit against a specific shipping lane
 */
async function checkWeightLimit(params: Record<string, unknown>): Promise<unknown> {
  const items = params.items as Array<{ sku_id: string; qty: number }> | undefined;
  const laneId = String(params.shipping_lane_id || '').trim();

  if (!items || !laneId) {
    return { error: { code: 'INVALID_ARGUMENT', message: 'items and shipping_lane_id are required' } };
  }

  // Get lane limits
  const lane = await queryOne<ShippingLane>(
    `SELECT * FROM agent.shipping_lanes WHERE id = $1`,
    [laneId]
  );

  if (!lane) {
    return { error: { code: 'NOT_FOUND', message: `Shipping lane ${laneId} not found` } };
  }

  // Calculate total weight
  let totalWeight = 0;
  const itemWeights: Array<{ sku_id: string; weight_g: number; qty: number }> = [];

  for (const item of items) {
    const sku = await queryOne<SkuRow>(
      `SELECT s.id, s.offer_id FROM agent.skus s WHERE s.id = $1`,
      [item.sku_id]
    );

    if (sku) {
      const offer = await queryOne<OfferRow>(
        `SELECT weight_g FROM agent.offers WHERE id = $1`,
        [sku.offer_id]
      );

      const weight = (offer?.weight_g ?? 0) * item.qty;
      totalWeight += weight;
      itemWeights.push({
        sku_id: item.sku_id,
        weight_g: offer?.weight_g ?? 0,
        qty: item.qty,
      });
    }
  }

  const maxWeight = lane.max_weight_g ?? 50000;
  const withinLimit = totalWeight <= maxWeight;

  return {
    lane_id: laneId,
    lane_name: lane.name,
    max_weight_g: maxWeight,
    total_weight_g: totalWeight,
    within_limit: withinLimit,
    excess_weight_g: withinLimit ? 0 : totalWeight - maxWeight,
    item_weights: itemWeights,
  };
}

// ============================================================
// Main Handler
// ============================================================

export function handleShippingTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;

    switch (tool) {
      case 'validate_address':
        return validateAddress(p);

      case 'quote_options':
        return quoteOptions(p);

      case 'get_available_lanes':
        return getAvailableLanes(p);

      case 'check_weight_limit':
        return checkWeightLimit(p);

      default:
        throw new Error(`Unknown shipping tool: ${tool}`);
    }
  };
}

