-- 种子数据
-- Multi-AI-Agent4OnlineShopping

-- ========================================
-- 类目数据
-- ========================================
INSERT INTO agent.categories (id, name_en, name_zh, parent_id, path, level) VALUES
-- 一级类目
('cat_electronics', 'Electronics', '电子产品', NULL, ARRAY['Electronics'], 0),
('cat_home', 'Home & Garden', '家居园艺', NULL, ARRAY['Home & Garden'], 0),
('cat_fashion', 'Fashion', '服饰', NULL, ARRAY['Fashion'], 0),
('cat_sports', 'Sports & Outdoors', '运动户外', NULL, ARRAY['Sports & Outdoors'], 0),
-- 二级类目 - 电子产品
('cat_phones', 'Phones & Accessories', '手机及配件', 'cat_electronics', ARRAY['Electronics', 'Phones & Accessories'], 1),
('cat_computers', 'Computers & Tablets', '电脑平板', 'cat_electronics', ARRAY['Electronics', 'Computers & Tablets'], 1),
('cat_audio', 'Audio & Headphones', '音频耳机', 'cat_electronics', ARRAY['Electronics', 'Audio & Headphones'], 1),
('cat_cameras', 'Cameras & Photography', '相机摄影', 'cat_electronics', ARRAY['Electronics', 'Cameras & Photography'], 1),
-- 三级类目 - 手机配件
('cat_phone_cases', 'Phone Cases', '手机壳', 'cat_phones', ARRAY['Electronics', 'Phones & Accessories', 'Phone Cases'], 2),
('cat_chargers', 'Chargers & Cables', '充电器线缆', 'cat_phones', ARRAY['Electronics', 'Phones & Accessories', 'Chargers & Cables'], 2),
('cat_screen_protectors', 'Screen Protectors', '屏幕保护膜', 'cat_phones', ARRAY['Electronics', 'Phones & Accessories', 'Screen Protectors'], 2),
('cat_power_banks', 'Power Banks', '移动电源', 'cat_phones', ARRAY['Electronics', 'Phones & Accessories', 'Power Banks'], 2)
ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_zh = EXCLUDED.name_zh;

-- ========================================
-- 合规规则
-- ========================================
INSERT INTO agent.compliance_rules (id, name, rule_type, priority, condition, applies_to, action, severity) VALUES
-- 电池相关
('rule_battery_lithium', 
 '{"en": "Lithium Battery Certification Required", "zh": "锂电池需要认证"}',
 'certification',
 10,
 '{"attribute": "attr_battery_type", "operator": "in", "value": ["Built-in Lithium", "Lithium-ion", "Li-Po"]}',
 '{"categories": ["cat_phones", "cat_power_banks"], "countries": ["*"]}',
 '{"type": "require_certification", "certification": "UN38.3", "message": {"en": "Products with lithium batteries require UN38.3 certification", "zh": "含锂电池产品需要UN38.3认证"}}',
 'error'),
 
('rule_battery_air_shipping',
 '{"en": "Battery Air Shipping Restriction", "zh": "电池空运限制"}',
 'shipping_restriction',
 20,
 '{"attribute": "attr_battery_type", "operator": "in", "value": ["Built-in Lithium", "Lithium-ion"]}',
 '{"categories": ["*"], "countries": ["*"]}',
 '{"type": "restrict_shipping", "blocked_methods": ["ship_express_air"], "allowed_methods": ["ship_standard", "ship_sea"], "message": {"en": "Lithium battery products have air shipping restrictions", "zh": "锂电池产品有空运限制"}}',
 'warning'),

-- 液体限制
('rule_liquid_volume',
 '{"en": "Liquid Volume Restriction", "zh": "液体容量限制"}',
 'shipping_restriction',
 30,
 '{"attribute": "attr_contains_liquid", "operator": "==", "value": true}',
 '{"categories": ["*"], "countries": ["*"]}',
 '{"type": "restrict_shipping", "message": {"en": "Liquid items have volume and shipping restrictions", "zh": "液体商品有容量和运输限制"}}',
 'warning'),

-- 磁铁限制
('rule_magnet_warning',
 '{"en": "Magnet Warning", "zh": "磁铁警告"}',
 'warning',
 40,
 '{"attribute": "attr_contains_magnet", "operator": "==", "value": true}',
 '{"categories": ["*"], "countries": ["*"]}',
 '{"type": "add_warning", "warning_type": "shipping_delay", "message": {"en": "Products with strong magnets may affect shipping", "zh": "含强磁铁产品可能影响运输"}}',
 'info'),

-- 国家特定规则
('rule_eu_ce_mark',
 '{"en": "EU CE Mark Required", "zh": "欧盟需要CE认证"}',
 'certification',
 50,
 '{"category": "cat_electronics"}',
 '{"categories": ["cat_electronics"], "countries": ["DE", "FR", "IT", "ES", "NL", "BE"]}',
 '{"type": "require_certification", "certification": "CE", "message": {"en": "Electronic products sold in EU require CE marking", "zh": "在欧盟销售的电子产品需要CE认证"}}',
 'error'),

('rule_us_fcc',
 '{"en": "US FCC Certification Required", "zh": "美国需要FCC认证"}',
 'certification',
 51,
 '{"category": "cat_electronics"}',
 '{"categories": ["cat_electronics"], "countries": ["US"]}',
 '{"type": "require_certification", "certification": "FCC", "message": {"en": "Electronic products sold in US require FCC certification", "zh": "在美国销售的电子产品需要FCC认证"}}',
 'warning')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, condition = EXCLUDED.condition;

-- ========================================
-- 商品数据
-- ========================================
INSERT INTO agent.offers (id, spu_id, merchant_id, category_id, title_en, title_zh, brand_name, brand_id, base_price, currency, weight_g, risk_tags, certifications, rating, reviews_count, attributes) VALUES
-- 手机壳
('of_case_001', 'spu_case_001', 'm_anker', 'cat_phone_cases', 'Premium TPU Case for iPhone 15 Pro', 'iPhone 15 Pro 高级TPU保护壳', 'Anker', 'brand_anker', 19.99, 'USD', 50, '{}', '{}', 4.5, 1250, '[{"attr_id": "material", "value": "TPU"}, {"attr_id": "compatible_models", "value": ["iPhone 15 Pro"]}]'),
('of_case_002', 'spu_case_002', 'm_spigen', 'cat_phone_cases', 'Ultra Hybrid Case for Samsung S24', 'Samsung S24 超薄混合保护壳', 'Spigen', 'brand_spigen', 24.99, 'USD', 45, '{}', '{}', 4.6, 890, '[{"attr_id": "material", "value": "PC+TPU"}, {"attr_id": "compatible_models", "value": ["Samsung Galaxy S24"]}]'),
('of_case_003', 'spu_case_003', 'm_esr', 'cat_phone_cases', 'MagSafe Magnetic Case for iPhone 15', 'iPhone 15 MagSafe磁吸保护壳', 'ESR', 'brand_esr', 29.99, 'USD', 60, ARRAY['contains_magnet'], '{}', 4.4, 567, '[{"attr_id": "material", "value": "TPU"}, {"attr_id": "has_magsafe", "value": true}]'),

-- 充电器
('of_charger_001', 'spu_charger_001', 'm_anker', 'cat_chargers', 'Anker 65W USB-C GaN Charger', 'Anker 65W USB-C氮化镓充电器', 'Anker', 'brand_anker', 45.99, 'USD', 120, ARRAY['battery_included'], ARRAY['FCC', 'CE', 'UN38.3'], 4.7, 3420, '[{"attr_id": "power", "value": 65}, {"attr_id": "ports", "value": 2}]'),
('of_charger_002', 'spu_charger_002', 'm_baseus', 'cat_chargers', 'Baseus 100W Car Charger', 'Baseus 100W车载充电器', 'Baseus', 'brand_baseus', 35.99, 'USD', 80, '{}', ARRAY['FCC', 'CE'], 4.5, 1890, '[{"attr_id": "power", "value": 100}, {"attr_id": "type", "value": "car"}]'),
('of_charger_003', 'spu_charger_003', 'm_ugreen', 'cat_chargers', 'UGREEN 45W Wireless Charger Stand', 'UGREEN 45W无线充电支架', 'UGREEN', 'brand_ugreen', 39.99, 'USD', 200, '{}', ARRAY['Qi'], 4.3, 756, '[{"attr_id": "power", "value": 45}, {"attr_id": "wireless", "value": true}]'),

-- 移动电源
('of_pb_001', 'spu_pb_001', 'm_anker', 'cat_power_banks', 'Anker PowerCore 20000mAh', 'Anker 移动电源 20000mAh', 'Anker', 'brand_anker', 49.99, 'USD', 350, ARRAY['battery_included'], ARRAY['UN38.3', 'FCC'], 4.8, 5670, '[{"attr_id": "capacity", "value": 20000}, {"attr_id": "ports", "value": 2}]'),
('of_pb_002', 'spu_pb_002', 'm_xiaomi', 'cat_power_banks', 'Xiaomi Power Bank 10000mAh', '小米移动电源 10000mAh', 'Xiaomi', 'brand_xiaomi', 25.99, 'USD', 220, ARRAY['battery_included'], ARRAY['UN38.3'], 4.5, 8900, '[{"attr_id": "capacity", "value": 10000}]'),
('of_pb_003', 'spu_pb_003', 'm_baseus', 'cat_power_banks', 'Baseus MagSafe Power Bank 5000mAh', 'Baseus MagSafe磁吸移动电源 5000mAh', 'Baseus', 'brand_baseus', 35.99, 'USD', 150, ARRAY['battery_included', 'contains_magnet'], ARRAY['UN38.3'], 4.4, 2340, '[{"attr_id": "capacity", "value": 5000}, {"attr_id": "magsafe", "value": true}]'),

-- 耳机
('of_audio_001', 'spu_audio_001', 'm_sony', 'cat_audio', 'Sony WH-1000XM5 Wireless Headphones', 'Sony WH-1000XM5 无线降噪耳机', 'Sony', 'brand_sony', 349.99, 'USD', 250, ARRAY['battery_included'], ARRAY['FCC', 'CE', 'UN38.3'], 4.8, 12500, '[{"attr_id": "type", "value": "over-ear"}, {"attr_id": "anc", "value": true}]'),
('of_audio_002', 'spu_audio_002', 'm_apple', 'cat_audio', 'Apple AirPods Pro 2nd Gen', 'Apple AirPods Pro 第二代', 'Apple', 'brand_apple', 249.99, 'USD', 60, ARRAY['battery_included'], ARRAY['FCC', 'CE', 'UN38.3'], 4.7, 34000, '[{"attr_id": "type", "value": "in-ear"}, {"attr_id": "anc", "value": true}]'),
('of_audio_003', 'spu_audio_003', 'm_bose', 'cat_audio', 'Bose QuietComfort Ultra Earbuds', 'Bose QuietComfort Ultra 降噪耳塞', 'Bose', 'brand_bose', 299.99, 'USD', 65, ARRAY['battery_included'], ARRAY['FCC', 'CE', 'UN38.3'], 4.6, 5670, '[{"attr_id": "type", "value": "in-ear"}, {"attr_id": "anc", "value": true}]'),

-- 屏幕保护膜
('of_sp_001', 'spu_sp_001', 'm_esr', 'cat_screen_protectors', 'ESR Tempered Glass for iPhone 15 (2-Pack)', 'ESR iPhone 15 钢化膜（两片装）', 'ESR', 'brand_esr', 14.99, 'USD', 30, '{}', '{}', 4.4, 4560, '[{"attr_id": "material", "value": "tempered_glass"}, {"attr_id": "quantity", "value": 2}]'),
('of_sp_002', 'spu_sp_002', 'm_spigen', 'cat_screen_protectors', 'Spigen EZ Fit Screen Protector for Samsung S24', 'Spigen 三星S24 EZ安装屏幕保护膜', 'Spigen', 'brand_spigen', 18.99, 'USD', 35, '{}', '{}', 4.5, 2340, '[{"attr_id": "material", "value": "tempered_glass"}]')
ON CONFLICT (id) DO UPDATE SET title_en = EXCLUDED.title_en, base_price = EXCLUDED.base_price;

-- ========================================
-- SKU 数据
-- ========================================
INSERT INTO agent.skus (id, offer_id, options, price, currency, stock) VALUES
-- 手机壳 SKU
('sku_case_001_black', 'of_case_001', '{"color": "Black"}', 19.99, 'USD', 150),
('sku_case_001_clear', 'of_case_001', '{"color": "Clear"}', 19.99, 'USD', 200),
('sku_case_001_blue', 'of_case_001', '{"color": "Blue"}', 21.99, 'USD', 80),
('sku_case_002_black', 'of_case_002', '{"color": "Black"}', 24.99, 'USD', 120),
('sku_case_002_clear', 'of_case_002', '{"color": "Crystal Clear"}', 24.99, 'USD', 95),
('sku_case_003_black', 'of_case_003', '{"color": "Black"}', 29.99, 'USD', 75),

-- 充电器 SKU
('sku_charger_001_us', 'of_charger_001', '{"plug": "US"}', 45.99, 'USD', 300),
('sku_charger_001_eu', 'of_charger_001', '{"plug": "EU"}', 47.99, 'USD', 180),
('sku_charger_001_uk', 'of_charger_001', '{"plug": "UK"}', 47.99, 'USD', 120),
('sku_charger_002_std', 'of_charger_002', '{}', 35.99, 'USD', 250),
('sku_charger_003_std', 'of_charger_003', '{}', 39.99, 'USD', 180),

-- 移动电源 SKU
('sku_pb_001_black', 'of_pb_001', '{"color": "Black"}', 49.99, 'USD', 500),
('sku_pb_001_white', 'of_pb_001', '{"color": "White"}', 49.99, 'USD', 350),
('sku_pb_002_black', 'of_pb_002', '{"color": "Black"}', 25.99, 'USD', 800),
('sku_pb_002_white', 'of_pb_002', '{"color": "White"}', 25.99, 'USD', 600),
('sku_pb_003_black', 'of_pb_003', '{"color": "Black"}', 35.99, 'USD', 200),

-- 耳机 SKU
('sku_audio_001_black', 'of_audio_001', '{"color": "Black"}', 349.99, 'USD', 80),
('sku_audio_001_silver', 'of_audio_001', '{"color": "Silver"}', 349.99, 'USD', 60),
('sku_audio_002_white', 'of_audio_002', '{"color": "White"}', 249.99, 'USD', 150),
('sku_audio_003_black', 'of_audio_003', '{"color": "Black"}', 299.99, 'USD', 45),

-- 屏幕保护膜 SKU
('sku_sp_001_std', 'of_sp_001', '{}', 14.99, 'USD', 1000),
('sku_sp_002_std', 'of_sp_002', '{}', 18.99, 'USD', 500)
ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock;

-- 验证插入结果
SELECT 'Categories: ' || COUNT(*)::text FROM agent.categories;
SELECT 'Compliance Rules: ' || COUNT(*)::text FROM agent.compliance_rules;
SELECT 'Offers: ' || COUNT(*)::text FROM agent.offers;
SELECT 'SKUs: ' || COUNT(*)::text FROM agent.skus;

