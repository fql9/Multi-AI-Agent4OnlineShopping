-- 迁移脚本 001: 更新表结构以适配工具逻辑
-- 运行方式: docker exec -i agent-postgres psql -U agent -d agent_db < migrations/001_update_schema.sql

-- ========================================
-- 更新 offers 表
-- ========================================
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS title_zh TEXT;
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS brand_name VARCHAR(255);
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS brand_id VARCHAR(255);
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS base_price DECIMAL(12, 2);
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS weight_g INTEGER DEFAULT 500;
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS dimensions_mm JSONB;
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS risk_tags TEXT[] DEFAULT '{}';
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS certifications TEXT[] DEFAULT '{}';
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS return_policy JSONB;
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS warranty_months INTEGER DEFAULT 12;
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS rating DECIMAL(2, 1) DEFAULT 4.0;
ALTER TABLE agent.offers ADD COLUMN IF NOT EXISTS reviews_count INTEGER DEFAULT 0;

-- 创建商品 ID 索引
CREATE INDEX IF NOT EXISTS idx_offers_id ON agent.offers(id);
CREATE INDEX IF NOT EXISTS idx_offers_brand ON agent.offers(brand_name);
CREATE INDEX IF NOT EXISTS idx_offers_rating ON agent.offers(rating DESC);

-- ========================================
-- 更新 skus 表
-- ========================================
ALTER TABLE agent.skus ADD COLUMN IF NOT EXISTS price DECIMAL(12, 2);
ALTER TABLE agent.skus ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE agent.skus ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 100;

-- ========================================
-- 更新 carts 表 - 使用 id 作为主键标识
-- ========================================
-- 添加 id 列如果不存在（已经是主键，跳过）

-- ========================================
-- 更新 draft_orders 表
-- ========================================
ALTER TABLE agent.draft_orders ADD COLUMN IF NOT EXISTS address_id_str VARCHAR(255);
ALTER TABLE agent.draft_orders ADD COLUMN IF NOT EXISTS shipping_option_id VARCHAR(255);
ALTER TABLE agent.draft_orders ADD COLUMN IF NOT EXISTS destination_country VARCHAR(2);
ALTER TABLE agent.draft_orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 2);
ALTER TABLE agent.draft_orders ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(12, 2);
ALTER TABLE agent.draft_orders ADD COLUMN IF NOT EXISTS payable_amount DECIMAL(12, 2);
ALTER TABLE agent.draft_orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE agent.draft_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- 创建幂等键索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_orders_idempotency ON agent.draft_orders(idempotency_key);

-- ========================================
-- 更新 evidence_snapshots 表
-- ========================================
ALTER TABLE agent.evidence_snapshots ADD COLUMN IF NOT EXISTS draft_order_id VARCHAR(255);
ALTER TABLE agent.evidence_snapshots ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}';
ALTER TABLE agent.evidence_snapshots ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE agent.evidence_snapshots ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE agent.evidence_snapshots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- ========================================
-- 更新 compliance_rules 表
-- ========================================
ALTER TABLE agent.compliance_rules ADD COLUMN IF NOT EXISTS name JSONB;
ALTER TABLE agent.compliance_rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100;

-- 创建优先级索引
CREATE INDEX IF NOT EXISTS idx_compliance_rules_priority ON agent.compliance_rules(priority ASC);

-- ========================================
-- 创建 categories 表（如果不存在）
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

CREATE INDEX IF NOT EXISTS idx_categories_parent ON agent.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_level ON agent.categories(level);

-- ========================================
-- 创建文本搜索索引
-- ========================================
CREATE INDEX IF NOT EXISTS idx_offers_title_en_gin ON agent.offers USING gin(to_tsvector('english', COALESCE(title_en, '')));

-- ========================================
-- 完成
-- ========================================
SELECT 'Migration 001 completed successfully' AS status;

