-- ============================================================
-- 数据补充脚本：填充新增实体表和增强现有数据
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 从 offers 表提取品牌并填充 brands 表
-- ============================================================
INSERT INTO agent.brands (id, name, normalized_name, source)
SELECT DISTINCT 
    'brand_' || LOWER(REGEXP_REPLACE(brand_name, '[^a-zA-Z0-9]', '_', 'g')) as id,
    brand_name as name,
    LOWER(TRIM(brand_name)) as normalized_name,
    'extracted' as source
FROM agent.offers
WHERE brand_name IS NOT NULL 
  AND brand_name != ''
  AND brand_name != 'Unknown'
ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW();

-- 更新 offers.brand_id_ref 关联
UPDATE agent.offers o
SET brand_id_ref = 'brand_' || LOWER(REGEXP_REPLACE(o.brand_name, '[^a-zA-Z0-9]', '_', 'g'))
WHERE o.brand_name IS NOT NULL 
  AND o.brand_name != ''
  AND o.brand_name != 'Unknown';

SELECT '✅ 品牌提取完成: ' || COUNT(*) || ' 个品牌' as status FROM agent.brands;

-- ============================================================
-- 2. 从 offers.attributes 提取商家并填充 merchants 表
-- ============================================================
INSERT INTO agent.merchants (id, name, store_url, source, metadata)
SELECT DISTINCT 
    'merchant_' || COALESCE(
        (attributes->>'store_id')::text,
        LOWER(REGEXP_REPLACE(attributes->>'store_name', '[^a-zA-Z0-9]', '_', 'g'))
    ) as id,
    COALESCE(attributes->>'store_name', 'Unknown Store') as name,
    NULL as store_url,
    'extracted' as source,
    jsonb_build_object('store_id', attributes->>'store_id', 'store_description', attributes->>'store_description') as metadata
FROM agent.offers
WHERE attributes->>'store_name' IS NOT NULL
  AND attributes->>'store_name' != ''
ON CONFLICT (id) DO UPDATE SET
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- 更新 offers.merchant_id_ref 关联
UPDATE agent.offers o
SET merchant_id_ref = 'merchant_' || COALESCE(
    (attributes->>'store_id')::text,
    LOWER(REGEXP_REPLACE(attributes->>'store_name', '[^a-zA-Z0-9]', '_', 'g'))
)
WHERE attributes->>'store_name' IS NOT NULL
  AND attributes->>'store_name' != '';

SELECT '✅ 商家提取完成: ' || COUNT(*) || ' 个商家' as status FROM agent.merchants;

-- ============================================================
-- 3. 更新 merchants.total_products 统计
-- ============================================================
UPDATE agent.merchants m
SET total_products = (
    SELECT COUNT(*) 
    FROM agent.offers o 
    WHERE o.merchant_id_ref = m.id
);

-- ============================================================
-- 4. 重建类目树层级关系
-- ============================================================

-- 更新 categories.product_count
UPDATE agent.categories c
SET product_count = (
    SELECT COUNT(*) 
    FROM agent.offers o 
    WHERE o.category_id = c.id
);

-- 构建类目层级路径 (基于名称规则)
-- 这里我们根据常见的类目模式推断父子关系
WITH category_hierarchy AS (
    SELECT 
        id,
        name_en,
        CASE 
            -- 电子产品子类
            WHEN name_en IN ('Mobile Accessories', 'Tablets', 'Headphones', 'Bluetooth Speakers', 'Wearable Devices') THEN 'cat_electronics'
            -- 服装子类
            WHEN name_en IN ('Women Tops', 'Women Bottoms', 'Women Outerwears', 'Dresses', 'Swimsuit', 'Women Sandals', 'Women Sneakers', 'Women Flats', 'Women Slippers') THEN 'cat_women_clothing'
            WHEN name_en IN ('Men Underwear', 'Men Shorts', 'Men Pants', 'Men Shirts', 'Men T-Shirts', 'Men Sandals', 'Men Slippers', 'Men Casual Shoes', 'Men Sweaters', 'Men Jackets') THEN 'cat_men_clothing'
            -- 家居子类
            WHEN name_en IN ('Home Storage', 'Cleaning', 'Bathroom', 'Kitchen Fixtures', 'Living Room', 'Dining Room', 'Bedding', 'Beds & Frames', 'Rugs & Mats') THEN 'cat_home'
            -- 厨房子类
            WHEN name_en IN ('Cookware', 'Dinnerware', 'Bottle &Cup', 'Wine Glass', 'Kitchen Appliances') THEN 'cat_kitchen'
            -- 珠宝配饰子类
            WHEN name_en IN ('Necklaces', 'Bracelets', 'Earrings', 'Rings', 'Brooch', 'Vintage Jewelry') THEN 'cat_jewelry'
            -- 美妆子类
            WHEN name_en IN ('Skincare', 'Hair Care', 'Makeup Tools', 'Perfume', 'Nail Care', 'Hair Appliances') THEN 'cat_beauty'
            -- 玩具子类
            WHEN name_en IN ('Educational Toys', 'Dolls & Accessories', 'Outdoor Toys', 'Card Games', 'Leisure Games', 'AI Toys', 'Remote Control Toys') THEN 'cat_toys'
            -- 宠物子类
            WHEN name_en IN ('Dog Beds & Crates', 'Dog Collars &Leashes', 'Cat Beds & Furniture', 'Cat Litter', 'Pet Toys', 'Pet Grooming', 'Pet Clothing', 'Pet Food', 'Pet Health', 'Pet Hygiene', 'Automatic Feeders') THEN 'cat_pets'
            -- 运动户外子类
            WHEN name_en IN ('Camping Equipment', 'Fishing', 'Cycling', 'Outdoor Gear', 'Sports equipments', 'Cardio Machines') THEN 'cat_sports'
            ELSE NULL
        END as inferred_parent
    FROM agent.categories
)
UPDATE agent.categories c
SET parent_id = ch.inferred_parent
FROM category_hierarchy ch
WHERE c.id = ch.id AND ch.inferred_parent IS NOT NULL;

-- 创建根类目 (如果不存在)
INSERT INTO agent.categories (id, name_en, name_zh, level, product_count) VALUES
('cat_electronics', 'Electronics', '电子产品', 0, 0),
('cat_women_clothing', 'Women Clothing', '女装', 0, 0),
('cat_men_clothing', 'Men Clothing', '男装', 0, 0),
('cat_home', 'Home & Living', '家居生活', 0, 0),
('cat_kitchen', 'Kitchen', '厨房', 0, 0),
('cat_jewelry', 'Jewelry & Accessories', '珠宝配饰', 0, 0),
('cat_beauty', 'Beauty & Personal Care', '美妆个护', 0, 0),
('cat_toys', 'Toys & Games', '玩具游戏', 0, 0),
('cat_pets', 'Pet Supplies', '宠物用品', 0, 0),
('cat_sports', 'Sports & Outdoors', '运动户外', 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 更新子类目的 level
UPDATE agent.categories SET level = 1 WHERE parent_id IS NOT NULL;

-- 构建 full_path_en
UPDATE agent.categories c
SET full_path_en = COALESCE(
    (SELECT p.name_en || ' > ' || c.name_en FROM agent.categories p WHERE p.id = c.parent_id),
    c.name_en
);

-- 更新 path 数组
UPDATE agent.categories c
SET path = CASE 
    WHEN c.parent_id IS NOT NULL THEN 
        ARRAY[(SELECT name_en FROM agent.categories WHERE id = c.parent_id), c.name_en]
    ELSE 
        ARRAY[c.name_en]
END;

SELECT '✅ 类目层级重建完成: ' || COUNT(*) || ' 个有父类目' as status 
FROM agent.categories WHERE parent_id IS NOT NULL;

-- ============================================================
-- 5. 从商品描述中提取风险标签
-- ============================================================

-- 基于关键词匹配提取风险标签
WITH risk_extraction AS (
    SELECT 
        o.id as offer_id,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT rtd.id), NULL) as extracted_tags
    FROM agent.offers o
    CROSS JOIN agent.risk_tag_definitions rtd
    WHERE 
        -- 在标题或描述中匹配关键词
        EXISTS (
            SELECT 1 FROM UNNEST(rtd.keywords) k
            WHERE LOWER(o.title_en) LIKE '%' || LOWER(k) || '%'
               OR LOWER(COALESCE(o.attributes->>'description', '')) LIKE '%' || LOWER(k) || '%'
               OR LOWER(COALESCE(o.attributes->>'short_description', '')) LIKE '%' || LOWER(k) || '%'
        )
    GROUP BY o.id
)
UPDATE agent.offers o
SET risk_tags = re.extracted_tags
FROM risk_extraction re
WHERE o.id = re.offer_id
  AND array_length(re.extracted_tags, 1) > 0;

SELECT '✅ 风险标签提取完成: ' || COUNT(*) || ' 个产品有风险标签' as status 
FROM agent.offers WHERE array_length(risk_tags, 1) > 0;

-- ============================================================
-- 6. 生成 version_hash (基于关键字段的哈希)
-- ============================================================
UPDATE agent.offers
SET version_hash = MD5(
    COALESCE(title_en, '') || 
    COALESCE(brand_name, '') || 
    COALESCE(base_price::text, '') || 
    COALESCE(category_id, '') ||
    COALESCE(attributes::text, '')
),
update_source = 'api_sync'
WHERE version_hash IS NULL;

SELECT '✅ 版本哈希生成完成' as status;

-- ============================================================
-- 7. 构建风险画像 (risk_profile)
-- ============================================================
UPDATE agent.offers
SET risk_profile = jsonb_build_object(
    'fragile', CASE WHEN 'fragile' = ANY(risk_tags) THEN true ELSE false END,
    'battery_risk', CASE WHEN 'battery_included' = ANY(risk_tags) THEN 'high' ELSE 'none' END,
    'liquid_risk', CASE WHEN 'liquid' = ANY(risk_tags) THEN 'high' ELSE 'none' END,
    'shipping_complexity', CASE 
        WHEN array_length(risk_tags, 1) > 2 THEN 'high'
        WHEN array_length(risk_tags, 1) > 0 THEN 'medium'
        ELSE 'low'
    END,
    'customs_sensitivity', CASE
        WHEN 'food' = ANY(risk_tags) OR 'medical' = ANY(risk_tags) THEN 'high'
        WHEN 'cosmetic' = ANY(risk_tags) OR 'battery_included' = ANY(risk_tags) THEN 'medium'
        ELSE 'low'
    END
);

SELECT '✅ 风险画像生成完成' as status;

-- ============================================================
-- 8. 创建 KG 关系 (显式关系边)
-- ============================================================

-- Offer -> Category 关系
INSERT INTO agent.kg_relations (from_type, from_id, relation_type, to_type, to_id, source)
SELECT 'offer', o.id, 'IN_CATEGORY', 'category', o.category_id, 'system'
FROM agent.offers o
WHERE o.category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Offer -> Brand 关系
INSERT INTO agent.kg_relations (from_type, from_id, relation_type, to_type, to_id, source)
SELECT 'offer', o.id, 'HAS_BRAND', 'brand', o.brand_id_ref, 'system'
FROM agent.offers o
WHERE o.brand_id_ref IS NOT NULL
ON CONFLICT DO NOTHING;

-- Offer -> Merchant 关系
INSERT INTO agent.kg_relations (from_type, from_id, relation_type, to_type, to_id, source)
SELECT 'offer', o.id, 'SOLD_BY', 'merchant', o.merchant_id_ref, 'system'
FROM agent.offers o
WHERE o.merchant_id_ref IS NOT NULL
ON CONFLICT DO NOTHING;

-- Category -> Parent Category 关系
INSERT INTO agent.kg_relations (from_type, from_id, relation_type, to_type, to_id, source)
SELECT 'category', c.id, 'CHILD_OF', 'category', c.parent_id, 'system'
FROM agent.categories c
WHERE c.parent_id IS NOT NULL
ON CONFLICT DO NOTHING;

SELECT '✅ KG 关系构建完成: ' || COUNT(*) || ' 条关系' as status FROM agent.kg_relations;

-- ============================================================
-- 9. 更新 evidence_chunks 元数据
-- ============================================================
UPDATE agent.evidence_chunks
SET chunk_type = 'description',
    confidence = 0.8
WHERE chunk_type IS NULL OR chunk_type = '';

SELECT '✅ 证据块元数据更新完成' as status;

COMMIT;

-- ============================================================
-- 最终统计
-- ============================================================
SELECT '═══════════════════════════════════════════════════' as line;
SELECT '📊 数据增强完成 - 最终统计' as title;
SELECT '═══════════════════════════════════════════════════' as line;

SELECT 
    '🛒 产品' as type, COUNT(*)::text as count FROM agent.offers
UNION ALL SELECT '📦 SKU', COUNT(*)::text FROM agent.skus
UNION ALL SELECT '🏷️ 品牌', COUNT(*)::text FROM agent.brands
UNION ALL SELECT '🏪 商家', COUNT(*)::text FROM agent.merchants
UNION ALL SELECT '📁 类目', COUNT(*)::text FROM agent.categories
UNION ALL SELECT '🔗 KG关系', COUNT(*)::text FROM agent.kg_relations
UNION ALL SELECT '🔍 RAG块', COUNT(*)::text FROM agent.evidence_chunks
UNION ALL SELECT '⚠️ 有风险标签产品', COUNT(*)::text FROM agent.offers WHERE array_length(risk_tags, 1) > 0
UNION ALL SELECT '📋 有父类目', COUNT(*)::text FROM agent.categories WHERE parent_id IS NOT NULL;

