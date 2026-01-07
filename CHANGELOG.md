# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.6.0] - 2026-01-08

### Added
- **Frontend UI Enhancements**:
  - Added `DockProductShowcase` component for Mac Dock-like product browsing animation on the homepage.
  - Added global user preference controls: Destination Country, Currency, Price Range (Slider), and Quantity.
  - Added `UserAvatar` component in the header.
  - Added gradient loading bar animation for better processing feedback.
- **Docker Configuration**:
  - Added `RATE_LIMIT_ENABLED` environment variable to toggle rate limiting in `tool-gateway`.
  - Added `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` configuration support in `docker-compose.full.yml`.

### Changed
- **API Strategy**:
  - Removed "Mock Mode" entirely; the system now strictly operates in "Real API" mode using live tools.
  - Refactored `store/shopping.ts` to remove mock data generators and `apiMode` toggles.
  - Updated `api.ts` to remove mock sources.
- **Product URLs**:
  - Fixed XOOBAY product URL generation to use slugified titles matching the real site structure (`/products/<slug>`).
- **Documentation**:
  - Updated `README.md` to reflect new UI features and deployment options.
  - Updated `doc/18_deployment.md` with Rate Limit configuration guide.

### Fixed
- Fixed `HTTP 429 Too Many Requests` issues during frontend concurrent image loading by making rate limits configurable.
- Fixed `next build` failure by removing incompatible API routes in static export mode.

## [0.5.0] - 2026-01-02

### Added
- **Deployment**: Complete Docker packaging for all services (Web, Agent, Gateway, MCPs).
- **Integration**: Full XOOBAY product catalog integration.
- **Transport**: SSE (Server-Sent Events) support for MCP servers.

### Changed
- Migrated Checkout MCP to use SSE transport.
- Enhanced database schema for AROC and Knowledge Graph.

## [0.4.0] - 2025-12-25

### Added
- **RAG**: GraphRAG implementation for policy and compliance retrieval.
- **Agent**: Python-based LangGraph agent implementation (7 nodes).

## [0.3.0] - 2025-12-10

### Added
- **Core MCP**: Implementation of Catalog, Pricing, Shipping, and Compliance tools.
- **Tool Gateway**: Initial Fastify implementation with Zod validation.

