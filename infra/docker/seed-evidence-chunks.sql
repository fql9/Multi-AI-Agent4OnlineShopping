-- ========================================
-- RAG 证据块种子数据
-- 遵循 doc/10_rag_graphrag.md 规范
-- ========================================

-- 清空现有数据
DELETE FROM agent.evidence_chunks;

-- ========================================
-- 产品说明书 (manual)
-- ========================================

-- Anker MagSafe Charger 说明书
INSERT INTO agent.evidence_chunks (id, text, source_type, offer_id, sku_id, category_id, language, doc_version_hash, offsets)
VALUES 
('chunk_manual_001', 'This MagSafe wireless charger supports up to 15W fast charging for iPhone 12 and later models. For optimal charging, remove any cases thicker than 3mm. The charger is compatible with all Qi-enabled devices at up to 7.5W.', 'manual', 'of_charger_001', NULL, 'cat_chargers', 'en', 'doc_v1_anker_001', '{"start": 0, "end": 223}'),

('chunk_manual_002', 'Safety Instructions: Do not expose the charger to water or moisture. Operating temperature: 0°C to 35°C. Do not use damaged cables. Contains magnets - keep away from credit cards and pacemakers.', 'manual', 'of_charger_001', NULL, 'cat_chargers', 'en', 'doc_v1_anker_001', '{"start": 224, "end": 420}'),

('chunk_manual_003', 'Package Contents: 1x MagSafe Wireless Charger, 1x USB-C Cable (1.5m), 1x Quick Start Guide. Power adapter not included - requires USB-C PD adapter (20W or higher recommended).', 'manual', 'of_charger_001', NULL, 'cat_chargers', 'en', 'doc_v1_anker_001', '{"start": 421, "end": 601}');

-- Sony WH-1000XM5 耳机说明书
INSERT INTO agent.evidence_chunks (id, text, source_type, offer_id, sku_id, category_id, language, doc_version_hash, offsets)
VALUES 
('chunk_manual_004', 'Active Noise Cancellation: The WH-1000XM5 features our most advanced noise cancellation technology with 8 microphones and 2 processors. Adaptive Sound Control automatically adjusts based on your environment.', 'manual', 'of_headphone_001', NULL, 'cat_audio', 'en', 'doc_v1_sony_001', '{"start": 0, "end": 217}'),

('chunk_manual_005', 'Battery Life: Up to 30 hours with ANC on, 40 hours with ANC off. Quick charging provides 3 hours of playback from a 3-minute charge. Full charge takes approximately 3.5 hours via USB-C.', 'manual', 'of_headphone_001', NULL, 'cat_audio', 'en', 'doc_v1_sony_001', '{"start": 218, "end": 406}'),

('chunk_manual_006', 'Multipoint Connection: Connect to two Bluetooth devices simultaneously. Seamlessly switch between your phone and laptop. Supports SBC, AAC, and LDAC codecs for high-resolution audio.', 'manual', 'of_headphone_001', NULL, 'cat_audio', 'en', 'doc_v1_sony_001', '{"start": 407, "end": 593}');

-- ========================================
-- 政策条款 (policy)
-- ========================================

-- 退货政策
INSERT INTO agent.evidence_chunks (id, text, source_type, offer_id, sku_id, category_id, language, doc_version_hash, offsets)
VALUES 
('chunk_policy_001', 'Return Policy: Items may be returned within 30 days of delivery for a full refund. Items must be unused and in original packaging. Electronics must be factory sealed or include all original accessories.', 'policy', NULL, NULL, NULL, 'en', 'policy_return_v3', '{"start": 0, "end": 211}'),

('chunk_policy_002', 'International Returns: For orders shipped outside the US, buyer is responsible for return shipping costs. Customs duties and taxes paid are non-refundable. Allow 10-14 business days for refund processing.', 'policy', NULL, NULL, NULL, 'en', 'policy_return_v3', '{"start": 212, "end": 418}'),

('chunk_policy_003', 'Non-Returnable Items: Personalized products, opened software, intimate items, and hazardous materials cannot be returned. Battery-containing items may have additional restrictions based on shipping regulations.', 'policy', NULL, NULL, NULL, 'en', 'policy_return_v3', '{"start": 419, "end": 630}');

-- 保修政策
INSERT INTO agent.evidence_chunks (id, text, source_type, offer_id, sku_id, category_id, language, doc_version_hash, offsets)
VALUES 
('chunk_policy_004', 'Warranty Coverage: All electronics come with a minimum 12-month manufacturer warranty. Coverage includes defects in materials and workmanship. Physical damage, water damage, and unauthorized modifications void the warranty.', 'policy', NULL, NULL, 'cat_electronics', 'en', 'policy_warranty_v2', '{"start": 0, "end": 229}'),

('chunk_policy_005', 'Extended Warranty: Optional extended warranty available for purchase within 30 days of order. Extends coverage to 24 or 36 months. Includes accidental damage protection for portable devices.', 'policy', NULL, NULL, 'cat_electronics', 'en', 'policy_warranty_v2', '{"start": 230, "end": 421}');

-- ========================================
-- 合规信息 (compliance)
-- ========================================

INSERT INTO agent.evidence_chunks (id, text, source_type, offer_id, sku_id, category_id, language, doc_version_hash, offsets)
VALUES 
('chunk_compliance_001', 'Battery Shipping Regulations: Lithium-ion batteries must comply with UN38.3 testing requirements. Batteries over 100Wh require special documentation. Air shipping may be restricted for high-capacity batteries.', 'compliance', NULL, NULL, 'cat_electronics', 'en', 'compliance_battery_v4', '{"start": 0, "end": 216}'),

('chunk_compliance_002', 'EU CE Marking: All electronic products sold in the EU must bear the CE mark. This indicates compliance with EU safety, health, and environmental protection requirements. Required documentation includes Declaration of Conformity.', 'compliance', NULL, NULL, 'cat_electronics', 'en', 'compliance_ce_v2', '{"start": 0, "end": 232}'),

('chunk_compliance_003', 'FCC Certification (US): Electronic devices that emit radio frequency energy must be FCC certified. This includes wireless chargers, Bluetooth devices, and Wi-Fi enabled products. FCC ID must be visible on the product or packaging.', 'compliance', NULL, NULL, 'cat_electronics', 'en', 'compliance_fcc_v2', '{"start": 0, "end": 237}');

-- ========================================
-- FAQ / QA
-- ========================================

INSERT INTO agent.evidence_chunks (id, text, source_type, offer_id, sku_id, category_id, language, doc_version_hash, offsets)
VALUES 
('chunk_qa_001', 'Q: Can I use this charger with a phone case? A: Yes, the MagSafe charger works through most cases up to 3mm thick. Metal or magnetic cases may interfere with charging and should be removed.', 'qa', 'of_charger_001', NULL, 'cat_chargers', 'en', 'faq_charger_v1', NULL),

('chunk_qa_002', 'Q: Is this compatible with Android phones? A: Yes, all Qi-compatible Android phones can use this charger at up to 7.5W. MagSafe alignment features only work with iPhone 12 and later.', 'qa', 'of_charger_001', NULL, 'cat_chargers', 'en', 'faq_charger_v1', NULL),

('chunk_qa_003', 'Q: Can I wear these headphones while exercising? A: The WH-1000XM5 has IPX4 water resistance, suitable for light exercise and sweat. Not recommended for swimming or heavy rain exposure.', 'qa', 'of_headphone_001', NULL, 'cat_audio', 'en', 'faq_audio_v1', NULL),

('chunk_qa_004', 'Q: How do I reset the headphones? A: Press and hold the power button and custom button simultaneously for 7 seconds. The indicator will flash blue 4 times when reset is complete.', 'qa', 'of_headphone_001', NULL, 'cat_audio', 'en', 'faq_audio_v1', NULL);

-- ========================================
-- 运输信息 (shipping_policy)
-- ========================================

INSERT INTO agent.evidence_chunks (id, text, source_type, offer_id, sku_id, category_id, language, doc_version_hash, offsets)
VALUES 
('chunk_shipping_001', 'Germany Shipping: Standard shipping takes 7-14 business days. Express shipping (DHL) available for 3-5 business days delivery. Orders over EUR 150 may be subject to import duties and VAT.', 'shipping_policy', NULL, NULL, NULL, 'en', 'shipping_de_v2', NULL),

('chunk_shipping_002', 'UK Shipping: Post-Brexit, all orders to the UK are subject to customs inspection. VAT (20%) is collected at delivery. DDP (Delivered Duty Paid) option available for hassle-free delivery.', 'shipping_policy', NULL, NULL, NULL, 'en', 'shipping_uk_v3', NULL),

('chunk_shipping_003', 'Battery Shipping Restrictions: Items containing lithium batteries may only be shipped via ground or sea freight to certain destinations. Air express not available for power banks over 27,000mAh.', 'shipping_policy', NULL, NULL, NULL, 'en', 'shipping_battery_v2', NULL);

-- ========================================
-- 评价洞察 (review_insight)
-- ========================================

INSERT INTO agent.evidence_chunks (id, text, source_type, offer_id, sku_id, category_id, language, doc_version_hash, offsets)
VALUES 
('chunk_review_001', 'Review Insight: Charging Speed - 78% of reviewers report fast charging performance as expected. 15% note slower charging with thick cases. Common praise: "charges my iPhone 14 Pro from 0-50% in 30 minutes"', 'review_insight', 'of_charger_001', NULL, 'cat_chargers', 'en', 'review_summary_v1', NULL),

('chunk_review_002', 'Review Insight: Build Quality - 92% satisfaction with build quality. Common praise: premium feel, solid construction. Minor complaints: cable could be longer (mentioned in 8% of reviews).', 'review_insight', 'of_charger_001', NULL, 'cat_chargers', 'en', 'review_summary_v1', NULL),

('chunk_review_003', 'Review Insight: Noise Cancellation - 95% of reviewers rate ANC as excellent or good. Common comparisons: "better than AirPods Max", "significant upgrade from XM4". Wind noise is noted as an issue by 12% of users.', 'review_insight', 'of_headphone_001', NULL, 'cat_audio', 'en', 'review_summary_v1', NULL),

('chunk_review_004', 'Review Insight: Comfort - 89% find the headphones comfortable for extended use (2+ hours). Lighter weight compared to XM4 is frequently praised. 7% mention ear cup pressure after long sessions.', 'review_insight', 'of_headphone_001', NULL, 'cat_audio', 'en', 'review_summary_v1', NULL);

-- ========================================
-- 验证数据
-- ========================================

DO $$
DECLARE
    chunk_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO chunk_count FROM agent.evidence_chunks;
    RAISE NOTICE 'Inserted % evidence chunks', chunk_count;
END $$;

