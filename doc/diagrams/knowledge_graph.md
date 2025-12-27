# 知识图谱 (Knowledge Graph) 架构图

> 解决综合类目"属性不统一 + 兼容关系复杂"的核心方案

## 实体关系总览 (ERD)

```mermaid
erDiagram
    OFFER ||--o{ SKU : "has"
    OFFER }o--|| CATEGORY : "belongs_to"
    OFFER }o--|| MERCHANT : "sold_by"
    OFFER }o--|| BRAND : "branded_as"
    
    SKU ||--o{ KG_SKU_COMPATIBILITY : "compatible_with"
    SKU ||--o{ KG_SKU_CERTIFICATES : "certified_by"
    
    MODEL }o--|| BRAND : "made_by"
    MODEL }o--|| CATEGORY : "in_category"
    KG_SKU_COMPATIBILITY }o--|| MODEL : "works_with"
    
    CERTIFICATE ||--o{ KG_SKU_CERTIFICATES : "certifies"
    
    OFFER ||--o{ KG_OFFER_SUBSTITUTES : "has_substitute"
    OFFER ||--o{ KG_OFFER_COMPLEMENTS : "has_complement"
    
    COMPLIANCE_RULE }o--|| CATEGORY : "applies_to"
    
    POLICY }o--o{ OFFER : "governs"
    POLICY }o--o{ MERCHANT : "governs"
    
    HS_CODE }o--o{ CATEGORY : "maps_to"
    
    OFFER {
        string id PK
        string spu_id
        string merchant_id FK
        string category_id FK
        string brand_id FK
        json attributes
        text[] risk_tags
        text[] evidence_refs
        string version_hash
    }
    
    SKU {
        string id PK
        string offer_id FK
        json options
        decimal price
        int stock
        text[] risk_tags
        text[] compliance_tags
        string version_hash
    }
    
    BRAND {
        string id PK
        string name
        string normalized_name
        string country_of_origin
        string confidence
    }
    
    MERCHANT {
        string id PK
        string name
        decimal rating
        boolean verified
        json capabilities
        int ship_out_sla_hours
    }
    
    MODEL {
        string id PK
        string name
        string brand_id FK
        int release_year
        json attributes
    }
    
    CERTIFICATE {
        string id PK
        string name
        string type
        string issuing_authority
        date valid_from
        date valid_to
    }
    
    POLICY {
        string id PK
        string type
        json name
        json summary
        json applies_to
    }
    
    HS_CODE {
        string id PK
        string code
        text description_en
        json duty_rates
    }
    
    CATEGORY {
        string id PK
        string name_en
        string name_zh
        text[] path
        int level
    }
    
    COMPLIANCE_RULE {
        string id PK
        json name
        string rule_type
        int priority
        json condition
        json action
        string severity
    }
```

---

## 知识图谱节点与边

```mermaid
graph TB
    subgraph Nodes["📦 实体 (Nodes)"]
        subgraph Core["核心实体 (MVP)"]
            Offer["🛒 Offer"]
            SKU["📦 SKU"]
            SPU["📋 SPU"]
            Category["📁 Category"]
            Brand["🏷️ Brand"]
            Merchant["🏪 Merchant"]
        end
        
        subgraph Compliance["合规实体"]
            CompRule["⚖️ ComplianceRule"]
            Cert["📜 Certificate"]
            Policy["📋 Policy"]
        end
        
        subgraph Extended["扩展实体 (P1)"]
            Model["📱 Model"]
            HSCode["🏷️ HSCode"]
            Warehouse["🏭 Warehouse"]
            ShipLane["🚢 ShippingLane"]
        end
    end
    
    subgraph Edges["🔗 关系 (Edges)"]
        direction TB
        E1["SKU --BELONGS_TO--> Offer"]
        E2["Offer --SOLD_BY--> Merchant"]
        E3["Offer --IN_CATEGORY--> Category"]
        E4["Offer --BRANDED_AS--> Brand"]
        E5["SKU --COMPATIBLE_WITH--> Model ✨"]
        E6["SKU --REQUIRES_CERT--> Certificate ✨"]
        E7["Offer --SUBSTITUTE_OF--> Offer ✨"]
        E8["Offer --COMPLEMENT_OF--> Offer ✨"]
        E9["CompRule --APPLIES_TO--> Category"]
        E10["Policy --GOVERNS--> Merchant"]
    end
    
    style Nodes fill:#1a1a2e,stroke:#16213e,color:#fff
    style Core fill:#0f3460,stroke:#16213e,color:#fff
    style Compliance fill:#533483,stroke:#16213e,color:#fff
    style Extended fill:#e94560,stroke:#16213e,color:#fff
    style Edges fill:#10b981,stroke:#059669,color:#fff
```

> ✨ 标记的关系为本次新增

---

## 兼容性关系图示

```mermaid
graph LR
    subgraph Cases["📱 手机壳"]
        Case1["Anker TPU Case\nsku_case_001"]
        Case2["Spigen Armor\nsku_case_004"]
        Case3["ESR MagSafe\nsku_case_003"]
    end
    
    subgraph Models["📲 设备型号"]
        IP15Pro["iPhone 15 Pro"]
        IP15["iPhone 15"]
        IP15PM["iPhone 15 Pro Max"]
        GS24["Galaxy S24"]
    end
    
    subgraph Chargers["🔌 充电器"]
        Charger1["Anker 65W\nsku_charger_001"]
        Charger2["MagSafe 3-in-1\nsku_charger_007"]
    end
    
    Case1 -->|"compatible\n0.99"| IP15Pro
    Case2 -->|"compatible\n0.99"| IP15
    Case3 -->|"compatible\n0.99"| IP15
    Case3 -->|"compatible\n0.98"| IP15Pro
    
    Charger2 -->|"accessory\n0.9"| Case3
    
    style Cases fill:#3b82f6,stroke:#2563eb,color:#fff
    style Models fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style Chargers fill:#10b981,stroke:#059669,color:#fff
```

---

## 替代品与配件关系

```mermaid
graph TB
    subgraph Main["🎯 主商品"]
        Charger65["Anker 65W Charger\nof_charger_001\n$45.99"]
    end
    
    subgraph Substitutes["🔄 替代品"]
        Sub1["Anker 735 Nano II\nof_charger_004\n$55.99\nsimilarity: 0.85"]
        Sub2["Baseus 67W\nof_charger_005\n$42.99\nsimilarity: 0.75"]
    end
    
    subgraph Complements["🧩 配件"]
        Comp1["Power Bank 25600mAh\nof_pb_001\nrelation: accessory\nstrength: 0.7"]
        Comp2["USB-C Cable\nof_cable_001\nrelation: bundle\nstrength: 0.85"]
    end
    
    Charger65 -->|"SUBSTITUTE_OF"| Sub1
    Charger65 -->|"SUBSTITUTE_OF"| Sub2
    Charger65 -->|"COMPLEMENT_OF"| Comp1
    Charger65 -->|"COMPLEMENT_OF"| Comp2
    
    style Main fill:#e94560,stroke:#16213e,color:#fff
    style Substitutes fill:#f59e0b,stroke:#d97706,color:#fff
    style Complements fill:#10b981,stroke:#059669,color:#fff
```

---

## 合规规则传播

```mermaid
flowchart TB
    subgraph Rules["⚖️ 合规规则"]
        R1["rule_battery_lithium\n锂电池需 UN38.3"]
        R2["rule_eu_ce_mark\n欧盟需 CE 认证"]
        R3["rule_battery_air_shipping\n电池空运限制"]
    end
    
    subgraph Categories["📁 类目"]
        Cat1["cat_power_banks"]
        Cat2["cat_chargers"]
        Cat3["cat_electronics"]
    end
    
    subgraph Countries["🌍 国家"]
        US["🇺🇸 US"]
        DE["🇩🇪 DE"]
        FR["🇫🇷 FR"]
        All["🌐 ALL"]
    end
    
    subgraph Actions["🚨 动作"]
        A1["require_certification: UN38.3"]
        A2["require_certification: CE"]
        A3["restrict_shipping: air blocked"]
    end
    
    R1 -->|"applies_to"| Cat1
    R1 -->|"applies_to"| Cat2
    R1 -->|"countries"| All
    R1 -->|"action"| A1
    
    R2 -->|"applies_to"| Cat3
    R2 -->|"countries"| DE
    R2 -->|"countries"| FR
    R2 -->|"action"| A2
    
    R3 -->|"applies_to"| Cat1
    R3 -->|"countries"| All
    R3 -->|"action"| A3
    
    style Rules fill:#ef4444,stroke:#dc2626,color:#fff
    style Categories fill:#3b82f6,stroke:#2563eb,color:#fff
    style Countries fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style Actions fill:#f59e0b,stroke:#d97706,color:#fff
```

---

## KG 服务化调用流程

```mermaid
sequenceDiagram
    participant Agent as 🤖 Agent
    participant KG as 📊 KG API
    participant DB as 🗄️ PostgreSQL
    
    Note over Agent,DB: 场景：查找 iPhone 15 Pro 兼容配件
    
    Agent->>KG: kg.get_compatible_models(sku_id)
    KG->>DB: SELECT * FROM kg_sku_compatibility
    DB-->>KG: [model_iphone_15_pro, ...]
    KG-->>Agent: {models: [...], confidence: 0.99}
    
    Agent->>KG: kg.get_complements(offer_id)
    KG->>DB: SELECT * FROM kg_offer_complements
    DB-->>KG: [screen_protector, charger, ...]
    KG-->>Agent: {complements: [...], relation_type: "accessory"}
    
    Agent->>KG: kg.get_substitutes(offer_id)
    KG->>DB: SELECT * FROM kg_offer_substitutes
    DB-->>KG: [similar_case_1, similar_case_2]
    KG-->>Agent: {substitutes: [...], similarity: 0.85}
    
    Note over Agent: Agent 使用 KG 数据优化推荐
```

---

## 数据库表结构

```mermaid
classDiagram
    class brands {
        +id: VARCHAR(255) PK
        +name: VARCHAR(255)
        +normalized_name: VARCHAR(255)
        +country_of_origin: VARCHAR(2)
        +confidence: VARCHAR(20)
        +source: VARCHAR(50)
        +version_hash: VARCHAR(64)
    }
    
    class merchants {
        +id: VARCHAR(255) PK
        +name: VARCHAR(255)
        +legal_name: VARCHAR(255)
        +country: VARCHAR(2)
        +rating: DECIMAL
        +verified: BOOLEAN
        +capabilities: JSONB
        +service_languages: TEXT[]
        +ship_out_sla_hours: INTEGER
    }
    
    class models {
        +id: VARCHAR(255) PK
        +name: VARCHAR(255)
        +brand_id: VARCHAR(255) FK
        +category_id: VARCHAR(255) FK
        +release_year: INTEGER
        +attributes: JSONB
    }
    
    class certificates {
        +id: VARCHAR(255) PK
        +name: VARCHAR(255)
        +type: VARCHAR(50)
        +issuing_authority: VARCHAR(255)
        +valid_from: DATE
        +valid_to: DATE
        +document_url: TEXT
        +confidence: VARCHAR(20)
    }
    
    class kg_sku_compatibility {
        +id: VARCHAR(255) PK
        +sku_id: VARCHAR(255)
        +model_id: VARCHAR(255) FK
        +compatible_sku_id: VARCHAR(255)
        +compatibility_type: VARCHAR(50)
        +confidence: DECIMAL
        +source: VARCHAR(50)
        +evidence_refs: TEXT[]
    }
    
    class kg_offer_substitutes {
        +id: VARCHAR(255) PK
        +offer_id: VARCHAR(255) FK
        +substitute_offer_id: VARCHAR(255) FK
        +similarity_score: DECIMAL
        +reason: VARCHAR(255)
        +confidence: DECIMAL
        +source: VARCHAR(50)
    }
    
    class kg_offer_complements {
        +id: VARCHAR(255) PK
        +offer_id: VARCHAR(255) FK
        +complement_offer_id: VARCHAR(255) FK
        +relation_type: VARCHAR(50)
        +strength: DECIMAL
        +reason: VARCHAR(255)
        +source: VARCHAR(50)
    }
    
    brands "1" --> "*" models : has
    kg_sku_compatibility "*" --> "1" models : references
    kg_offer_substitutes "*" --> "1" offers : source
    kg_offer_substitutes "*" --> "1" offers : target
    kg_offer_complements "*" --> "1" offers : source
    kg_offer_complements "*" --> "1" offers : target
```

