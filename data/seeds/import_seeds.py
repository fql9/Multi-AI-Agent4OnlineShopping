#!/usr/bin/env python3
"""
种子数据导入脚本

使用方法:
    cd data/seeds
    python import_seeds.py

功能:
    1. 导入类目树
    2. 导入属性定义
    3. 导入合规规则
    4. 导入/生成样例 AROC（扩展到 100+ SKU）
    5. 验证导入结果
"""

import sys
import io

# 修复 Windows 控制台编码问题
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import json
import random
import uuid
from pathlib import Path
from datetime import datetime
import asyncio

try:
    import asyncpg
except ImportError:
    print("请先安装 asyncpg: pip install asyncpg")
    asyncpg = None

# 数据库配置
DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "agent",
    "password": "agent_dev_password",
    "database": "agent_db",
}

# 数据文件路径
DATA_DIR = Path(__file__).parent
CATEGORIES_FILE = DATA_DIR / "categories.json"
ATTRIBUTES_FILE = DATA_DIR / "attributes.json"
COMPLIANCE_FILE = DATA_DIR / "compliance_rules.json"
AROC_FILE = DATA_DIR / "sample_aroc.json"


def load_json(filepath: Path) -> dict:
    """加载 JSON 文件"""
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def generate_uuid() -> str:
    """生成 UUID"""
    return str(uuid.uuid4())


def generate_additional_products(base_offers: list, target_count: int = 120) -> list:
    """
    基于样例商品生成更多商品数据
    """
    all_offers = list(base_offers)
    
    # 商品模板
    product_templates = [
        # 手机配件
        {"category": "cat_phone_cases", "brand": "CasePro", "price_range": (8, 25), "name_en": "Phone Case", "name_zh": "手机壳"},
        {"category": "cat_chargers", "brand": "ChargeFast", "price_range": (15, 60), "name_en": "USB Charger", "name_zh": "充电器"},
        {"category": "cat_screen_protectors", "brand": "ScreenGuard", "price_range": (5, 20), "name_en": "Screen Protector", "name_zh": "屏幕保护膜"},
        # 音频
        {"category": "cat_earbuds", "brand": "SoundWave", "price_range": (30, 150), "name_en": "Wireless Earbuds", "name_zh": "无线耳机"},
        {"category": "cat_headphones", "brand": "AudioMax", "price_range": (50, 300), "name_en": "Headphones", "name_zh": "头戴式耳机"},
        {"category": "cat_speakers", "brand": "BoomSound", "price_range": (25, 120), "name_en": "Bluetooth Speaker", "name_zh": "蓝牙音箱"},
        # 玩具
        {"category": "cat_lego", "brand": "LEGO", "price_range": (20, 500), "name_en": "LEGO Set", "name_zh": "乐高套装"},
        {"category": "cat_magnetic", "brand": "MagnaPlay", "price_range": (25, 100), "name_en": "Magnetic Tiles", "name_zh": "磁力片"},
        {"category": "cat_robots", "brand": "RoboKid", "price_range": (50, 200), "name_en": "Robot Kit", "name_zh": "机器人套装"},
        {"category": "cat_science_kits", "brand": "ScienceFun", "price_range": (20, 80), "name_en": "Science Kit", "name_zh": "科学实验套装"},
        # 家居
        {"category": "cat_blenders", "brand": "BlendMaster", "price_range": (40, 200), "name_en": "Blender", "name_zh": "搅拌机"},
        {"category": "cat_coffee_makers", "brand": "CoffeePro", "price_range": (30, 250), "name_en": "Coffee Maker", "name_zh": "咖啡机"},
        {"category": "cat_desk_lamps", "brand": "LightUp", "price_range": (15, 80), "name_en": "Desk Lamp", "name_zh": "台灯"},
        # 穿戴
        {"category": "cat_smartwatches", "brand": "WatchTech", "price_range": (80, 400), "name_en": "Smart Watch", "name_zh": "智能手表"},
        {"category": "cat_fitness_bands", "brand": "FitBand", "price_range": (30, 100), "name_en": "Fitness Band", "name_zh": "运动手环"},
        # 电脑配件
        {"category": "cat_keyboards", "brand": "KeyPro", "price_range": (30, 150), "name_en": "Keyboard", "name_zh": "键盘"},
        {"category": "cat_laptop_bags", "brand": "BagIt", "price_range": (25, 100), "name_en": "Laptop Bag", "name_zh": "电脑包"},
    ]
    
    colors = ["Black", "White", "Silver", "Blue", "Red", "Gray", "Pink"]
    merchants = ["m_001", "m_002", "m_003", "m_004", "m_005"]
    
    offer_counter = len(all_offers) + 1
    
    while len(all_offers) < target_count:
        template = random.choice(product_templates)
        
        price = round(random.uniform(*template["price_range"]), 2)
        color = random.choice(colors)
        merchant = random.choice(merchants)
        
        # 生成商品
        offer = {
            "offer_id": f"of_{offer_counter:03d}",
            "spu_id": f"spu_{template['category']}_{offer_counter:03d}",
            "merchant_id": merchant,
            "category_id": template["category"],
            "titles": {
                "en": f"{template['brand']} {template['name_en']} - {color}",
                "zh": f"{template['brand']} {template['name_zh']} - {color}"
            },
            "brand": {"name": template["brand"], "normalized_id": f"brand_{template['brand'].lower()}"},
            "price": {"amount": price, "currency": "USD"},
            "attributes": [
                {"attr_id": "attr_color", "value": color},
                {"attr_id": "attr_brand", "value": template["brand"]}
            ],
            "variants": [
                {
                    "sku_id": f"sku_{offer_counter:03d}_{color.lower()}",
                    "options": {"color": color},
                    "price": price,
                    "stock": random.randint(50, 1000)
                }
            ],
            "weight_g": random.randint(50, 3000),
            "dimensions_mm": {
                "l": random.randint(50, 400),
                "w": random.randint(30, 300),
                "h": random.randint(10, 200)
            },
            "risk_tags": [],
            "certifications": random.sample(["CE", "FCC", "RoHS", "UL"], k=random.randint(0, 3)),
            "return_policy": {"window_days": 30, "conditions": ["unused"]},
            "warranty_months": random.choice([0, 6, 12, 24]),
            "rating": round(random.uniform(3.5, 5.0), 1),
            "reviews_count": random.randint(100, 20000)
        }
        
        # 添加类目特定属性
        if "battery" in template["category"] or template["category"] in ["cat_earbuds", "cat_smartwatches", "cat_speakers"]:
            offer["risk_tags"].append("battery_included")
            offer["attributes"].append({"attr_id": "attr_battery_type", "value": "Built-in Lithium"})
        
        if template["category"] in ["cat_lego", "cat_magnetic", "cat_robots"]:
            offer["attributes"].append({"attr_id": "attr_age_range", "value": random.choice(["3-5 years", "6-8 years", "9-12 years"])})
            if random.random() > 0.5:
                offer["risk_tags"].append("small_parts")
        
        if template["category"] in ["cat_blenders", "cat_coffee_makers"]:
            offer["attributes"].append({"attr_id": "attr_plug_type", "value": random.choice(["US", "EU", "UK"])})
            offer["attributes"].append({"attr_id": "attr_voltage", "value": random.choice(["110V", "220V", "110-240V"])})
        
        all_offers.append(offer)
        offer_counter += 1
    
    return all_offers


async def import_categories(conn, categories_data: dict):
    """导入类目树"""
    print("\n📁 导入类目树...")
    
    def flatten_categories(cats, result=None):
        if result is None:
            result = []
        for cat in cats:
            result.append({
                "id": cat["id"],
                "name_en": cat["name"]["en"],
                "name_zh": cat["name"]["zh"],
                "parent_id": cat.get("parent_id"),
                "path": cat.get("path", [])
            })
            if "children" in cat:
                flatten_categories(cat["children"], result)
        return result
    
    flat_cats = flatten_categories(categories_data["categories"])
    
    for cat in flat_cats:
        await conn.execute("""
            INSERT INTO agent.categories (id, name_en, name_zh, parent_id, path, created_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (id) DO UPDATE SET
                name_en = EXCLUDED.name_en,
                name_zh = EXCLUDED.name_zh,
                parent_id = EXCLUDED.parent_id,
                path = EXCLUDED.path
        """, cat["id"], cat["name_en"], cat["name_zh"], cat["parent_id"], cat["path"])
    
    print(f"   ✅ 导入 {len(flat_cats)} 个类目")


async def import_compliance_rules(conn, rules_data: dict):
    """导入合规规则"""
    print("\n⚖️ 导入合规规则...")
    
    for rule in rules_data["rules"]:
        await conn.execute("""
            INSERT INTO agent.compliance_rules (id, name, rule_type, priority, condition, applies_to, action, severity, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                rule_type = EXCLUDED.rule_type,
                priority = EXCLUDED.priority,
                condition = EXCLUDED.condition,
                applies_to = EXCLUDED.applies_to,
                action = EXCLUDED.action,
                severity = EXCLUDED.severity
        """, 
            rule["id"],
            json.dumps(rule["name"]),
            rule["rule_type"],
            rule["priority"],
            json.dumps(rule["condition"]),
            json.dumps(rule["applies_to"]),
            json.dumps(rule["action"]),
            rule["severity"]
        )
    
    print(f"   ✅ 导入 {len(rules_data['rules'])} 条合规规则")


async def import_offers(conn, offers: list, merchants: list):
    """导入商品数据"""
    print("\n🛍️ 导入商品数据...")
    
    # 先导入商家
    for m in merchants:
        await conn.execute("""
            INSERT INTO agent.merchants (id, name, rating, ship_from, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                rating = EXCLUDED.rating,
                ship_from = EXCLUDED.ship_from
        """, m["id"], m["name"], m["rating"], m["ship_from"])
    
    print(f"   ✅ 导入 {len(merchants)} 个商家")
    
    # 导入商品
    sku_count = 0
    for offer in offers:
        await conn.execute("""
            INSERT INTO agent.offers (
                id, spu_id, merchant_id, category_id, 
                title_en, title_zh, brand_name, brand_id,
                base_price, currency, attributes,
                weight_g, dimensions_mm, risk_tags, certifications,
                return_policy, warranty_months, rating, reviews_count,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                title_en = EXCLUDED.title_en,
                title_zh = EXCLUDED.title_zh,
                base_price = EXCLUDED.base_price,
                attributes = EXCLUDED.attributes,
                updated_at = NOW()
        """,
            offer["offer_id"],
            offer["spu_id"],
            offer["merchant_id"],
            offer["category_id"],
            offer["titles"]["en"],
            offer["titles"]["zh"],
            offer["brand"]["name"],
            offer["brand"]["normalized_id"],
            offer["price"]["amount"],
            offer["price"]["currency"],
            json.dumps(offer["attributes"]),
            offer["weight_g"],
            json.dumps(offer["dimensions_mm"]),
            offer["risk_tags"],
            offer["certifications"],
            json.dumps(offer["return_policy"]),
            offer["warranty_months"],
            offer["rating"],
            offer["reviews_count"]
        )
        
        # 导入 SKU 变体
        for variant in offer["variants"]:
            await conn.execute("""
                INSERT INTO agent.skus (id, offer_id, options, price, currency, stock, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    options = EXCLUDED.options,
                    price = EXCLUDED.price,
                    stock = EXCLUDED.stock
            """,
                variant["sku_id"],
                offer["offer_id"],
                json.dumps(variant["options"]),
                variant["price"],
                offer["price"]["currency"],
                variant["stock"]
            )
            sku_count += 1
    
    print(f"   ✅ 导入 {len(offers)} 个商品, {sku_count} 个 SKU")


async def verify_import(conn):
    """验证导入结果"""
    print("\n🔍 验证导入结果...")
    
    # 检查各表数量
    tables = [
        ("categories", "agent.categories"),
        ("compliance_rules", "agent.compliance_rules"),
        ("merchants", "agent.merchants"),
        ("offers", "agent.offers"),
        ("skus", "agent.skus"),
    ]
    
    for name, table in tables:
        count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
        print(f"   {name}: {count} 条记录")
    
    # 测试查询
    print("\n📊 测试查询...")
    
    # 查询电子产品类目的商品
    electronics = await conn.fetch("""
        SELECT o.id, o.title_en, o.base_price, o.rating
        FROM agent.offers o
        WHERE o.category_id LIKE 'cat_e%' OR o.category_id LIKE 'cat_phone%'
        ORDER BY o.rating DESC
        LIMIT 5
    """)
    print(f"   电子产品 TOP5:")
    for p in electronics:
        print(f"      - {p['title_en'][:40]}... ${p['base_price']} ⭐{p['rating']}")
    
    # 查询含电池的商品
    battery_products = await conn.fetchval("""
        SELECT COUNT(*) FROM agent.offers
        WHERE 'battery_included' = ANY(risk_tags)
    """)
    print(f"\n   含电池产品: {battery_products} 个")
    
    print("\n✅ 验证完成!")


async def create_tables_if_needed(conn):
    """创建必要的表（如果不存在）"""
    print("📝 创建数据表...")
    
    # 删除旧表重建（开发阶段）
    await conn.execute("""
        DROP TABLE IF EXISTS agent.skus CASCADE;
        DROP TABLE IF EXISTS agent.offers CASCADE;
        DROP TABLE IF EXISTS agent.merchants CASCADE;
        DROP TABLE IF EXISTS agent.compliance_rules CASCADE;
        DROP TABLE IF EXISTS agent.categories CASCADE;
    """)
    
    await conn.execute("""
            -- 类目表
            CREATE TABLE IF NOT EXISTS agent.categories (
                id VARCHAR(100) PRIMARY KEY,
                name_en VARCHAR(200),
                name_zh VARCHAR(200),
                parent_id VARCHAR(100),
                path TEXT[],
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            
            -- 合规规则表
            CREATE TABLE IF NOT EXISTS agent.compliance_rules (
                id VARCHAR(100) PRIMARY KEY,
                name JSONB,
                rule_type VARCHAR(50),
                priority INT,
                condition JSONB,
                applies_to JSONB,
                action JSONB,
                severity VARCHAR(20),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            
            -- 商家表
            CREATE TABLE IF NOT EXISTS agent.merchants (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(200),
                rating DECIMAL(3,2),
                ship_from TEXT[],
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            
            -- 商品表
            CREATE TABLE IF NOT EXISTS agent.offers (
                id VARCHAR(100) PRIMARY KEY,
                spu_id VARCHAR(100),
                merchant_id VARCHAR(100),
                category_id VARCHAR(100),
                title_en TEXT,
                title_zh TEXT,
                brand_name VARCHAR(100),
                brand_id VARCHAR(100),
                base_price DECIMAL(12,2),
                currency VARCHAR(3) DEFAULT 'USD',
                attributes JSONB,
                weight_g INT,
                dimensions_mm JSONB,
                risk_tags TEXT[],
                certifications TEXT[],
                return_policy JSONB,
                warranty_months INT,
                rating DECIMAL(3,2),
                reviews_count INT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            
            -- SKU 表
            CREATE TABLE IF NOT EXISTS agent.skus (
                id VARCHAR(100) PRIMARY KEY,
                offer_id VARCHAR(100) REFERENCES agent.offers(id),
                options JSONB,
                price DECIMAL(12,2),
                currency VARCHAR(3) DEFAULT 'USD',
                stock INT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            
            -- 创建索引
            CREATE INDEX IF NOT EXISTS idx_offers_category ON agent.offers(category_id);
            CREATE INDEX IF NOT EXISTS idx_offers_merchant ON agent.offers(merchant_id);
            CREATE INDEX IF NOT EXISTS idx_offers_brand ON agent.offers(brand_id);
            CREATE INDEX IF NOT EXISTS idx_skus_offer ON agent.skus(offer_id);
        """)
    print("   ✅ 数据表创建完成")


async def main():
    """主函数"""
    print("=" * 60)
    print("🚀 种子数据导入脚本")
    print("=" * 60)
    
    if asyncpg is None:
        print("❌ 请先安装 asyncpg: pip install asyncpg")
        return
    
    # 加载数据文件
    print("\n📂 加载数据文件...")
    categories_data = load_json(CATEGORIES_FILE)
    print(f"   ✅ 类目树: {CATEGORIES_FILE.name}")
    
    # attributes_data = load_json(ATTRIBUTES_FILE)
    # print(f"   ✅ 属性定义: {ATTRIBUTES_FILE.name}")
    
    compliance_data = load_json(COMPLIANCE_FILE)
    print(f"   ✅ 合规规则: {COMPLIANCE_FILE.name}")
    
    aroc_data = load_json(AROC_FILE)
    print(f"   ✅ 样例 AROC: {AROC_FILE.name}")
    
    # 生成更多商品
    print("\n🔧 生成额外商品数据...")
    all_offers = generate_additional_products(aroc_data["offers"], target_count=120)
    print(f"   ✅ 共 {len(all_offers)} 个商品")
    
    # 连接数据库
    print("\n🔌 连接数据库...")
    try:
        conn = await asyncpg.connect(**DB_CONFIG)
        print("   ✅ 连接成功")
    except Exception as e:
        print(f"   ❌ 连接失败: {e}")
        print("\n💡 请确保 PostgreSQL 正在运行:")
        print("   docker compose up -d")
        return
    
    try:
        # 创建表
        await create_tables_if_needed(conn)
        
        # 导入数据
        await import_categories(conn, categories_data)
        await import_compliance_rules(conn, compliance_data)
        await import_offers(conn, all_offers, aroc_data["merchants"])
        
        # 验证
        await verify_import(conn)
        
    finally:
        await conn.close()
    
    print("\n" + "=" * 60)
    print("🎉 种子数据导入完成!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())

