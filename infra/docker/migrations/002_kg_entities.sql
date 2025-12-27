-- ========================================
-- 知识图谱实体表（遵循 doc/09_kg_design.md）
-- ========================================

-- ========================================
-- 品牌表
-- ========================================
CREATE TABLE IF NOT EXISTS agent.brands (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    country_of_origin VARCHAR(2),
    confidence VARCHAR(20) DEFAULT 'high',
    source VARCHAR(50) DEFAULT 'merchant_feed',
    version_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_name ON agent.brands(normalized_name);

-- ========================================
-- 商家表
-- ========================================
CREATE TABLE IF NOT EXISTS agent.merchants (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    country VARCHAR(2),
    rating DECIMAL(2, 1) DEFAULT 4.0,
    verified BOOLEAN DEFAULT false,
    capabilities JSONB DEFAULT '{}',
    service_languages TEXT[] DEFAULT ARRAY['en'],
    ship_out_sla_hours INTEGER DEFAULT 48,
    version_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_country ON agent.merchants(country);
CREATE INDEX IF NOT EXISTS idx_merchants_verified ON agent.merchants(verified);

-- ========================================
-- 证书表
-- ========================================
CREATE TABLE IF NOT EXISTS agent.certificates (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- UN38.3, CE, FCC, RoHS, MSDS, etc.
    issuing_authority VARCHAR(255),
    valid_from DATE,
    valid_to DATE,
    document_url TEXT,
    document_hash VARCHAR(64),
    confidence VARCHAR(20) DEFAULT 'high',
    source VARCHAR(50) DEFAULT 'merchant_upload',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_type ON agent.certificates(type);

-- ========================================
-- 设备型号表（兼容性用）
-- ========================================
CREATE TABLE IF NOT EXISTS agent.models (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    brand_id VARCHAR(255) REFERENCES agent.brands(id),
    category_id VARCHAR(255) REFERENCES agent.categories(id),
    release_year INTEGER,
    attributes JSONB DEFAULT '{}',
    version_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_models_brand ON agent.models(brand_id);
CREATE INDEX IF NOT EXISTS idx_models_category ON agent.models(category_id);

-- ========================================
-- 政策表
-- ========================================
CREATE TABLE IF NOT EXISTS agent.policies (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- return, warranty, shipping, customs
    name JSONB NOT NULL,
    summary JSONB NOT NULL,
    full_text TEXT,
    applies_to JSONB NOT NULL, -- { countries: [], categories: [], merchants: [] }
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_to TIMESTAMP WITH TIME ZONE,
    version_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policies_type ON agent.policies(type);

-- ========================================
-- HS 编码表
-- ========================================
CREATE TABLE IF NOT EXISTS agent.hs_codes (
    id VARCHAR(255) PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    description_en TEXT NOT NULL,
    description_zh TEXT,
    category_mapping JSONB DEFAULT '{}',
    duty_rates JSONB DEFAULT '{}', -- { country: rate }
    confidence VARCHAR(20) DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hs_codes_code ON agent.hs_codes(code);

-- ========================================
-- 知识图谱关系表
-- ========================================

-- SKU 兼容性关系
CREATE TABLE IF NOT EXISTS agent.kg_sku_compatibility (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'compat_' || substr(uuid_generate_v4()::text, 1, 12),
    sku_id VARCHAR(255) NOT NULL,
    model_id VARCHAR(255) REFERENCES agent.models(id),
    compatible_sku_id VARCHAR(255),
    compatibility_type VARCHAR(50) DEFAULT 'compatible', -- compatible, partially_compatible, incompatible
    confidence DECIMAL(3, 2) DEFAULT 0.9,
    source VARCHAR(50) DEFAULT 'merchant_feed',
    evidence_refs TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT compat_target CHECK (model_id IS NOT NULL OR compatible_sku_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sku_compat_sku ON agent.kg_sku_compatibility(sku_id);
CREATE INDEX IF NOT EXISTS idx_sku_compat_model ON agent.kg_sku_compatibility(model_id);

-- Offer 替代关系
CREATE TABLE IF NOT EXISTS agent.kg_offer_substitutes (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'subst_' || substr(uuid_generate_v4()::text, 1, 12),
    offer_id VARCHAR(255) NOT NULL REFERENCES agent.offers(id),
    substitute_offer_id VARCHAR(255) NOT NULL REFERENCES agent.offers(id),
    similarity_score DECIMAL(3, 2) DEFAULT 0.8,
    reason VARCHAR(255),
    confidence DECIMAL(3, 2) DEFAULT 0.7,
    source VARCHAR(50) DEFAULT 'algorithm',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(offer_id, substitute_offer_id)
);

CREATE INDEX IF NOT EXISTS idx_offer_subst_offer ON agent.kg_offer_substitutes(offer_id);

-- Offer 配件/组合关系
CREATE TABLE IF NOT EXISTS agent.kg_offer_complements (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'compl_' || substr(uuid_generate_v4()::text, 1, 12),
    offer_id VARCHAR(255) NOT NULL REFERENCES agent.offers(id),
    complement_offer_id VARCHAR(255) NOT NULL REFERENCES agent.offers(id),
    relation_type VARCHAR(50) DEFAULT 'accessory', -- accessory, bundle, frequently_bought_together
    strength DECIMAL(3, 2) DEFAULT 0.7,
    reason VARCHAR(255),
    source VARCHAR(50) DEFAULT 'algorithm',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(offer_id, complement_offer_id)
);

CREATE INDEX IF NOT EXISTS idx_offer_compl_offer ON agent.kg_offer_complements(offer_id);

-- SKU 证书关系
CREATE TABLE IF NOT EXISTS agent.kg_sku_certificates (
    sku_id VARCHAR(255) NOT NULL REFERENCES agent.skus(id),
    certificate_id VARCHAR(255) NOT NULL REFERENCES agent.certificates(id),
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(255),
    PRIMARY KEY (sku_id, certificate_id)
);

CREATE INDEX IF NOT EXISTS idx_sku_certs_sku ON agent.kg_sku_certificates(sku_id);

-- ========================================
-- 更新 offers 表添加版本控制
-- ========================================
ALTER TABLE agent.offers 
ADD COLUMN IF NOT EXISTS version_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS evidence_refs TEXT[] DEFAULT '{}';

-- ========================================
-- 更新 skus 表添加版本控制和证据引用
-- ========================================
ALTER TABLE agent.skus
ADD COLUMN IF NOT EXISTS version_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS evidence_refs TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS compliance_tags TEXT[] DEFAULT '{}';

-- ========================================
-- 创建版本历史表（AROC 版本追踪）
-- ========================================
CREATE TABLE IF NOT EXISTS agent.aroc_versions (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'aroc_v_' || substr(uuid_generate_v4()::text, 1, 12),
    offer_id VARCHAR(255) NOT NULL REFERENCES agent.offers(id),
    version_hash VARCHAR(64) NOT NULL,
    aroc_snapshot JSONB NOT NULL,
    source VARCHAR(50) NOT NULL, -- merchant_feed, platform_parse, human_review, model_extract
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aroc_versions_offer ON agent.aroc_versions(offer_id);
CREATE INDEX IF NOT EXISTS idx_aroc_versions_hash ON agent.aroc_versions(version_hash);

-- ========================================
-- 验证
-- ========================================
DO $$
BEGIN
    RAISE NOTICE 'KG entity tables created successfully';
END $$;

