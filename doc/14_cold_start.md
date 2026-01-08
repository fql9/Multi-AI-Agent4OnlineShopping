# 14｜冷启动策略：从零到可用的数据准备

> 系统依赖 AROC、KG、Evidence、RAG 证据库等数据。本文档给出"从零开始"的冷启动策略。

---

## 冷启动的核心挑战

| 数据 | 挑战 | 影响 |
|------|------|------|
| **AROC（结构化商品卡）** | 商家 feed 质量参差、属性缺失 | 无法做变体筛选、合规判断 |
| **KG（知识图谱）** | 关系（兼容/替代）难以获取 | 无法推荐配件、替代品 |
| **RAG 证据库** | 说明书/条款需要抓取和切分 | 无法引用证据 |
| **Evidence Snapshot** | 无需冷启动 | 跟随交易产生 |

---

## 一、AROC 冷启动

### 阶段 1：商家结构化 Feed（优先级最高）

```
商家上传 → 平台解析 → 结构化入库
```

**要求商家提供的最小字段**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `sku_id` / `spu_id` | ✅ | 唯一标识 |
| `category_id` | ✅ | 类目 |
| `title` | ✅ | 标题（多语言） |
| `brand` | ✅ | 品牌 |
| `variants` | ✅ | 变体轴与选项（颜色/尺码/插头等） |
| `price` | ✅ | 价格 |
| `weight` / `dimensions` | ✅ | 重量/尺寸（影响运费/禁限运） |
| `risk_tags` | ✅ | 是否含电池/液体/磁铁等 |
| `return_policy` | ⚠️ | 退换条款 |
| `images` | ⚠️ | 商品图片 |

### 阶段 2：平台解析器（补齐缺失）

对于 Feed 缺失字段，用以下管道补齐：

```python
# data/pipelines/aroc_generator/

1. 抓取商品详情页 → 解析参数表 → 提取结构化字段
2. 解析说明书 PDF → OCR + LLM 抽取 → 候选字段
3. 所有 LLM 抽取结果必须带 confidence < 1.0
4. 低置信度字段进入人工复核队列
```

**关键原则**：

- LLM 抽取只能生成"候选字段"，不能直接当强事实
- 所有抽取字段必须带 `confidence` 和 `source: "llm_extract"`
- 高风险类目（电子/食品/母婴）必须人工复核

### 阶段 3：人工复核（高客单价/高风险）

| 类目 | 复核范围 |
|------|----------|
| 3C 电子 | 电压/插头/电池类型 |
| 母婴 | 材质/年龄适用/小零件警告 |
| 食品 | 成分/过敏原/保质期 |
| 美妆 | 成分/禁用物质 |

---

## 二、KG（知识图谱）冷启动

### 阶段 1：导入类目树与属性定义

```sql
-- 类目树
INSERT INTO categories (id, name, parent_id, path) VALUES ...

-- 属性定义
INSERT INTO attributes (id, name, type, values) VALUES
  ('plug_type', 'Plug Type', 'enum', '["US", "EU", "UK", "AU"]'),
  ('voltage', 'Voltage', 'enum', '["110V", "220V", "110-240V"]'),
  ...
```

### 阶段 2：导入平台规则

```sql
-- 合规规则
INSERT INTO compliance_rules (id, rule_type, applies_to, condition, action) VALUES
  ('cr_001', 'shipping_restriction', 'risk_tag:battery', 'dest_country=US', 'block_air'),
  ('cr_002', 'cert_required', 'category:electronics', 'dest_country=EU', 'require_ce'),
  ...

-- 退换政策
INSERT INTO return_policies (id, merchant_id, country, window_days, conditions) VALUES ...
```

### 阶段 3：增量构建关系（后期）

| 关系类型 | 来源 | 说明 |
|----------|------|------|
| `COMPATIBLE_WITH` | 商家声明 / 解析 | 手机壳↔机型 |
| `SUBSTITUTE_OF` | 行为数据（共购/共退货） | 替代品 |
| `COMPLEMENT_OF` | 商家声明 / 规则 | 配件组合 |

**MVP 阶段可以不做关系**，先跑通核心链路。

---

## 三、RAG 证据库冷启动

### 阶段 1：导入平台政策/条款

```python
# 优先级最高：平台规则必须先入库

documents = [
    {"type": "platform_policy", "title": "跨境退换政策", "path": "..."},
    {"type": "platform_policy", "title": "合规清关指南", "path": "..."},
    {"type": "shipping_policy", "title": "电池运输限制", "path": "..."},
]

for doc in documents:
    chunks = chunk_by_clause(doc)  # 按条款切分
    embed_and_index(chunks)
```

### 阶段 2：按需抓取说明书/QA

```python
# 根据商品热度/客单价/风险等级决定是否抓取

def should_fetch_manual(offer):
    return (
        offer.price > 50 or
        offer.risk_tags or
        offer.category in HIGH_RISK_CATEGORIES
    )

# 抓取后切分
chunks = chunk_by_section(manual)  # 按小节切分
for chunk in chunks:
    chunk.source_type = "manual"
    chunk.offer_id = offer.id
    chunk.doc_version_hash = hash(manual)
    embed_and_index(chunk)
```

### 阶段 3：评价洞察（聚类后入库）

```python
# 不要直接把评价原文入库！

# 正确姿势：
reviews = fetch_reviews(offer_id)
insights = cluster_and_extract_insights(reviews)
# 输出：["尺码偏小:30%", "物流慢:15%", "做工好:40%"]

for insight in insights:
    chunk = ReviewInsightChunk(
        text=insight.summary,
        support_count=insight.count,
        sentiment=insight.sentiment,
        evidence_review_ids=insight.review_ids,  # 可回溯
    )
    embed_and_index(chunk)
```

---

## 四、冷启动优先级（MVP）

| 优先级 | 数据 | 最小可用量 | 说明 |
|--------|------|------------|------|
| P0 | 类目树 | 完整 | 必须 |
| P0 | 属性定义 | 核心属性（插头/电压/材质等） | 必须 |
| P0 | 合规规则 | 10-20 条核心规则 | 电池/液体/禁运等 |
| P0 | 商家 AROC | 100-1000 SKU | 可手动导入 |
| P1 | 平台政策文档 | 5-10 份 | 退换/物流/清关 |
| P2 | 说明书 | 按需 | 高客单价商品 |
| P2 | 评价洞察 | 按需 | 热门商品 |
| P2 | KG 关系 | 按需 | 兼容/替代 |

---

## 五、冷启动验收标准

### MVP 验收

- [ ] 能查询 100+ SKU 的 AROC
- [ ] 能对 SKU 做合规判断（check_item）
- [ ] 能生成运费报价（quote_options）
- [ ] 能生成税费估算（estimate_duties_and_taxes）
- [ ] 能创建 Draft Order 并绑定 Evidence

### 不需要 MVP 验收

- 评价洞察
- 兼容/替代关系
- 说明书 RAG

---

## 六、真实数据导入 / 同步（推荐）

> 原则：**不使用种子数据**。冷启动阶段应尽快接入真实数据源（商家 feed / XOOBAY 等）。

### 方案 A：XOOBAY 同步（最快让系统“可搜可用”）

```bash
# 先跑迁移，再同步真实商品数据
docker compose -f docker-compose.full.yml --profile migrate up db-migrate
docker compose -f docker-compose.full.yml --profile sync run --rm xoobay-sync
```

### 方案 B：商家/ERP Feed（长期方案）

- 由商家/ERP 提供结构化 feed（CSV/JSON/Parquet）
- 入库前做字段校验、去重、版本化（version_hash），并将来源标记到 attributes/metadata（可审计）

---

## 七、增量更新策略

冷启动后，需要持续增量更新：

| 数据 | 更新频率 | 触发方式 |
|------|----------|----------|
| 价格/库存 | 实时 | 事件流 / API 轮询 |
| AROC 属性 | 天级 | 商家 feed 同步 |
| 合规规则 | 周/月级 | 运营手动更新 |
| 说明书/QA | 按需 | 商品上架时抓取 |
| 评价洞察 | 周级 | 批处理聚类 |

