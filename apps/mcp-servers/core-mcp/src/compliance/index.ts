/**
 * Compliance Tools
 * 
 * Enhanced with risk_tag_definitions and shipping_lanes from database
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { query, queryOne } from '../db.js';

// ============================================================
// Types
// ============================================================

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

interface SkuRow {
  id: string;
  offer_id: string;
  risk_tags: string[] | null;
  weight_g: number | null;
}

interface OfferRow {
  id: string;
  risk_tags: string[] | null;
  weight_g: number;
  dimensions_mm: { l: number; w: number; h: number };
}

// ============================================================
// Tool Definitions
// ============================================================

export const complianceTools: Tool[] = [
  {
    name: 'compliance.check_item',
    description: 'Check if an item can be shipped to destination based on risk tags and shipping lane restrictions',
    inputSchema: {
      type: 'object',
      properties: {
        sku_id: { type: 'string', description: 'SKU ID to check' },
        destination_country: { type: 'string', description: 'ISO 2-letter destination country code' },
        shipping_option_id: { type: 'string', description: 'Optional specific shipping lane to check' },
        origin_country: { type: 'string', default: 'CN', description: 'Origin country code' },
      },
      required: ['sku_id', 'destination_country'],
    },
  },
  {
    name: 'compliance.policy_ruleset_version',
    description: 'Get current compliance policy version',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'compliance.get_risk_tags',
    description: 'Get all risk tag definitions for compliance checking',
    inputSchema: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['info', 'warning', 'critical'], description: 'Filter by severity' },
      },
    },
  },
  {
    name: 'compliance.analyze_product_risks',
    description: 'Analyze a product description to detect potential risk tags',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Product description text' },
        title: { type: 'string', description: 'Product title' },
      },
      required: ['description'],
    },
  },
  {
    name: 'compliance.get_shipping_lanes',
    description: 'Get available shipping lanes between countries',
    inputSchema: {
      type: 'object',
      properties: {
        origin_country: { type: 'string', default: 'CN' },
        dest_country: { type: 'string', description: 'Destination country code' },
        service_type: { type: 'string', enum: ['express', 'standard', 'economy'] },
        risk_tags: { type: 'array', items: { type: 'string' }, description: 'Risk tags to check compatibility' },
      },
    },
  },
];

// ============================================================
// Tool Handlers
// ============================================================

/**
 * Check item compliance for shipping
 */
async function checkItem(params: Record<string, unknown>): Promise<unknown> {
  const skuId = String(params.sku_id || '').trim();
  const destCountry = String(params.destination_country || '').trim().toUpperCase();
  const originCountry = String(params.origin_country || 'CN').trim().toUpperCase();
  const shippingOptionId = params.shipping_option_id as string | undefined;

  if (!skuId || !destCountry) {
    return { error: { code: 'INVALID_ARGUMENT', message: 'sku_id and destination_country are required' } };
  }

  console.log('[compliance.check_item] Checking:', { skuId, destCountry, originCountry });

  // Get SKU and offer risk tags
  const sku = await queryOne<SkuRow>(
    `SELECT s.id, s.offer_id, s.risk_tags, o.weight_g
     FROM agent.skus s
     JOIN agent.offers o ON s.offer_id = o.id
     WHERE s.id = $1`,
    [skuId]
  );

  if (!sku) {
    return { error: { code: 'NOT_FOUND', message: `SKU ${skuId} not found` } };
  }

  // Get offer for additional risk info
  const offer = await queryOne<OfferRow>(
    `SELECT id, risk_tags, weight_g, dimensions_mm FROM agent.offers WHERE id = $1`,
    [sku.offer_id]
  );

  // Combine risk tags from SKU and offer
  const itemRiskTags = [...new Set([
    ...(sku.risk_tags ?? []),
    ...(offer?.risk_tags ?? []),
  ])];

  console.log('[compliance.check_item] Item risk tags:', itemRiskTags);

  // Get applicable shipping lanes
  let lanesQuery = `
    SELECT * FROM agent.shipping_lanes 
    WHERE origin_country = $1 AND dest_country = $2 AND active = true
  `;
  const lanesParams: unknown[] = [originCountry, destCountry];

  if (shippingOptionId) {
    lanesQuery += ` AND id = $3`;
    lanesParams.push(shippingOptionId);
  }

  const lanes = await query<ShippingLane>(lanesQuery, lanesParams);

  if (lanes.length === 0) {
    return {
      allowed: false,
      reason_codes: ['NO_SHIPPING_LANE'],
      message: `No shipping lanes available from ${originCountry} to ${destCountry}`,
      available_lanes: [],
      blocked_by: [],
      required_docs: [],
      mitigations: [],
      ruleset_version: 'cr_2025_01_02',
    };
  }

  // Check each lane for compatibility
  const availableLanes: Array<{
    lane_id: string;
    name: string;
    carrier: string | null;
    service_type: string | null;
    compatible: boolean;
    blocked_tags: string[];
  }> = [];

  const blockedBy: string[] = [];
  let anyLaneAvailable = false;

  for (const lane of lanes) {
    const blockedTags = itemRiskTags.filter(tag => 
      lane.blocked_risk_tags?.includes(tag)
    );

    const isCompatible = blockedTags.length === 0;
    if (isCompatible) anyLaneAvailable = true;

    availableLanes.push({
      lane_id: lane.id,
      name: lane.name,
      carrier: lane.carrier,
      service_type: lane.service_type,
      compatible: isCompatible,
      blocked_tags: blockedTags,
    });

    blockedTags.forEach(tag => {
      if (!blockedBy.includes(tag)) blockedBy.push(tag);
    });
  }

  // Get risk tag details for blocked tags
  let requiredDocs: string[] = [];
  let mitigations: string[] = [];
  const reasonCodes: string[] = [];

  if (blockedBy.length > 0) {
    const riskDefs = await query<RiskTagDefinition>(
      `SELECT * FROM agent.risk_tag_definitions WHERE id = ANY($1)`,
      [blockedBy]
    );

    for (const def of riskDefs) {
      if (def.severity === 'critical') {
        reasonCodes.push(`BLOCKED_${def.id.toUpperCase()}`);
      }
      if (def.affected_customs) {
        requiredDocs.push(`Customs documentation for ${def.name_en}`);
      }
      if (def.affected_shipping) {
        mitigations.push(`Special packaging required for ${def.name_en}`);
      }
    }
  }

  return {
    allowed: anyLaneAvailable,
    item_risk_tags: itemRiskTags,
    reason_codes: reasonCodes,
    blocked_by: blockedBy,
    available_lanes: availableLanes.filter(l => l.compatible),
    incompatible_lanes: availableLanes.filter(l => !l.compatible),
    required_docs: [...new Set(requiredDocs)],
    mitigations: [...new Set(mitigations)],
    ruleset_version: 'cr_2025_01_02',
  };
}

/**
 * Get risk tag definitions
 */
async function getRiskTags(params: Record<string, unknown>): Promise<unknown> {
  const severity = params.severity as string | undefined;

  let sql = `SELECT * FROM agent.risk_tag_definitions`;
  const values: unknown[] = [];

  if (severity) {
    sql += ` WHERE severity = $1`;
    values.push(severity);
  }

  sql += ` ORDER BY severity DESC, name_en`;

  const tags = await query<RiskTagDefinition>(sql, values);

  return {
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
  };
}

/**
 * Analyze product for risk tags
 */
async function analyzeProductRisks(params: Record<string, unknown>): Promise<unknown> {
  const description = String(params.description || '').toLowerCase();
  const title = String(params.title || '').toLowerCase();
  const combinedText = `${title} ${description}`;

  // Get all risk tag definitions with keywords
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
      // Confidence based on keyword match ratio
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

  // Sort by severity and confidence
  const severityOrder: Record<string, number> = { critical: 3, warning: 2, info: 1 };
  detectedRisks.sort((a, b) => {
    const sevDiff = (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
    return sevDiff !== 0 ? sevDiff : b.confidence - a.confidence;
  });

  return {
    detected_risks: detectedRisks,
    has_critical: detectedRisks.some(r => r.severity === 'critical'),
    has_warnings: detectedRisks.some(r => r.severity === 'warning'),
    risk_summary: {
      critical_count: detectedRisks.filter(r => r.severity === 'critical').length,
      warning_count: detectedRisks.filter(r => r.severity === 'warning').length,
      info_count: detectedRisks.filter(r => r.severity === 'info').length,
    },
  };
}

/**
 * Get shipping lanes
 */
async function getShippingLanes(params: Record<string, unknown>): Promise<unknown> {
  const originCountry = String(params.origin_country || 'CN').trim().toUpperCase();
  const destCountry = params.dest_country as string | undefined;
  const serviceType = params.service_type as string | undefined;
  const riskTags = params.risk_tags as string[] | undefined;

  const conditions: string[] = ['active = true'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (originCountry) {
    conditions.push(`origin_country = $${paramIndex}`);
    values.push(originCountry);
    paramIndex++;
  }

  if (destCountry) {
    conditions.push(`dest_country = $${paramIndex}`);
    values.push(destCountry.toUpperCase());
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

  // Filter by risk tag compatibility if specified
  let filteredLanes = lanes;
  if (riskTags && riskTags.length > 0) {
    filteredLanes = lanes.filter(lane => {
      const hasBlockedTag = riskTags.some(tag => 
        lane.blocked_risk_tags?.includes(tag)
      );
      return !hasBlockedTag;
    });
  }

  return {
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
  };
}

// ============================================================
// Main Handler
// ============================================================

export function handleComplianceTool(tool: string) {
  return async (params: unknown): Promise<unknown> => {
    const p = params as Record<string, unknown>;

    switch (tool) {
      case 'check_item':
        return checkItem(p);

      case 'policy_ruleset_version':
        return {
          version: 'cr_2025_01_02',
          valid_from: '2025-01-02T00:00:00Z',
          features: ['risk_tag_definitions', 'shipping_lanes', 'kg_relations'],
        };

      case 'get_risk_tags':
        return getRiskTags(p);

      case 'analyze_product_risks':
        return analyzeProductRisks(p);

      case 'get_shipping_lanes':
        return getShippingLanes(p);

      default:
        throw new Error(`Unknown compliance tool: ${tool}`);
    }
  };
}

