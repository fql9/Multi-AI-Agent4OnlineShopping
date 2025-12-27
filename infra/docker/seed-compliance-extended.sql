-- ========================================
-- 扩展合规规则（10-20条）
-- 遵循 doc/05_tool_catalog.md 和 doc/13_security_risk.md
-- ========================================

INSERT INTO agent.compliance_rules (id, name, rule_type, priority, condition, applies_to, action, severity) VALUES

-- ========================================
-- 电池相关规则 (补充)
-- ========================================
('rule_battery_capacity_limit',
 '{"en": "High Capacity Battery Shipping Limit", "zh": "大容量电池运输限制"}',
 'shipping_restriction',
 15,
 '{"attribute": "attr_capacity_mah", "operator": ">", "value": 27000}',
 '{"categories": ["cat_power_banks"], "countries": ["*"]}',
 '{"type": "block_shipping", "blocked_methods": ["*"], "message": {"en": "Power banks over 27000mAh (100Wh) cannot be shipped internationally", "zh": "超过27000mAh（100Wh）的移动电源不能国际运输"}}',
 'error'),

('rule_battery_wh_label',
 '{"en": "Battery Wh Label Required", "zh": "电池Wh标签要求"}',
 'labeling',
 25,
 '{"attribute": "attr_battery_type", "operator": "in", "value": ["Built-in Lithium", "Lithium-ion", "Li-Po"]}',
 '{"categories": ["cat_power_banks", "cat_phones"], "countries": ["*"]}',
 '{"type": "require_label", "label": "Wh_rating", "message": {"en": "Lithium battery products must display Wh rating on packaging", "zh": "锂电池产品必须在包装上显示Wh额定值"}}',
 'warning'),

-- ========================================
-- 地区特定规则
-- ========================================
('rule_uk_ukca',
 '{"en": "UK UKCA Mark Required", "zh": "英国需要UKCA认证"}',
 'certification',
 52,
 '{"category": "cat_electronics"}',
 '{"categories": ["cat_electronics"], "countries": ["GB"]}',
 '{"type": "require_certification", "certification": "UKCA", "message": {"en": "Electronic products sold in UK require UKCA marking (post-Brexit)", "zh": "在英国销售的电子产品需要UKCA认证（脱欧后）"}}',
 'error'),

('rule_au_rcm',
 '{"en": "Australia RCM Required", "zh": "澳大利亚需要RCM认证"}',
 'certification',
 53,
 '{"category": "cat_electronics"}',
 '{"categories": ["cat_electronics"], "countries": ["AU"]}',
 '{"type": "require_certification", "certification": "RCM", "message": {"en": "Electronic products sold in Australia require RCM certification", "zh": "在澳大利亚销售的电子产品需要RCM认证"}}',
 'warning'),

('rule_jp_pse',
 '{"en": "Japan PSE Mark Required", "zh": "日本需要PSE认证"}',
 'certification',
 54,
 '{"category": "cat_chargers"}',
 '{"categories": ["cat_chargers", "cat_power_banks"], "countries": ["JP"]}',
 '{"type": "require_certification", "certification": "PSE", "message": {"en": "Electrical products sold in Japan require PSE mark", "zh": "在日本销售的电气产品需要PSE认证"}}',
 'error'),

('rule_kr_kc',
 '{"en": "Korea KC Certification Required", "zh": "韩国需要KC认证"}',
 'certification',
 55,
 '{"category": "cat_electronics"}',
 '{"categories": ["cat_electronics"], "countries": ["KR"]}',
 '{"type": "require_certification", "certification": "KC", "message": {"en": "Electronic products sold in South Korea require KC certification", "zh": "在韩国销售的电子产品需要KC认证"}}',
 'warning'),

('rule_cn_ccc',
 '{"en": "China CCC Certification Required", "zh": "中国需要CCC认证"}',
 'certification',
 56,
 '{"category": "cat_electronics"}',
 '{"categories": ["cat_chargers", "cat_audio"], "countries": ["CN"]}',
 '{"type": "require_certification", "certification": "CCC", "message": {"en": "Certain electronic products sold in China require CCC certification", "zh": "在中国销售的特定电子产品需要CCC认证"}}',
 'error'),

-- ========================================
-- 材料/成分相关规则
-- ========================================
('rule_rohs_compliance',
 '{"en": "RoHS Compliance Required", "zh": "需要RoHS合规"}',
 'compliance',
 60,
 '{"category": "cat_electronics"}',
 '{"categories": ["cat_electronics"], "countries": ["DE", "FR", "IT", "ES", "NL", "BE", "GB"]}',
 '{"type": "require_compliance", "standard": "RoHS", "message": {"en": "Electronic products must comply with RoHS directive", "zh": "电子产品必须符合RoHS指令"}}',
 'warning'),

('rule_reach_compliance',
 '{"en": "REACH Compliance for Plastics", "zh": "塑料产品REACH合规"}',
 'compliance',
 61,
 '{"attribute": "attr_material", "operator": "in", "value": ["TPU", "PC", "ABS", "Silicone"]}',
 '{"categories": ["cat_phone_cases"], "countries": ["DE", "FR", "IT", "ES", "NL", "BE"]}',
 '{"type": "require_compliance", "standard": "REACH", "message": {"en": "Plastic products sold in EU must comply with REACH regulation", "zh": "在欧盟销售的塑料产品必须符合REACH法规"}}',
 'info'),

-- ========================================
-- 价值/海关相关规则
-- ========================================
('rule_de_minimis_us',
 '{"en": "US De Minimis Threshold", "zh": "美国免税门槛"}',
 'customs',
 70,
 '{"order_value": {"operator": ">", "value": 800, "currency": "USD"}}',
 '{"categories": ["*"], "countries": ["US"]}',
 '{"type": "add_warning", "warning_type": "customs_duty", "message": {"en": "Orders over $800 may be subject to customs duties and taxes", "zh": "超过800美元的订单可能需要缴纳关税和税费"}}',
 'info'),

('rule_de_minimis_eu',
 '{"en": "EU De Minimis Threshold", "zh": "欧盟免税门槛"}',
 'customs',
 71,
 '{"order_value": {"operator": ">", "value": 150, "currency": "EUR"}}',
 '{"categories": ["*"], "countries": ["DE", "FR", "IT", "ES", "NL", "BE"]}',
 '{"type": "add_warning", "warning_type": "customs_duty", "message": {"en": "Orders over EUR 150 subject to VAT and possible customs duties", "zh": "超过150欧元的订单需缴纳增值税，可能还有关税"}}',
 'info'),

('rule_de_minimis_uk',
 '{"en": "UK De Minimis Threshold", "zh": "英国免税门槛"}',
 'customs',
 72,
 '{"order_value": {"operator": ">", "value": 135, "currency": "GBP"}}',
 '{"categories": ["*"], "countries": ["GB"]}',
 '{"type": "add_warning", "warning_type": "customs_duty", "message": {"en": "Orders over GBP 135 subject to VAT at point of sale", "zh": "超过135英镑的订单需在销售点缴纳增值税"}}',
 'info'),

-- ========================================
-- 运输限制规则
-- ========================================
('rule_fragile_packaging',
 '{"en": "Fragile Item Packaging Required", "zh": "易碎品包装要求"}',
 'packaging',
 80,
 '{"attribute": "attr_fragile", "operator": "==", "value": true}',
 '{"categories": ["*"], "countries": ["*"]}',
 '{"type": "require_packaging", "packaging": "fragile_box", "message": {"en": "Fragile items require special packaging", "zh": "易碎品需要特殊包装"}}',
 'warning'),

('rule_oversize_surcharge',
 '{"en": "Oversize Item Surcharge", "zh": "超大件附加费"}',
 'shipping_surcharge',
 81,
 '{"attribute": "attr_longest_side_cm", "operator": ">", "value": 100}',
 '{"categories": ["*"], "countries": ["*"]}',
 '{"type": "add_surcharge", "surcharge_type": "oversize", "message": {"en": "Items exceeding 100cm on longest side incur oversize surcharge", "zh": "最长边超过100cm的物品需加收超大件附加费"}}',
 'info'),

('rule_heavy_item_surcharge',
 '{"en": "Heavy Item Surcharge", "zh": "超重附加费"}',
 'shipping_surcharge',
 82,
 '{"attribute": "attr_weight_kg", "operator": ">", "value": 30}',
 '{"categories": ["*"], "countries": ["*"]}',
 '{"type": "add_surcharge", "surcharge_type": "overweight", "message": {"en": "Items over 30kg incur heavy item surcharge", "zh": "超过30kg的物品需加收超重附加费"}}',
 'info'),

-- ========================================
-- 特殊商品规则
-- ========================================
('rule_magsafe_pacemaker_warning',
 '{"en": "MagSafe Pacemaker Warning", "zh": "MagSafe起搏器警告"}',
 'health_warning',
 90,
 '{"attribute": "attr_contains_magnet", "operator": "==", "value": true}',
 '{"categories": ["cat_phone_cases", "cat_chargers"], "countries": ["*"]}',
 '{"type": "add_warning", "warning_type": "health", "message": {"en": "Strong magnets may interfere with pacemakers and other medical devices. Keep at safe distance.", "zh": "强磁铁可能干扰心脏起搏器和其他医疗设备，请保持安全距离。"}}',
 'info'),

('rule_wireless_fcc_id',
 '{"en": "Wireless Device FCC ID Required", "zh": "无线设备需要FCC ID"}',
 'certification',
 91,
 '{"attribute": "attr_wireless", "operator": "==", "value": true}',
 '{"categories": ["cat_audio", "cat_chargers"], "countries": ["US"]}',
 '{"type": "require_certification", "certification": "FCC_ID", "message": {"en": "Wireless devices sold in US require FCC ID", "zh": "在美国销售的无线设备需要FCC ID"}}',
 'warning')

ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, action = EXCLUDED.action;

-- ========================================
-- 验证
-- ========================================
DO $$
DECLARE
    rule_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO rule_count FROM agent.compliance_rules;
    RAISE NOTICE 'Total compliance rules: %', rule_count;
END $$;

