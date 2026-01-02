-- ============================================================
-- 数据库增强迁移脚本 003
-- 根据文档设计增强 AROC、KG、RAG 实现
-- ============================================================

-- 开始事务
BEGIN;

-- ============================================================
-- 1. AROC 版本追溯增强 (offers 表)
-- ============================================================
DO $$
BEGIN
    -- 添加 version_hash 字段 (AROC 版本哈希)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'offers' AND column_name = 'version_hash') THEN
        ALTER TABLE agent.offers ADD COLUMN version_hash VARCHAR(64);
        COMMENT ON COLUMN agent.offers.version_hash IS 'AROC 版本哈希，用于回溯和一致性校验';
    END IF;
    
    -- 添加 update_source 字段 (数据来源)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'offers' AND column_name = 'update_source') THEN
        ALTER TABLE agent.offers ADD COLUMN update_source VARCHAR(50) DEFAULT 'api_sync';
        COMMENT ON COLUMN agent.offers.update_source IS '数据来源: merchant_feed, platform_parse, api_sync, human_review';
    END IF;
    
    -- 添加 risk_profile 字段 (风险画像 JSONB)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'offers' AND column_name = 'risk_profile') THEN
        ALTER TABLE agent.offers ADD COLUMN risk_profile JSONB DEFAULT '{}';
        COMMENT ON COLUMN agent.offers.risk_profile IS '风险画像: fragile, sizing_uncertainty, counterfeit_risk, after_sale_complexity';
    END IF;
END $$;

-- ============================================================
-- 2. 创建 brands 独立实体表 (KG 节点)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent.brands (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255),
    logo_url TEXT,
    country_of_origin VARCHAR(2),
    confidence VARCHAR(20) DEFAULT 'medium',  -- low, medium, high
    source VARCHAR(50) DEFAULT 'extracted',   -- merchant_feed, extracted, verified
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_name ON agent.brands(name);
CREATE INDEX IF NOT EXISTS idx_brands_normalized ON agent.brands(normalized_name);

COMMENT ON TABLE agent.brands IS 'KG 品牌实体表，用于品牌标准化和关联';

-- ============================================================
-- 3. 创建 merchants 独立实体表 (KG 节点)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent.merchants (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    store_url TEXT,
    rating DECIMAL(2, 1) DEFAULT 4.0,
    total_products INTEGER DEFAULT 0,
    country VARCHAR(2),
    verified BOOLEAN DEFAULT FALSE,
    risk_level VARCHAR(20) DEFAULT 'normal',  -- low, normal, high
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_name ON agent.merchants(name);
CREATE INDEX IF NOT EXISTS idx_merchants_rating ON agent.merchants(rating DESC);

COMMENT ON TABLE agent.merchants IS 'KG 商家实体表，用于商家信誉和风险评估';

-- ============================================================
-- 4. 添加 offers 表与新实体的外键关联
-- ============================================================
DO $$
BEGIN
    -- 添加 brand_id_ref 字段关联 brands 表
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'offers' AND column_name = 'brand_id_ref') THEN
        ALTER TABLE agent.offers ADD COLUMN brand_id_ref VARCHAR(255);
    END IF;
    
    -- 添加 merchant_id_ref 字段关联 merchants 表
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'offers' AND column_name = 'merchant_id_ref') THEN
        ALTER TABLE agent.offers ADD COLUMN merchant_id_ref VARCHAR(255);
    END IF;
END $$;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_offers_brand_ref ON agent.offers(brand_id_ref);
CREATE INDEX IF NOT EXISTS idx_offers_merchant_ref ON agent.offers(merchant_id_ref);

-- ============================================================
-- 5. 增强 categories 表 (KG 层级关系)
-- ============================================================
DO $$
BEGIN
    -- 添加 full_path_en 字段 (完整路径文本)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'categories' AND column_name = 'full_path_en') THEN
        ALTER TABLE agent.categories ADD COLUMN full_path_en TEXT;
    END IF;
    
    -- 添加 product_count 字段 (产品数量缓存)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'categories' AND column_name = 'product_count') THEN
        ALTER TABLE agent.categories ADD COLUMN product_count INTEGER DEFAULT 0;
    END IF;
    
    -- 添加 attributes_schema 字段 (类目属性模板)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'categories' AND column_name = 'attributes_schema') THEN
        ALTER TABLE agent.categories ADD COLUMN attributes_schema JSONB DEFAULT '[]';
        COMMENT ON COLUMN agent.categories.attributes_schema IS '类目属性模板，定义该类目下产品应有的结构化属性';
    END IF;
END $$;

-- ============================================================
-- 6. 创建 risk_tags 字典表
-- ============================================================
CREATE TABLE IF NOT EXISTS agent.risk_tag_definitions (
    id VARCHAR(100) PRIMARY KEY,
    name_en VARCHAR(255) NOT NULL,
    name_zh VARCHAR(255),
    description TEXT,
    severity VARCHAR(20) DEFAULT 'warning',  -- info, warning, critical
    affected_shipping BOOLEAN DEFAULT FALSE,
    affected_customs BOOLEAN DEFAULT FALSE,
    keywords TEXT[],  -- 用于从描述中提取的关键词
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE agent.risk_tag_definitions IS '风险标签字典，用于自动提取和合规检查';

-- 插入常见风险标签定义
INSERT INTO agent.risk_tag_definitions (id, name_en, name_zh, description, severity, affected_shipping, affected_customs, keywords) VALUES
('battery_included', 'Battery Included', '含电池', '产品包含电池，需要特殊运输处理', 'warning', TRUE, TRUE, ARRAY['battery', 'lithium', 'rechargeable', 'li-ion', 'lipo', '电池', '锂电']),
('liquid', 'Liquid Content', '含液体', '产品包含液体，可能有运输限制', 'warning', TRUE, TRUE, ARRAY['liquid', 'oil', 'water', 'gel', 'cream', '液体', '油', '水', '凝胶']),
('magnetic', 'Magnetic', '含磁铁', '产品包含磁铁，可能影响航空运输', 'warning', TRUE, FALSE, ARRAY['magnetic', 'magnet', 'neodymium', '磁铁', '磁性']),
('fragile', 'Fragile', '易碎品', '产品易碎，需要特殊包装', 'info', TRUE, FALSE, ARRAY['glass', 'ceramic', 'fragile', '玻璃', '陶瓷', '易碎']),
('powder', 'Powder Content', '含粉末', '产品包含粉末，可能有清关限制', 'warning', TRUE, TRUE, ARRAY['powder', 'flour', '粉末', '粉']),
('food', 'Food Item', '食品', '食品类产品，需要特殊认证', 'critical', TRUE, TRUE, ARRAY['food', 'edible', 'snack', 'candy', '食品', '零食', '糖果']),
('cosmetic', 'Cosmetic', '化妆品', '化妆品类产品，需要相关认证', 'warning', TRUE, TRUE, ARRAY['cosmetic', 'makeup', 'skincare', 'beauty', '化妆品', '护肤']),
('electronic', 'Electronic', '电子产品', '电子产品，可能需要CE/FCC认证', 'info', FALSE, TRUE, ARRAY['electronic', 'electric', 'usb', 'charger', '电子', '充电']),
('medical', 'Medical Device', '医疗器械', '医疗相关产品，需要特殊资质', 'critical', TRUE, TRUE, ARRAY['medical', 'health', 'therapy', '医疗', '健康', '治疗']),
('children', 'Children Product', '儿童产品', '儿童产品，需要安全认证', 'warning', FALSE, TRUE, ARRAY['kids', 'children', 'baby', 'toy', '儿童', '婴儿', '玩具'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. 创建 shipping_lanes 表 (KG 物流线路)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent.shipping_lanes (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    origin_country VARCHAR(2) NOT NULL,
    dest_country VARCHAR(2) NOT NULL,
    carrier VARCHAR(100),
    service_type VARCHAR(50),  -- express, standard, economy
    min_days INTEGER,
    max_days INTEGER,
    allowed_risk_tags TEXT[] DEFAULT '{}',
    blocked_risk_tags TEXT[] DEFAULT '{}',
    max_weight_g INTEGER,
    max_dimension_cm INTEGER,
    base_rate DECIMAL(10, 2),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipping_lanes_route ON agent.shipping_lanes(origin_country, dest_country);
CREATE INDEX IF NOT EXISTS idx_shipping_lanes_active ON agent.shipping_lanes(active);

COMMENT ON TABLE agent.shipping_lanes IS 'KG 物流线路表，用于运输可达性检查';

-- 插入示例物流线路
INSERT INTO agent.shipping_lanes (id, name, origin_country, dest_country, carrier, service_type, min_days, max_days, allowed_risk_tags, blocked_risk_tags, max_weight_g, base_rate) VALUES
('lane_cn_us_express', 'China to US Express', 'CN', 'US', 'DHL', 'express', 5, 10, ARRAY['electronic', 'fragile'], ARRAY['battery_included', 'liquid'], 30000, 25.00),
('lane_cn_us_standard', 'China to US Standard', 'CN', 'US', 'YunExpress', 'standard', 10, 20, ARRAY['electronic', 'fragile', 'battery_included'], ARRAY['liquid', 'powder', 'food'], 50000, 8.00),
('lane_cn_eu_express', 'China to EU Express', 'CN', 'DE', 'FedEx', 'express', 5, 12, ARRAY['electronic'], ARRAY['battery_included', 'liquid', 'magnetic'], 30000, 30.00),
('lane_cn_uk_standard', 'China to UK Standard', 'CN', 'GB', 'Royal Mail', 'standard', 12, 25, ARRAY['electronic', 'cosmetic'], ARRAY['food', 'medical'], 40000, 10.00)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. 增强 evidence_chunks 表 (RAG)
-- ============================================================
DO $$
BEGIN
    -- 添加 chunk_type 字段 (区分不同类型的证据)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'evidence_chunks' AND column_name = 'chunk_type') THEN
        ALTER TABLE agent.evidence_chunks ADD COLUMN chunk_type VARCHAR(50) DEFAULT 'description';
        COMMENT ON COLUMN agent.evidence_chunks.chunk_type IS '证据类型: description, spec, policy, qa, review_insight';
    END IF;
    
    -- 添加 confidence 字段 (证据可信度)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'evidence_chunks' AND column_name = 'confidence') THEN
        ALTER TABLE agent.evidence_chunks ADD COLUMN confidence DECIMAL(3, 2) DEFAULT 0.8;
        COMMENT ON COLUMN agent.evidence_chunks.confidence IS '证据可信度 0-1';
    END IF;
    
    -- 添加 citation_count 字段 (被引用次数)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'agent' AND table_name = 'evidence_chunks' AND column_name = 'citation_count') THEN
        ALTER TABLE agent.evidence_chunks ADD COLUMN citation_count INTEGER DEFAULT 0;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evidence_chunks_type ON agent.evidence_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_evidence_chunks_confidence ON agent.evidence_chunks(confidence DESC);

-- ============================================================
-- 9. 创建 kg_relations 表 (显式存储 KG 边关系)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent.kg_relations (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'rel_' || substr(uuid_generate_v4()::text, 1, 12),
    from_type VARCHAR(50) NOT NULL,      -- offer, sku, brand, category, merchant
    from_id VARCHAR(255) NOT NULL,
    relation_type VARCHAR(100) NOT NULL,  -- BELONGS_TO, SOLD_BY, COMPATIBLE_WITH, SUBSTITUTE_OF
    to_type VARCHAR(50) NOT NULL,
    to_id VARCHAR(255) NOT NULL,
    confidence DECIMAL(3, 2) DEFAULT 0.8,
    source VARCHAR(50) DEFAULT 'system',  -- system, merchant, extracted, human
    metadata JSONB DEFAULT '{}',
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kg_relations_from ON agent.kg_relations(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_to ON agent.kg_relations(to_type, to_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_type ON agent.kg_relations(relation_type);

COMMENT ON TABLE agent.kg_relations IS 'KG 显式关系表，存储实体间的边关系';

-- ============================================================
-- 10. 创建视图：完整的 AROC 视图
-- ============================================================
CREATE OR REPLACE VIEW agent.v_aroc_full AS
SELECT 
    o.id as offer_id,
    o.spu_id,
    o.title_en,
    o.title_zh,
    o.base_price,
    o.currency,
    o.brand_name,
    b.id as brand_id,
    b.normalized_name as brand_normalized,
    o.category_id,
    c.name_en as category_name,
    c.full_path_en as category_path,
    o.merchant_id,
    m.name as merchant_name,
    m.rating as merchant_rating,
    o.attributes,
    o.weight_g,
    o.dimensions_mm,
    o.risk_tags,
    o.risk_profile,
    o.certifications,
    o.return_policy,
    o.warranty_months,
    o.rating,
    o.reviews_count,
    o.version_hash,
    o.update_source,
    o.updated_at
FROM agent.offers o
LEFT JOIN agent.brands b ON o.brand_id_ref = b.id
LEFT JOIN agent.categories c ON o.category_id = c.id
LEFT JOIN agent.merchants m ON o.merchant_id_ref = m.id;

COMMENT ON VIEW agent.v_aroc_full IS '完整的 AROC 视图，包含关联的品牌、类目、商家信息';

-- 提交事务
COMMIT;

-- ============================================================
-- 输出迁移结果
-- ============================================================
SELECT '✅ 数据库增强迁移完成' as status;
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'agent') as columns
FROM information_schema.tables t
WHERE table_schema = 'agent'
ORDER BY table_name;

