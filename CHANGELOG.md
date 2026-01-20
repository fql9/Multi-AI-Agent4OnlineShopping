# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.8.0] - 2026-01-19

### Added
- **Product Type Classification System**:
  - Added comprehensive product taxonomy with 15+ categories (Electronics, Clothing, Home, etc.).
  - Added `ProductTypeClassification` schema for precise product categorization.
  - Added `PRODUCT_TYPE_CLASSIFICATION_PROMPT` for LLM-based category detection.
  - Intent node now performs two-stage classification: category → subcategory → search keywords.
- **Enhanced Intent Parsing**:
  - Expanded intent node with robust product type detection and validation.
  - Added fallback classification for ambiguous queries.
  - Improved multi-language product name translation.
- **XOOBAY Integration Improvements**:
  - Set `XOOBAY_ENABLED=true` as default (essential when DB is empty).
  - Added `XOOBAY_FALLBACK_ON_EMPTY` flag for development convenience.
  - Improved error handling in xoobay service.
- **Agent State Enhancement**:
  - Added `needs_clarification` field to AgentState for better flow control.
- **Frontend Clarification Support**:
  - Added clarification message handling in shopping store.

### Changed
- **Candidate Agent**:
  - Improved relevance filtering with better keyword matching.
  - Enhanced plan generation to ensure diverse product options.
- **Tool Gateway**:
  - Simplified catalog routes with cleaner error responses.
  - Normalized port configuration to 28xxx series.
- **Documentation**:
  - Updated env.example to reflect XOOBAY default-on behavior.
  - Updated deployment and ops docs for consistency.

### Fixed
- Fixed product search returning empty results when database has no data.
- Fixed port inconsistencies across services (now standardized to 28xxx).

## [0.7.0] - 2026-01-10

### Added
- **Strict Product Type Filtering**:
  - Added `primary_product_type` and `primary_product_type_en` fields to Intent parsing for precise product matching.
  - Added `CANDIDATE_RELEVANCE_PROMPT` for LLM-based candidate validation.
  - Added `CandidateRelevanceResult` schema for structured relevance checks.
  - Candidate Agent now filters out non-matching products (e.g., phone cases when user asks for charger).
- **AI Recommendation Reasons**:
  - Added `PurchaseContext` extraction (occasion, recipient, budget_sensitivity, etc.).
  - Added `AIRecommendationReason` generation for each plan with seasonal relevance and personalized tips.
  - Added `AI_RECOMMENDATION_PROMPT` for context-aware recommendations.
- **Intent Preprocessing**:
  - Added LLM-based preprocessing step for language detection, normalization, and translation.
  - Added `INTENT_PREPROCESS_PROMPT` for robust multi-language handling.
  - Added clarification flow for ambiguous queries.
- **Frontend Enhancements**:
  - Progress animation now syncs with real backend API response time.
  - Last step (Plan Agent) shows dynamic waiting messages until API returns.
  - Added purchase context display in Mission card.
  - Added AI recommendation reasons display in Plan cards.

### Changed
- **Intent Agent**:
  - Now extracts precise product type instead of generic categories.
  - Enhanced multi-language support with automatic translation.
- **Candidate Agent**:
  - Added two-tier relevance validation (heuristic + LLM).
  - Returns helpful error when all candidates are filtered out.
- **Frontend Store**:
  - Refactored `simulateAgentProgress` to wait for real API completion signal.

### Fixed
- Fixed issue where "charger for iPhone" returned phone cases and stands instead of chargers.
- Fixed issue where "西装外套" (blazer) returned unrelated clothing items.
- Fixed frontend progress showing "completed" while still waiting for API response.

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

