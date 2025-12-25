"""
Mission (采购委托) model definitions.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class HardConstraint(BaseModel):
    """硬约束 - 必须满足，否则排除候选"""

    constraint_type: Literal[
        "plug_type",
        "voltage",
        "material_exclude",
        "brand_exclude",
        "child_safety",
        "no_battery",
        "no_liquid",
        "certification_required",
        "custom",
    ]
    value: str
    description: str | None = None


class SoftPreference(BaseModel):
    """软偏好 - 优先满足，但可放宽"""

    preference_type: Literal[
        "brand_prefer",
        "color_prefer",
        "price_sensitive",
        "quality_prefer",
        "eco_friendly",
        "fast_shipping",
        "custom",
    ]
    value: str
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    description: str | None = None


class ObjectiveWeights(BaseModel):
    """目标函数权重"""

    price: float = Field(default=0.4, ge=0.0, le=1.0)
    speed: float = Field(default=0.3, ge=0.0, le=1.0)
    risk: float = Field(default=0.3, ge=0.0, le=1.0)


class MissionSpec(BaseModel):
    """
    采购委托结构化规格
    由 Intent Agent 从用户自然语言解析生成
    """

    # 基础信息
    id: str | None = None
    user_id: str | None = None
    session_id: str | None = None

    # 目标
    query: str = Field(..., description="用户原始查询或需求描述")
    destination_country: str = Field(..., min_length=2, max_length=2, description="目的国 ISO 2字母代码")
    destination_postal_code: str | None = None

    # 预算
    budget_amount: float | None = Field(default=None, ge=0, description="预算金额")
    budget_currency: str = Field(default="USD", min_length=3, max_length=3)

    # 时效
    arrival_deadline: date | None = Field(default=None, description="期望到货日期")
    arrival_days_max: int | None = Field(default=None, ge=1, description="最多接受的到货天数")

    # 约束与偏好
    hard_constraints: list[HardConstraint] = Field(default_factory=list)
    soft_preferences: list[SoftPreference] = Field(default_factory=list)

    # 目标权重
    objective_weights: ObjectiveWeights = Field(default_factory=ObjectiveWeights)

    # 收货人信息（可选）
    address_id: str | None = None
    recipient_is_child: bool = False
    recipient_age: int | None = None

    class Config:
        json_schema_extra = {
            "example": {
                "query": "给 10 岁孩子买生日礼物，STEM 玩具，三天内到",
                "destination_country": "US",
                "budget_amount": 80.0,
                "budget_currency": "USD",
                "arrival_days_max": 3,
                "hard_constraints": [
                    {"constraint_type": "child_safety", "value": "no_small_parts"}
                ],
                "soft_preferences": [
                    {"preference_type": "brand_prefer", "value": "LEGO", "weight": 0.8}
                ],
            }
        }

