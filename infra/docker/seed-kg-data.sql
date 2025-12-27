-- ========================================
-- 知识图谱种子数据（遵循 doc/09_kg_design.md）
-- ========================================

-- ========================================
-- 品牌数据
-- ========================================
INSERT INTO agent.brands (id, name, normalized_name, country_of_origin, confidence, source) VALUES
('brand_anker', 'Anker', 'anker', 'CN', 'high', 'merchant_feed'),
('brand_spigen', 'Spigen', 'spigen', 'KR', 'high', 'merchant_feed'),
('brand_esr', 'ESR', 'esr', 'CN', 'high', 'merchant_feed'),
('brand_baseus', 'Baseus', 'baseus', 'CN', 'high', 'merchant_feed'),
('brand_ugreen', 'UGREEN', 'ugreen', 'CN', 'high', 'merchant_feed'),
('brand_apple', 'Apple', 'apple', 'US', 'high', 'platform_parse'),
('brand_samsung', 'Samsung', 'samsung', 'KR', 'high', 'platform_parse'),
('brand_sony', 'Sony', 'sony', 'JP', 'high', 'platform_parse'),
('brand_xiaomi', 'Xiaomi', 'xiaomi', 'CN', 'high', 'merchant_feed'),
('brand_huawei', 'Huawei', 'huawei', 'CN', 'high', 'merchant_feed'),
('brand_belkin', 'Belkin', 'belkin', 'US', 'high', 'merchant_feed'),
('brand_aukey', 'AUKEY', 'aukey', 'CN', 'medium', 'merchant_feed'),
('brand_ravpower', 'RAVPower', 'ravpower', 'CN', 'medium', 'merchant_feed'),
('brand_jbl', 'JBL', 'jbl', 'US', 'high', 'platform_parse'),
('brand_bose', 'Bose', 'bose', 'US', 'high', 'platform_parse')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ========================================
-- 商家数据
-- ========================================
INSERT INTO agent.merchants (id, name, country, rating, verified, capabilities, service_languages, ship_out_sla_hours) VALUES
('m_anker', 'Anker Official Store', 'CN', 4.8, true, '{"global_shipping": true, "express": true}', ARRAY['en', 'zh'], 24),
('m_spigen', 'Spigen Official Store', 'KR', 4.7, true, '{"global_shipping": true}', ARRAY['en', 'ko'], 48),
('m_esr', 'ESR Official Store', 'CN', 4.5, true, '{"global_shipping": true}', ARRAY['en', 'zh'], 48),
('m_baseus', 'Baseus Official Store', 'CN', 4.6, true, '{"global_shipping": true}', ARRAY['en', 'zh'], 24),
('m_ugreen', 'UGREEN Official Store', 'CN', 4.6, true, '{"global_shipping": true}', ARRAY['en', 'zh'], 48),
('m_tech_mart', 'TechMart Global', 'US', 4.3, true, '{"us_only": false}', ARRAY['en'], 72),
('m_gadget_hub', 'Gadget Hub', 'HK', 4.4, false, '{"asia_focus": true}', ARRAY['en', 'zh'], 48),
('m_euro_tech', 'EuroTech Store', 'DE', 4.5, true, '{"eu_only": false}', ARRAY['en', 'de'], 48)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ========================================
-- 证书数据
-- ========================================
INSERT INTO agent.certificates (id, name, type, issuing_authority, valid_from, valid_to, confidence) VALUES
('cert_un383_anker', 'UN38.3 Lithium Battery Test Report', 'UN38.3', 'TUV Rheinland', '2024-01-01', '2027-01-01', 'high'),
('cert_ce_anker', 'CE Declaration of Conformity', 'CE', 'TUV SUD', '2024-01-01', '2029-01-01', 'high'),
('cert_fcc_anker', 'FCC Certification', 'FCC', 'FCC', '2024-01-01', '2029-01-01', 'high'),
('cert_un383_baseus', 'UN38.3 Lithium Battery Test Report', 'UN38.3', 'SGS', '2024-03-01', '2027-03-01', 'high'),
('cert_ce_baseus', 'CE Declaration of Conformity', 'CE', 'Intertek', '2024-03-01', '2029-03-01', 'high'),
('cert_rohs_generic', 'RoHS Compliance Certificate', 'RoHS', 'Various', '2024-01-01', NULL, 'medium'),
('cert_qi_anker', 'Qi Wireless Charging Certification', 'Qi', 'WPC', '2024-01-01', '2027-01-01', 'high'),
('cert_mfi_belkin', 'Made for iPhone/iPad Certification', 'MFi', 'Apple Inc.', '2024-01-01', '2026-01-01', 'high')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ========================================
-- 设备型号数据
-- ========================================
INSERT INTO agent.models (id, name, brand_id, category_id, release_year, attributes) VALUES
-- Apple iPhone
('model_iphone_15_pro', 'iPhone 15 Pro', 'brand_apple', 'cat_phones', 2023, '{"screen_size": 6.1, "has_magsafe": true}'),
('model_iphone_15_pro_max', 'iPhone 15 Pro Max', 'brand_apple', 'cat_phones', 2023, '{"screen_size": 6.7, "has_magsafe": true}'),
('model_iphone_15', 'iPhone 15', 'brand_apple', 'cat_phones', 2023, '{"screen_size": 6.1, "has_magsafe": true}'),
('model_iphone_14_pro', 'iPhone 14 Pro', 'brand_apple', 'cat_phones', 2022, '{"screen_size": 6.1, "has_magsafe": true}'),
('model_iphone_14', 'iPhone 14', 'brand_apple', 'cat_phones', 2022, '{"screen_size": 6.1, "has_magsafe": true}'),
('model_iphone_13', 'iPhone 13', 'brand_apple', 'cat_phones', 2021, '{"screen_size": 6.1, "has_magsafe": true}'),
-- Samsung Galaxy
('model_galaxy_s24_ultra', 'Samsung Galaxy S24 Ultra', 'brand_samsung', 'cat_phones', 2024, '{"screen_size": 6.8}'),
('model_galaxy_s24', 'Samsung Galaxy S24', 'brand_samsung', 'cat_phones', 2024, '{"screen_size": 6.2}'),
('model_galaxy_s23', 'Samsung Galaxy S23', 'brand_samsung', 'cat_phones', 2023, '{"screen_size": 6.1}'),
('model_galaxy_fold_5', 'Samsung Galaxy Z Fold 5', 'brand_samsung', 'cat_phones', 2023, '{"foldable": true}'),
-- Xiaomi
('model_xiaomi_14', 'Xiaomi 14', 'brand_xiaomi', 'cat_phones', 2023, '{"screen_size": 6.36}'),
('model_xiaomi_14_pro', 'Xiaomi 14 Pro', 'brand_xiaomi', 'cat_phones', 2023, '{"screen_size": 6.73}'),
-- Huawei
('model_huawei_mate_60', 'Huawei Mate 60', 'brand_huawei', 'cat_phones', 2023, '{"screen_size": 6.69}'),
-- Sony
('model_sony_xperia_1_v', 'Sony Xperia 1 V', 'brand_sony', 'cat_phones', 2023, '{"screen_size": 6.5}')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ========================================
-- 政策数据
-- ========================================
INSERT INTO agent.policies (id, type, name, summary, applies_to, valid_from) VALUES
('policy_return_us_30d', 'return', 
 '{"en": "30-Day Return Policy (US)", "zh": "30天退货政策（美国）"}',
 '{"en": "Full refund within 30 days. Items must be unused and in original packaging.", "zh": "30天内全额退款，商品需未使用且保持原包装。"}',
 '{"countries": ["US"], "categories": ["*"]}',
 NOW()),
('policy_return_eu_14d', 'return',
 '{"en": "14-Day EU Return Right", "zh": "14天欧盟退货权"}',
 '{"en": "Statutory 14-day withdrawal right for EU consumers.", "zh": "欧盟消费者法定14天撤销权。"}',
 '{"countries": ["DE", "FR", "IT", "ES", "NL", "BE"], "categories": ["*"]}',
 NOW()),
('policy_warranty_electronics_12m', 'warranty',
 '{"en": "12-Month Electronics Warranty", "zh": "12个月电子产品保修"}',
 '{"en": "Covers manufacturing defects for 12 months from purchase.", "zh": "自购买之日起12个月内涵盖制造缺陷。"}',
 '{"countries": ["*"], "categories": ["cat_electronics"]}',
 NOW()),
('policy_shipping_battery_air', 'shipping',
 '{"en": "Lithium Battery Air Shipping Policy", "zh": "锂电池空运政策"}',
 '{"en": "Lithium batteries over 100Wh cannot be shipped via air. Standard ground/sea shipping required.", "zh": "超过100Wh的锂电池不能空运，需要标准陆运/海运。"}',
 '{"countries": ["*"], "categories": ["cat_power_banks", "cat_chargers"]}',
 NOW()),
('policy_customs_de', 'customs',
 '{"en": "Germany Customs & VAT", "zh": "德国海关和增值税"}',
 '{"en": "Orders over EUR 150 subject to 19% VAT and possible customs duties.", "zh": "超过150欧元的订单需缴纳19%增值税，可能还有关税。"}',
 '{"countries": ["DE"], "categories": ["*"]}',
 NOW())
ON CONFLICT (id) DO UPDATE SET summary = EXCLUDED.summary;

-- ========================================
-- HS 编码数据
-- ========================================
INSERT INTO agent.hs_codes (id, code, description_en, description_zh, category_mapping, duty_rates, confidence) VALUES
('hs_8504', '8504.40', 'Static converters (chargers, adapters)', '静态变流器（充电器、适配器）', '{"categories": ["cat_chargers"]}', '{"US": 0, "EU": 0, "CN": 0}', 'high'),
('hs_8507', '8507.60', 'Lithium-ion batteries', '锂离子电池', '{"categories": ["cat_power_banks"]}', '{"US": 3.4, "EU": 2.7, "CN": 0}', 'high'),
('hs_8518', '8518.30', 'Headphones and earphones', '耳机', '{"categories": ["cat_audio"]}', '{"US": 0, "EU": 0, "CN": 0}', 'high'),
('hs_3926', '3926.90', 'Articles of plastics (phone cases)', '塑料制品（手机壳）', '{"categories": ["cat_phone_cases"]}', '{"US": 5.3, "EU": 6.5, "CN": 6.5}', 'medium'),
('hs_8517', '8517.62', 'Wireless communication apparatus', '无线通信设备', '{"categories": ["cat_phones"]}', '{"US": 0, "EU": 0, "CN": 0}', 'high')
ON CONFLICT (id) DO UPDATE SET description_en = EXCLUDED.description_en;

-- ========================================
-- 验证
-- ========================================
DO $$
DECLARE
    brand_count INTEGER;
    merchant_count INTEGER;
    model_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO brand_count FROM agent.brands;
    SELECT COUNT(*) INTO merchant_count FROM agent.merchants;
    SELECT COUNT(*) INTO model_count FROM agent.models;
    RAISE NOTICE 'KG seed data: % brands, % merchants, % models', brand_count, merchant_count, model_count;
END $$;

