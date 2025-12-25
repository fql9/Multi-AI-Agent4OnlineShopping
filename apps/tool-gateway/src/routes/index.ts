/**
 * Tool Routes
 */

import type { FastifyInstance } from 'fastify';
import { catalogRoutes } from './catalog.js';
import { pricingRoutes } from './pricing.js';
import { shippingRoutes } from './shipping.js';
import { complianceRoutes } from './compliance.js';
import { checkoutRoutes } from './checkout.js';
import { evidenceRoutes } from './evidence.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Register all tool route groups under /tools
  await app.register(catalogRoutes, { prefix: '/tools/catalog' });
  await app.register(pricingRoutes, { prefix: '/tools/pricing' });
  await app.register(shippingRoutes, { prefix: '/tools/shipping' });
  await app.register(complianceRoutes, { prefix: '/tools/compliance' });
  await app.register(checkoutRoutes, { prefix: '/tools/checkout' });
  await app.register(evidenceRoutes, { prefix: '/tools/evidence' });
}

