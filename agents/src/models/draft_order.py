"""
Draft Order model definitions.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class DraftOrderItem(BaseModel):
    """草稿订单行项目"""

    sku_id: str
    offer_id: str
    title: str
    quantity: int = Field(ge=1)
    unit_price: Decimal
    currency: str = "USD"
    selected_options: dict[str, str] = Field(default_factory=dict)
    image_url: str | None = None


class PricingComponent(BaseModel):
    """价格组成项"""

    type: Literal[
        "item_subtotal",
        "discount",
        "shipping",
        "tax",
        "duty",
        "handling_fee",
        "insurance",
    ]
    amount: Decimal
    currency: str = "USD"
    description: str | None = None


class PricingBreakdown(BaseModel):
    """价格明细"""

    components: list[PricingComponent]
    subtotal: Decimal
    total: Decimal
    currency: str = "USD"
    assumptions: list[str] = Field(default_factory=list)


class ShippingOption(BaseModel):
    """物流选项"""

    shipping_option_id: str
    carrier: str
    service_level: str
    price: Decimal
    currency: str = "USD"
    eta_min_days: int
    eta_max_days: int
    tracking_supported: bool = True
    constraints: list[str] = Field(default_factory=list)


class TaxEstimate(BaseModel):
    """税费估算"""

    tax_total: Decimal
    duty_total: Decimal
    currency: str = "USD"
    method: Literal["rule_based", "hs_code", "ml_estimate"]
    confidence: Literal["low", "medium", "high"]
    breakdown: list[dict] = Field(default_factory=list)


class ComplianceSummary(BaseModel):
    """合规摘要"""

    allowed: bool
    reason_codes: list[str] = Field(default_factory=list)
    required_docs: list[str] = Field(default_factory=list)
    mitigations: list[str] = Field(default_factory=list)
    ruleset_version: str | None = None


class ConfirmationItem(BaseModel):
    """需要用户确认的项目"""

    type: Literal[
        "tax_estimate_uncertainty",
        "customs_fields_required",
        "compliance_warning",
        "return_cost_warning",
        "delivery_restriction",
        "price_change",
    ]
    title: str
    description: str
    requires_ack: bool = True


class DraftOrder(BaseModel):
    """
    草稿订单 - 可执行但未扣款的订单
    """

    # 标识
    draft_order_id: str
    user_id: str
    cart_id: str
    mission_id: str | None = None

    # 状态
    status: Literal[
        "created",
        "pending_confirmation",
        "confirmed",
        "expired",
        "cancelled",
    ] = "created"

    # 商品
    items: list[DraftOrderItem]

    # 收货
    address_id: str
    shipping_option: ShippingOption

    # 价格
    pricing_breakdown: PricingBreakdown
    tax_estimate: TaxEstimate

    # 合规
    compliance_summary: ComplianceSummary

    # 确认项
    confirmation_items: list[ConfirmationItem] = Field(default_factory=list)
    consents: dict[str, bool] = Field(default_factory=dict)

    # 证据
    evidence_snapshot_id: str

    # 时间
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "draft_order_id": "do_123456",
                "user_id": "u_789",
                "cart_id": "cart_abc",
                "status": "pending_confirmation",
                "items": [
                    {
                        "sku_id": "sku_001",
                        "offer_id": "of_001",
                        "title": "LEGO Technic Set",
                        "quantity": 1,
                        "unit_price": "49.99",
                        "currency": "USD",
                    }
                ],
            }
        }

