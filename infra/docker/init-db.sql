-- 初始化数据库脚本
-- Multi-AI-Agent4OnlineShopping

-- 启用扩展
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建 schema
CREATE SCHEMA IF NOT EXISTS agent;

-- ========================================
-- 类目表
-- ========================================
CREATE TABLE IF NOT EXISTS agent.categories (
    id VARCHAR(255) PRIMARY KEY,
    name_en VARCHAR(255) NOT NULL,
    name_zh VARCHAR(255),
    parent_id VARCHAR(255),
    path TEXT[] DEFAULT '{}',
    level INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 用户与身份
-- ========================================
CREATE TABLE IF NOT EXISTS agent.users (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'user_' || substr(uuid_generate_v4()::text, 1, 8),
    email VARCHAR(255),
    locale VARCHAR(10) DEFAULT 'en-US',
    currency VARCHAR(3) DEFAULT 'USD',
    timezone VARCHAR(50) DEFAULT 'UTC',
    risk_tier VARCHAR(20) DEFAULT 'normal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- Mission（采购委托）
-- ========================================
CREATE TABLE IF NOT EXISTS agent.missions (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'm_' || substr(uuid_generate_v4()::text, 1, 12),
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'created',
    destination_country VARCHAR(2),
    budget_amount DECIMAL(12,2),
    budget_currency VARCHAR(3) DEFAULT 'USD',
    arrival_deadline DATE,
    hard_constraints JSONB DEFAULT '[]',
    soft_preferences JSONB DEFAULT '[]',
    objective_weights JSONB DEFAULT '{"price": 0.4, "speed": 0.3, "risk": 0.3}',
    raw_query TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- AROC（AI-Ready Offer Card）
-- ========================================
CREATE TABLE IF NOT EXISTS agent.offers (
    id VARCHAR(255) PRIMARY KEY,
    spu_id VARCHAR(255),
    merchant_id VARCHAR(255),
    category_id VARCHAR(255) REFERENCES agent.categories(id),
    title_en TEXT,
    title_zh TEXT,
    brand_name VARCHAR(255),
    brand_id VARCHAR(255),
    base_price DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    attributes JSONB DEFAULT '[]',
    weight_g INTEGER DEFAULT 500,
    dimensions_mm JSONB,
    risk_tags TEXT[] DEFAULT '{}',
    certifications TEXT[] DEFAULT '{}',
    return_policy JSONB,
    warranty_months INTEGER DEFAULT 12,
    rating DECIMAL(2, 1) DEFAULT 4.0,
    reviews_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent.skus (
    id VARCHAR(255) PRIMARY KEY,
    offer_id VARCHAR(255) REFERENCES agent.offers(id),
    options JSONB DEFAULT '{}',
    price DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    stock INTEGER DEFAULT 100,
    packaging JSONB,
    risk_tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 合规规则
-- ========================================
CREATE TABLE IF NOT EXISTS agent.compliance_rules (
    id VARCHAR(255) PRIMARY KEY,
    name JSONB NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    priority INTEGER DEFAULT 100,
    condition JSONB NOT NULL,
    applies_to JSONB NOT NULL,
    action JSONB NOT NULL,
    severity VARCHAR(20) DEFAULT 'error',
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 购物车
-- ========================================
CREATE TABLE IF NOT EXISTS agent.carts (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active',
    items JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 草稿订单
-- ========================================
CREATE TABLE IF NOT EXISTS agent.draft_orders (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    cart_id VARCHAR(255) REFERENCES agent.carts(id),
    address_id VARCHAR(255),
    shipping_option_id VARCHAR(255),
    destination_country VARCHAR(2),
    items JSONB NOT NULL,
    subtotal DECIMAL(12, 2),
    shipping_cost DECIMAL(12, 2),
    tax_estimate DECIMAL(12, 2),
    payable_amount DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    consents JSONB DEFAULT '{}',
    evidence_snapshot_id VARCHAR(255),
    idempotency_key VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_orders_idempotency 
ON agent.draft_orders(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- ========================================
-- 证据快照
-- ========================================
CREATE TABLE IF NOT EXISTS agent.evidence_snapshots (
    id VARCHAR(255) PRIMARY KEY,
    mission_id VARCHAR(255),
    draft_order_id VARCHAR(255),
    context JSONB DEFAULT '{}',
    tool_calls JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    content_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- RAG 证据块
-- ========================================
CREATE TABLE IF NOT EXISTS agent.evidence_chunks (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'chunk_' || substr(uuid_generate_v4()::text, 1, 12),
    text TEXT NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    offer_id VARCHAR(255),
    sku_id VARCHAR(255),
    category_id VARCHAR(255),
    language VARCHAR(10) DEFAULT 'en',
    doc_version_hash VARCHAR(64),
    offsets JSONB,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 审计日志
-- ========================================
CREATE TABLE IF NOT EXISTS agent.audit_logs (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'log_' || substr(uuid_generate_v4()::text, 1, 12),
    request_id VARCHAR(255) NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255),
    user_id VARCHAR(255),
    tool_name VARCHAR(100) NOT NULL,
    request_summary JSONB,
    response_hash VARCHAR(64),
    response_status VARCHAR(50),
    latency_ms INTEGER,
    trace_id VARCHAR(255),
    span_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 索引
-- ========================================
CREATE INDEX IF NOT EXISTS idx_categories_parent ON agent.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_offers_category ON agent.offers(category_id);
CREATE INDEX IF NOT EXISTS idx_offers_brand ON agent.offers(brand_name);
CREATE INDEX IF NOT EXISTS idx_offers_rating ON agent.offers(rating DESC);
CREATE INDEX IF NOT EXISTS idx_skus_offer ON agent.skus(offer_id);
CREATE INDEX IF NOT EXISTS idx_carts_user ON agent.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_status ON agent.carts(status);
CREATE INDEX IF NOT EXISTS idx_draft_orders_user ON agent.draft_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_orders_status ON agent.draft_orders(status);
CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_mission ON agent.evidence_snapshots(mission_id);
CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_draft ON agent.evidence_snapshots(draft_order_id);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_priority ON agent.compliance_rules(priority ASC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tool ON agent.audit_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON agent.audit_logs(created_at);

-- 向量索引
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_embedding 
ON agent.evidence_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 全文搜索索引
CREATE INDEX IF NOT EXISTS idx_offers_title_search 
ON agent.offers 
USING gin(to_tsvector('english', COALESCE(title_en, '')));

COMMENT ON SCHEMA agent IS 'Multi-AI-Agent4OnlineShopping 主 schema';
