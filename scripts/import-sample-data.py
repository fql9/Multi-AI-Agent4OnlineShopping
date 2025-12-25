#!/usr/bin/env python3
"""
导入示例数据到数据库

用法:
    python scripts/import-sample-data.py
"""

import asyncio
import json
from pathlib import Path

# 示例 AROC 数据
SAMPLE_OFFERS = [
    {
        "offer_id": "of_000001",
        "spu_id": "spu_000001",
        "merchant_id": "m_001",
        "titles": [
            {"lang": "en", "text": "LEGO Technic Building Set - 500 pieces"},
            {"lang": "zh", "text": "乐高科技系列积木套装 - 500片"},
        ],
        "brand": {"name": "LEGO", "normalized_id": "brand_lego", "confidence": "high"},
        "category": {
            "cat_id": "c_toys_stem",
            "path": ["Toys", "Building Toys", "STEM"],
        },
        "attributes": [
            {
                "attr_id": "age_range",
                "name": {"en": "Age Range", "zh": "适用年龄"},
                "value": {"type": "string", "normalized": "8-14"},
                "confidence": 0.95,
            },
            {
                "attr_id": "pieces_count",
                "name": {"en": "Pieces", "zh": "片数"},
                "value": {"type": "number", "normalized": 500},
                "confidence": 1.0,
            },
        ],
        "variants": {
            "axes": [],
            "skus": [
                {
                    "sku_id": "sku_000001_001",
                    "options": {},
                    "packaging": {"weight_g": 1200, "dim_mm": [300, 250, 100]},
                    "risk_tags": [],
                    "compliance_tags": [],
                }
            ],
        },
        "policies": {
            "return_policy_id": "rp_standard_30",
            "warranty_policy_id": "wp_lego_2year",
            "policy_summary": {
                "en": "30-day return, 2-year warranty on defects",
                "zh": "30天退货，2年质量保修",
            },
        },
        "risk_profile": {
            "fragile": False,
            "sizing_uncertainty": "low",
            "counterfeit_risk": "medium",
            "after_sale_complexity": "low",
        },
    },
    {
        "offer_id": "of_000002",
        "spu_id": "spu_000002",
        "merchant_id": "m_002",
        "titles": [
            {"lang": "en", "text": "USB-C Fast Charger 65W - US Plug"},
            {"lang": "zh", "text": "USB-C 快充充电器 65W - 美规插头"},
        ],
        "brand": {"name": "Anker", "normalized_id": "brand_anker", "confidence": "high"},
        "category": {
            "cat_id": "c_electronics_charger",
            "path": ["Electronics", "Phone Accessories", "Chargers"],
        },
        "attributes": [
            {
                "attr_id": "power_output",
                "name": {"en": "Power Output", "zh": "输出功率"},
                "value": {"type": "string", "normalized": "65W"},
                "confidence": 1.0,
            },
            {
                "attr_id": "plug_type",
                "name": {"en": "Plug Type", "zh": "插头类型"},
                "value": {"type": "enum", "normalized": "US"},
                "confidence": 1.0,
            },
            {
                "attr_id": "input_voltage",
                "name": {"en": "Input Voltage", "zh": "输入电压"},
                "value": {"type": "string", "normalized": "100-240V"},
                "confidence": 0.95,
            },
        ],
        "variants": {
            "axes": [
                {"axis": "color", "values": ["Black", "White"]},
                {"axis": "plug_type", "values": ["US", "EU", "UK"]},
            ],
            "skus": [
                {
                    "sku_id": "sku_000002_us_black",
                    "options": {"color": "Black", "plug_type": "US"},
                    "packaging": {"weight_g": 180, "dim_mm": [80, 50, 30]},
                    "risk_tags": [],
                    "compliance_tags": ["fcc_certified", "ul_listed"],
                },
                {
                    "sku_id": "sku_000002_us_white",
                    "options": {"color": "White", "plug_type": "US"},
                    "packaging": {"weight_g": 180, "dim_mm": [80, 50, 30]},
                    "risk_tags": [],
                    "compliance_tags": ["fcc_certified", "ul_listed"],
                },
            ],
        },
        "policies": {
            "return_policy_id": "rp_electronics_15",
            "warranty_policy_id": "wp_anker_18month",
            "policy_summary": {
                "en": "15-day return, 18-month warranty",
                "zh": "15天退货，18个月保修",
            },
        },
        "risk_profile": {
            "fragile": True,
            "sizing_uncertainty": "low",
            "counterfeit_risk": "high",
            "after_sale_complexity": "medium",
        },
    },
]


async def main():
    print("=" * 50)
    print("Sample Data Import")
    print("=" * 50)
    print()
    print(f"Prepared {len(SAMPLE_OFFERS)} sample offers")
    print()

    # TODO: Connect to database and insert
    # For now, just save to seeds directory
    seeds_dir = Path("data/seeds")
    seeds_dir.mkdir(parents=True, exist_ok=True)

    with open(seeds_dir / "sample_offers.json", "w", encoding="utf-8") as f:
        json.dump(SAMPLE_OFFERS, f, ensure_ascii=False, indent=2)

    print(f"Saved to: {seeds_dir / 'sample_offers.json'}")
    print()
    print("To import to database:")
    print("  1. Start PostgreSQL: docker compose up -d")
    print("  2. Run migration: cd data && alembic upgrade head")
    print("  3. Import data: python scripts/import-sample-data.py --db")


if __name__ == "__main__":
    asyncio.run(main())

