-- ========================================
-- 扩展商品数据（100+ SKU）
-- 遵循 doc/08_aroc_schema.md AROC 规范
-- ========================================

-- ========================================
-- 更多充电器产品
-- ========================================
INSERT INTO agent.offers (id, spu_id, merchant_id, category_id, title_en, title_zh, brand_name, brand_id, base_price, currency, weight_g, risk_tags, certifications, rating, reviews_count, attributes, version_hash, evidence_refs) VALUES
('of_charger_004', 'spu_charger_004', 'm_anker', 'cat_chargers', 'Anker 735 Nano II 65W USB-C Charger', 'Anker 735 Nano II 65W充电器', 'Anker', 'brand_anker', 55.99, 'USD', 130, ARRAY['battery_included'], ARRAY['FCC', 'CE', 'UN38.3'], 4.8, 5420, '[{"attr_id": "power", "value": 65, "confidence": 0.99}, {"attr_id": "ports", "value": 3, "confidence": 0.99}, {"attr_id": "gan", "value": true}]', 'sha256:a1b2c3', ARRAY['chunk_manual_001']),
('of_charger_005', 'spu_charger_005', 'm_baseus', 'cat_chargers', 'Baseus 67W GaN5 Pro Charger', 'Baseus 67W氮化镓充电器', 'Baseus', 'brand_baseus', 42.99, 'USD', 115, ARRAY['battery_included'], ARRAY['FCC', 'CE'], 4.6, 2340, '[{"attr_id": "power", "value": 67, "confidence": 0.98}, {"attr_id": "ports", "value": 3}]', 'sha256:b2c3d4', '{}'),
('of_charger_006', 'spu_charger_006', 'm_ugreen', 'cat_chargers', 'UGREEN Nexode 100W USB-C Charger', 'UGREEN 100W快充充电器', 'UGREEN', 'brand_ugreen', 65.99, 'USD', 180, ARRAY['battery_included'], ARRAY['FCC', 'CE', 'UN38.3'], 4.7, 1890, '[{"attr_id": "power", "value": 100, "confidence": 0.99}]', 'sha256:c3d4e5', '{}'),
('of_charger_007', 'spu_charger_007', 'm_anker', 'cat_chargers', 'Anker PowerWave Mag-Go 3-in-1', 'Anker三合一磁吸无线充', 'Anker', 'brand_anker', 89.99, 'USD', 280, ARRAY['contains_magnet'], ARRAY['Qi', 'MFi'], 4.5, 890, '[{"attr_id": "wireless", "value": true}, {"attr_id": "magsafe", "value": true}]', 'sha256:d4e5f6', ARRAY['chunk_qa_001']),
('of_charger_008', 'spu_charger_008', 'm_belkin', 'cat_chargers', 'Belkin BoostCharge Pro 15W MagSafe', 'Belkin 15W MagSafe充电器', 'Belkin', 'brand_belkin', 49.99, 'USD', 150, ARRAY['contains_magnet'], ARRAY['Qi', 'MFi'], 4.6, 1560, '[{"attr_id": "power", "value": 15}, {"attr_id": "magsafe", "value": true}]', 'sha256:e5f6g7', '{}')
ON CONFLICT (id) DO UPDATE SET title_en = EXCLUDED.title_en, version_hash = EXCLUDED.version_hash;

-- ========================================
-- 移动电源产品
-- ========================================
INSERT INTO agent.offers (id, spu_id, merchant_id, category_id, title_en, title_zh, brand_name, brand_id, base_price, currency, weight_g, risk_tags, certifications, rating, reviews_count, attributes, version_hash, evidence_refs) VALUES
('of_pb_001', 'spu_pb_001', 'm_anker', 'cat_power_banks', 'Anker PowerCore III Elite 25600mAh', 'Anker移动电源25600mAh', 'Anker', 'brand_anker', 79.99, 'USD', 500, ARRAY['battery_included', 'lithium_ion'], ARRAY['UN38.3', 'FCC', 'CE'], 4.7, 4560, '[{"attr_id": "capacity_mah", "value": 25600, "confidence": 0.99}, {"attr_id": "pd_power", "value": 87}]', 'sha256:f6g7h8', '{}'),
('of_pb_002', 'spu_pb_002', 'm_anker', 'cat_power_banks', 'Anker PowerCore 10000mAh Slim', 'Anker超薄移动电源10000mAh', 'Anker', 'brand_anker', 29.99, 'USD', 180, ARRAY['battery_included', 'lithium_ion'], ARRAY['UN38.3', 'FCC'], 4.8, 12340, '[{"attr_id": "capacity_mah", "value": 10000}]', 'sha256:g7h8i9', '{}'),
('of_pb_003', 'spu_pb_003', 'm_baseus', 'cat_power_banks', 'Baseus 20000mAh 65W Power Bank', 'Baseus 20000mAh 65W快充电源', 'Baseus', 'brand_baseus', 59.99, 'USD', 420, ARRAY['battery_included', 'lithium_ion'], ARRAY['UN38.3', 'CE'], 4.5, 2340, '[{"attr_id": "capacity_mah", "value": 20000}, {"attr_id": "pd_power", "value": 65}]', 'sha256:h8i9j0', '{}'),
('of_pb_004', 'spu_pb_004', 'm_xiaomi', 'cat_power_banks', 'Xiaomi Power Bank 3 20000mAh', '小米移动电源3 20000mAh', 'Xiaomi', 'brand_xiaomi', 35.99, 'USD', 400, ARRAY['battery_included', 'lithium_ion'], ARRAY['UN38.3'], 4.6, 8900, '[{"attr_id": "capacity_mah", "value": 20000}]', 'sha256:i9j0k1', '{}'),
('of_pb_005', 'spu_pb_005', 'm_ugreen', 'cat_power_banks', 'UGREEN 145W Power Bank 25000mAh', 'UGREEN 145W移动电源', 'UGREEN', 'brand_ugreen', 99.99, 'USD', 550, ARRAY['battery_included', 'lithium_ion', 'high_capacity'], ARRAY['UN38.3', 'FCC', 'CE'], 4.4, 890, '[{"attr_id": "capacity_mah", "value": 25000}, {"attr_id": "pd_power", "value": 145}]', 'sha256:j0k1l2', '{}')
ON CONFLICT (id) DO UPDATE SET title_en = EXCLUDED.title_en, version_hash = EXCLUDED.version_hash;

-- ========================================
-- 手机壳产品
-- ========================================
INSERT INTO agent.offers (id, spu_id, merchant_id, category_id, title_en, title_zh, brand_name, brand_id, base_price, currency, weight_g, risk_tags, certifications, rating, reviews_count, attributes, version_hash, evidence_refs) VALUES
('of_case_004', 'spu_case_004', 'm_spigen', 'cat_phone_cases', 'Spigen Tough Armor for iPhone 15', 'Spigen硬甲保护壳iPhone 15', 'Spigen', 'brand_spigen', 34.99, 'USD', 65, '{}', '{}', 4.7, 2340, '[{"attr_id": "material", "value": "PC+TPU"}, {"attr_id": "kickstand", "value": true}]', 'sha256:k1l2m3', '{}'),
('of_case_005', 'spu_case_005', 'm_spigen', 'cat_phone_cases', 'Spigen Ultra Hybrid for Galaxy S24', 'Spigen透明壳Galaxy S24', 'Spigen', 'brand_spigen', 27.99, 'USD', 40, '{}', '{}', 4.8, 1890, '[{"attr_id": "material", "value": "PC+TPU"}, {"attr_id": "transparent", "value": true}]', 'sha256:l2m3n4', '{}'),
('of_case_006', 'spu_case_006', 'm_esr', 'cat_phone_cases', 'ESR Classic Kickstand Case for iPhone 15 Pro Max', 'ESR支架壳iPhone 15 Pro Max', 'ESR', 'brand_esr', 22.99, 'USD', 55, '{}', '{}', 4.4, 1230, '[{"attr_id": "material", "value": "TPU"}, {"attr_id": "kickstand", "value": true}]', 'sha256:m3n4o5', '{}'),
('of_case_007', 'spu_case_007', 'm_anker', 'cat_phone_cases', 'Anker MagGo Case with Stand for iPhone 15', 'Anker MagGo支架保护壳', 'Anker', 'brand_anker', 35.99, 'USD', 70, ARRAY['contains_magnet'], '{}', 4.5, 560, '[{"attr_id": "material", "value": "TPU"}, {"attr_id": "magsafe", "value": true}, {"attr_id": "kickstand", "value": true}]', 'sha256:n4o5p6', '{}'),
('of_case_008', 'spu_case_008', 'm_tech_mart', 'cat_phone_cases', 'Premium Leather Case for Samsung S24 Ultra', '三星S24 Ultra真皮保护壳', 'Generic', 'brand_generic', 45.99, 'USD', 80, '{}', '{}', 4.2, 340, '[{"attr_id": "material", "value": "Genuine Leather"}]', 'sha256:o5p6q7', '{}')
ON CONFLICT (id) DO UPDATE SET title_en = EXCLUDED.title_en;

-- ========================================
-- 耳机产品
-- ========================================
INSERT INTO agent.offers (id, spu_id, merchant_id, category_id, title_en, title_zh, brand_name, brand_id, base_price, currency, weight_g, risk_tags, certifications, rating, reviews_count, attributes, version_hash, evidence_refs) VALUES
('of_headphone_001', 'spu_headphone_001', 'm_tech_mart', 'cat_audio', 'Sony WH-1000XM5 Wireless ANC Headphones', 'Sony WH-1000XM5无线降噪耳机', 'Sony', 'brand_sony', 349.99, 'USD', 250, ARRAY['battery_included'], ARRAY['FCC', 'CE'], 4.8, 8900, '[{"attr_id": "anc", "value": true, "confidence": 0.99}, {"attr_id": "battery_hours", "value": 30}]', 'sha256:p6q7r8', ARRAY['chunk_manual_004', 'chunk_manual_005']),
('of_headphone_002', 'spu_headphone_002', 'm_tech_mart', 'cat_audio', 'Sony WH-1000XM4 Wireless Headphones', 'Sony WH-1000XM4无线耳机', 'Sony', 'brand_sony', 278.00, 'USD', 254, ARRAY['battery_included'], ARRAY['FCC', 'CE'], 4.7, 15600, '[{"attr_id": "anc", "value": true}, {"attr_id": "battery_hours", "value": 30}]', 'sha256:q7r8s9', '{}'),
('of_headphone_003', 'spu_headphone_003', 'm_gadget_hub', 'cat_audio', 'JBL Tune 770NC Wireless Headphones', 'JBL Tune 770NC无线耳机', 'JBL', 'brand_jbl', 129.99, 'USD', 220, ARRAY['battery_included'], ARRAY['FCC'], 4.5, 3450, '[{"attr_id": "anc", "value": true}, {"attr_id": "battery_hours", "value": 44}]', 'sha256:r8s9t0', '{}'),
('of_headphone_004', 'spu_headphone_004', 'm_euro_tech', 'cat_audio', 'Bose QuietComfort Ultra Headphones', 'Bose QC Ultra无线耳机', 'Bose', 'brand_bose', 429.99, 'USD', 250, ARRAY['battery_included'], ARRAY['FCC', 'CE'], 4.7, 2340, '[{"attr_id": "anc", "value": true}, {"attr_id": "spatial_audio", "value": true}]', 'sha256:s9t0u1', '{}'),
('of_earbuds_001', 'spu_earbuds_001', 'm_tech_mart', 'cat_audio', 'Sony WF-1000XM5 True Wireless Earbuds', 'Sony WF-1000XM5真无线耳机', 'Sony', 'brand_sony', 299.99, 'USD', 52, ARRAY['battery_included'], ARRAY['FCC', 'CE'], 4.8, 5670, '[{"attr_id": "anc", "value": true}, {"attr_id": "battery_hours", "value": 8}]', 'sha256:t0u1v2', '{}'),
('of_earbuds_002', 'spu_earbuds_002', 'm_anker', 'cat_audio', 'Anker Soundcore Liberty 4 NC', 'Anker Soundcore Liberty 4 NC', 'Anker', 'brand_anker', 99.99, 'USD', 48, ARRAY['battery_included'], ARRAY['FCC'], 4.6, 4560, '[{"attr_id": "anc", "value": true}, {"attr_id": "battery_hours", "value": 9}]', 'sha256:u1v2w3', '{}')
ON CONFLICT (id) DO UPDATE SET title_en = EXCLUDED.title_en;

-- ========================================
-- 屏幕保护膜
-- ========================================
INSERT INTO agent.offers (id, spu_id, merchant_id, category_id, title_en, title_zh, brand_name, brand_id, base_price, currency, weight_g, risk_tags, certifications, rating, reviews_count, attributes, version_hash, evidence_refs) VALUES
('of_sp_001', 'spu_sp_001', 'm_spigen', 'cat_screen_protectors', 'Spigen Tempered Glass for iPhone 15 Pro', 'Spigen钢化膜iPhone 15 Pro', 'Spigen', 'brand_spigen', 14.99, 'USD', 20, '{}', '{}', 4.7, 8900, '[{"attr_id": "material", "value": "tempered_glass"}, {"attr_id": "pack_count", "value": 2}]', 'sha256:v2w3x4', '{}'),
('of_sp_002', 'spu_sp_002', 'm_esr', 'cat_screen_protectors', 'ESR Armorite Screen Protector for iPhone 15', 'ESR钢化膜iPhone 15', 'ESR', 'brand_esr', 12.99, 'USD', 18, '{}', '{}', 4.6, 5670, '[{"attr_id": "material", "value": "tempered_glass"}, {"attr_id": "hardness", "value": "9H"}]', 'sha256:w3x4y5', '{}'),
('of_sp_003', 'spu_sp_003', 'm_spigen', 'cat_screen_protectors', 'Spigen Neo Flex for Galaxy S24 Ultra', 'Spigen软膜Galaxy S24 Ultra', 'Spigen', 'brand_spigen', 16.99, 'USD', 15, '{}', '{}', 4.5, 2340, '[{"attr_id": "material", "value": "tpu_film"}, {"attr_id": "curved", "value": true}]', 'sha256:x4y5z6', '{}'),
('of_sp_004', 'spu_sp_004', 'm_gadget_hub', 'cat_screen_protectors', 'Privacy Screen Protector for iPhone 15 Pro Max', '防窥膜iPhone 15 Pro Max', 'Generic', 'brand_generic', 18.99, 'USD', 25, '{}', '{}', 4.3, 1230, '[{"attr_id": "material", "value": "tempered_glass"}, {"attr_id": "privacy", "value": true}]', 'sha256:y5z6a7', '{}')
ON CONFLICT (id) DO UPDATE SET title_en = EXCLUDED.title_en;

-- ========================================
-- 添加更多品牌
-- ========================================
INSERT INTO agent.brands (id, name, normalized_name, country_of_origin, confidence, source) VALUES
('brand_generic', 'Generic', 'generic', NULL, 'low', 'platform_parse'),
('brand_belkin', 'Belkin', 'belkin', 'US', 'high', 'platform_parse'),
('brand_xiaomi', 'Xiaomi', 'xiaomi', 'CN', 'high', 'merchant_feed')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ========================================
-- SKU 数据（100+）
-- ========================================
INSERT INTO agent.skus (id, offer_id, options, price, currency, stock, risk_tags, compliance_tags, version_hash, evidence_refs) VALUES
-- 充电器 SKUs
('sku_charger_004_us', 'of_charger_004', '{"plug": "US"}', 55.99, 'USD', 500, '{}', '{}', 'sha256:sku1', '{}'),
('sku_charger_004_eu', 'of_charger_004', '{"plug": "EU"}', 58.99, 'USD', 300, '{}', ARRAY['CE_required'], 'sha256:sku2', '{}'),
('sku_charger_004_uk', 'of_charger_004', '{"plug": "UK"}', 58.99, 'USD', 200, '{}', ARRAY['CE_required'], 'sha256:sku3', '{}'),
('sku_charger_005_black', 'of_charger_005', '{"color": "black"}', 42.99, 'USD', 400, '{}', '{}', 'sha256:sku4', '{}'),
('sku_charger_005_white', 'of_charger_005', '{"color": "white"}', 42.99, 'USD', 350, '{}', '{}', 'sha256:sku5', '{}'),
('sku_charger_006_us', 'of_charger_006', '{"plug": "US"}', 65.99, 'USD', 250, '{}', '{}', 'sha256:sku6', '{}'),
('sku_charger_006_eu', 'of_charger_006', '{"plug": "EU"}', 68.99, 'USD', 180, '{}', ARRAY['CE_required'], 'sha256:sku7', '{}'),
('sku_charger_007_black', 'of_charger_007', '{"color": "black"}', 89.99, 'USD', 150, ARRAY['contains_magnet'], '{}', 'sha256:sku8', '{}'),
('sku_charger_007_white', 'of_charger_007', '{"color": "white"}', 89.99, 'USD', 120, ARRAY['contains_magnet'], '{}', 'sha256:sku9', '{}'),
('sku_charger_008_black', 'of_charger_008', '{"color": "black"}', 49.99, 'USD', 200, ARRAY['contains_magnet'], '{}', 'sha256:sku10', '{}'),

-- 移动电源 SKUs
('sku_pb_001_black', 'of_pb_001', '{"color": "black"}', 79.99, 'USD', 300, ARRAY['lithium_ion'], ARRAY['UN38.3_required'], 'sha256:sku11', '{}'),
('sku_pb_002_black', 'of_pb_002', '{"color": "black"}', 29.99, 'USD', 800, ARRAY['lithium_ion'], '{}', 'sha256:sku12', '{}'),
('sku_pb_002_white', 'of_pb_002', '{"color": "white"}', 29.99, 'USD', 600, ARRAY['lithium_ion'], '{}', 'sha256:sku13', '{}'),
('sku_pb_002_blue', 'of_pb_002', '{"color": "blue"}', 29.99, 'USD', 400, ARRAY['lithium_ion'], '{}', 'sha256:sku14', '{}'),
('sku_pb_003_black', 'of_pb_003', '{"color": "black"}', 59.99, 'USD', 250, ARRAY['lithium_ion'], ARRAY['UN38.3_required'], 'sha256:sku15', '{}'),
('sku_pb_004_black', 'of_pb_004', '{"color": "black"}', 35.99, 'USD', 500, ARRAY['lithium_ion'], '{}', 'sha256:sku16', '{}'),
('sku_pb_004_white', 'of_pb_004', '{"color": "white"}', 35.99, 'USD', 400, ARRAY['lithium_ion'], '{}', 'sha256:sku17', '{}'),
('sku_pb_005_black', 'of_pb_005', '{"color": "black"}', 99.99, 'USD', 100, ARRAY['lithium_ion', 'high_capacity'], ARRAY['UN38.3_required', 'ground_ship_only'], 'sha256:sku18', '{}'),

-- 手机壳 SKUs
('sku_case_004_black', 'of_case_004', '{"color": "black"}', 34.99, 'USD', 400, '{}', '{}', 'sha256:sku19', '{}'),
('sku_case_004_blue', 'of_case_004', '{"color": "blue"}', 34.99, 'USD', 300, '{}', '{}', 'sha256:sku20', '{}'),
('sku_case_004_red', 'of_case_004', '{"color": "red"}', 34.99, 'USD', 200, '{}', '{}', 'sha256:sku21', '{}'),
('sku_case_005_clear', 'of_case_005', '{"color": "clear"}', 27.99, 'USD', 500, '{}', '{}', 'sha256:sku22', '{}'),
('sku_case_006_black', 'of_case_006', '{"color": "black"}', 22.99, 'USD', 350, '{}', '{}', 'sha256:sku23', '{}'),
('sku_case_007_black', 'of_case_007', '{"color": "black"}', 35.99, 'USD', 200, ARRAY['contains_magnet'], '{}', 'sha256:sku24', '{}'),
('sku_case_007_blue', 'of_case_007', '{"color": "blue"}', 35.99, 'USD', 150, ARRAY['contains_magnet'], '{}', 'sha256:sku25', '{}'),
('sku_case_008_black', 'of_case_008', '{"color": "black"}', 45.99, 'USD', 100, '{}', '{}', 'sha256:sku26', '{}'),
('sku_case_008_brown', 'of_case_008', '{"color": "brown"}', 45.99, 'USD', 80, '{}', '{}', 'sha256:sku27', '{}'),

-- 耳机 SKUs
('sku_hp_001_black', 'of_headphone_001', '{"color": "black"}', 349.99, 'USD', 150, ARRAY['battery_included'], '{}', 'sha256:sku28', ARRAY['chunk_manual_004']),
('sku_hp_001_silver', 'of_headphone_001', '{"color": "silver"}', 349.99, 'USD', 100, ARRAY['battery_included'], '{}', 'sha256:sku29', ARRAY['chunk_manual_004']),
('sku_hp_002_black', 'of_headphone_002', '{"color": "black"}', 278.00, 'USD', 200, ARRAY['battery_included'], '{}', 'sha256:sku30', '{}'),
('sku_hp_002_silver', 'of_headphone_002', '{"color": "silver"}', 278.00, 'USD', 150, ARRAY['battery_included'], '{}', 'sha256:sku31', '{}'),
('sku_hp_002_blue', 'of_headphone_002', '{"color": "blue"}', 278.00, 'USD', 80, ARRAY['battery_included'], '{}', 'sha256:sku32', '{}'),
('sku_hp_003_black', 'of_headphone_003', '{"color": "black"}', 129.99, 'USD', 300, ARRAY['battery_included'], '{}', 'sha256:sku33', '{}'),
('sku_hp_003_blue', 'of_headphone_003', '{"color": "blue"}', 129.99, 'USD', 200, ARRAY['battery_included'], '{}', 'sha256:sku34', '{}'),
('sku_hp_004_black', 'of_headphone_004', '{"color": "black"}', 429.99, 'USD', 80, ARRAY['battery_included'], '{}', 'sha256:sku35', '{}'),
('sku_hp_004_white', 'of_headphone_004', '{"color": "white smoke"}', 429.99, 'USD', 60, ARRAY['battery_included'], '{}', 'sha256:sku36', '{}'),
('sku_eb_001_black', 'of_earbuds_001', '{"color": "black"}', 299.99, 'USD', 200, ARRAY['battery_included'], '{}', 'sha256:sku37', '{}'),
('sku_eb_001_silver', 'of_earbuds_001', '{"color": "silver"}', 299.99, 'USD', 150, ARRAY['battery_included'], '{}', 'sha256:sku38', '{}'),
('sku_eb_002_black', 'of_earbuds_002', '{"color": "black"}', 99.99, 'USD', 400, ARRAY['battery_included'], '{}', 'sha256:sku39', '{}'),
('sku_eb_002_white', 'of_earbuds_002', '{"color": "white"}', 99.99, 'USD', 300, ARRAY['battery_included'], '{}', 'sha256:sku40', '{}'),

-- 屏幕保护膜 SKUs
('sku_sp_001_2pack', 'of_sp_001', '{"pack": "2-pack"}', 14.99, 'USD', 800, '{}', '{}', 'sha256:sku41', '{}'),
('sku_sp_001_4pack', 'of_sp_001', '{"pack": "4-pack"}', 24.99, 'USD', 400, '{}', '{}', 'sha256:sku42', '{}'),
('sku_sp_002_2pack', 'of_sp_002', '{"pack": "2-pack"}', 12.99, 'USD', 600, '{}', '{}', 'sha256:sku43', '{}'),
('sku_sp_003_2pack', 'of_sp_003', '{"pack": "2-pack"}', 16.99, 'USD', 350, '{}', '{}', 'sha256:sku44', '{}'),
('sku_sp_004_1pack', 'of_sp_004', '{"pack": "1-pack"}', 18.99, 'USD', 200, '{}', '{}', 'sha256:sku45', '{}'),

-- 原有商品的 SKUs
('sku_case_001_black', 'of_case_001', '{"color": "black"}', 19.99, 'USD', 500, '{}', '{}', 'sha256:sku46', '{}'),
('sku_case_001_clear', 'of_case_001', '{"color": "clear"}', 19.99, 'USD', 400, '{}', '{}', 'sha256:sku47', '{}'),
('sku_case_001_navy', 'of_case_001', '{"color": "navy"}', 19.99, 'USD', 300, '{}', '{}', 'sha256:sku48', '{}'),
('sku_case_002_black', 'of_case_002', '{"color": "black"}', 24.99, 'USD', 350, '{}', '{}', 'sha256:sku49', '{}'),
('sku_case_002_crystal', 'of_case_002', '{"color": "crystal clear"}', 24.99, 'USD', 300, '{}', '{}', 'sha256:sku50', '{}'),
('sku_case_003_black', 'of_case_003', '{"color": "black"}', 29.99, 'USD', 250, ARRAY['contains_magnet'], '{}', 'sha256:sku51', '{}'),
('sku_case_003_blue', 'of_case_003', '{"color": "sierra blue"}', 29.99, 'USD', 200, ARRAY['contains_magnet'], '{}', 'sha256:sku52', '{}'),
('sku_charger_001_us', 'of_charger_001', '{"plug": "US"}', 45.99, 'USD', 400, ARRAY['battery_included'], '{}', 'sha256:sku53', '{}'),
('sku_charger_001_eu', 'of_charger_001', '{"plug": "EU"}', 48.99, 'USD', 250, ARRAY['battery_included'], ARRAY['CE_required'], 'sha256:sku54', '{}'),
('sku_charger_001_uk', 'of_charger_001', '{"plug": "UK"}', 48.99, 'USD', 150, ARRAY['battery_included'], ARRAY['CE_required'], 'sha256:sku55', '{}'),
('sku_charger_002_black', 'of_charger_002', '{"color": "black"}', 35.99, 'USD', 300, '{}', '{}', 'sha256:sku56', '{}'),
('sku_charger_003_white', 'of_charger_003', '{"color": "white"}', 39.99, 'USD', 250, '{}', '{}', 'sha256:sku57', '{}'),
('sku_charger_003_black', 'of_charger_003', '{"color": "black"}', 39.99, 'USD', 200, '{}', '{}', 'sha256:sku58', '{}')
ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, version_hash = EXCLUDED.version_hash;

-- ========================================
-- SKU 兼容性关系
-- ========================================
INSERT INTO agent.kg_sku_compatibility (sku_id, model_id, compatibility_type, confidence, source) VALUES
-- iPhone 15 Pro 兼容的壳
('sku_case_001_black', 'model_iphone_15_pro', 'compatible', 0.99, 'merchant_feed'),
('sku_case_001_clear', 'model_iphone_15_pro', 'compatible', 0.99, 'merchant_feed'),
('sku_case_001_navy', 'model_iphone_15_pro', 'compatible', 0.99, 'merchant_feed'),
('sku_case_004_black', 'model_iphone_15', 'compatible', 0.99, 'merchant_feed'),
('sku_case_004_blue', 'model_iphone_15', 'compatible', 0.99, 'merchant_feed'),
('sku_case_006_black', 'model_iphone_15_pro_max', 'compatible', 0.99, 'merchant_feed'),
('sku_case_007_black', 'model_iphone_15', 'compatible', 0.99, 'merchant_feed'),
-- Galaxy S24 兼容的壳
('sku_case_002_black', 'model_galaxy_s24', 'compatible', 0.99, 'merchant_feed'),
('sku_case_005_clear', 'model_galaxy_s24', 'compatible', 0.99, 'merchant_feed'),
('sku_case_008_black', 'model_galaxy_s24_ultra', 'compatible', 0.98, 'platform_parse'),
-- 屏幕膜
('sku_sp_001_2pack', 'model_iphone_15_pro', 'compatible', 0.99, 'merchant_feed'),
('sku_sp_002_2pack', 'model_iphone_15', 'compatible', 0.99, 'merchant_feed'),
('sku_sp_003_2pack', 'model_galaxy_s24_ultra', 'compatible', 0.99, 'merchant_feed'),
('sku_sp_004_1pack', 'model_iphone_15_pro_max', 'compatible', 0.98, 'platform_parse')
ON CONFLICT DO NOTHING;

-- ========================================
-- Offer 替代关系
-- ========================================
INSERT INTO agent.kg_offer_substitutes (offer_id, substitute_offer_id, similarity_score, reason, confidence, source) VALUES
('of_charger_001', 'of_charger_004', 0.85, 'Same brand, similar power output', 0.8, 'algorithm'),
('of_charger_001', 'of_charger_005', 0.75, 'Similar power output, different brand', 0.7, 'algorithm'),
('of_headphone_001', 'of_headphone_002', 0.9, 'Previous generation same series', 0.95, 'platform_parse'),
('of_headphone_001', 'of_headphone_004', 0.8, 'Competitor premium ANC headphones', 0.8, 'algorithm'),
('of_pb_001', 'of_pb_003', 0.7, 'Similar capacity, different brand', 0.7, 'algorithm'),
('of_case_001', 'of_case_004', 0.6, 'Different brand, same device', 0.65, 'algorithm')
ON CONFLICT DO NOTHING;

-- ========================================
-- Offer 配件关系
-- ========================================
INSERT INTO agent.kg_offer_complements (offer_id, complement_offer_id, relation_type, strength, reason, source) VALUES
('of_charger_007', 'of_case_003', 'accessory', 0.8, 'MagSafe compatible accessories', 'algorithm'),
('of_charger_007', 'of_case_007', 'accessory', 0.9, 'MagSafe compatible accessories', 'algorithm'),
('of_headphone_001', 'of_case_001', 'frequently_bought_together', 0.3, 'Often purchased together', 'algorithm'),
('of_pb_001', 'of_charger_001', 'accessory', 0.7, 'Power bank + charger bundle', 'algorithm'),
('of_case_001', 'of_sp_001', 'bundle', 0.85, 'Case + screen protector bundle', 'algorithm')
ON CONFLICT DO NOTHING;

-- ========================================
-- 验证数据
-- ========================================
DO $$
DECLARE
    offer_count INTEGER;
    sku_count INTEGER;
    compat_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO offer_count FROM agent.offers;
    SELECT COUNT(*) INTO sku_count FROM agent.skus;
    SELECT COUNT(*) INTO compat_count FROM agent.kg_sku_compatibility;
    RAISE NOTICE 'Extended data: % offers, % SKUs, % compatibility relations', offer_count, sku_count, compat_count;
END $$;

