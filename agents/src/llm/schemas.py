"""
LLM 输出 Schema 定义

用于 LLM 的结构化输出。
"""

from typing import Literal

from pydantic import BaseModel, Field


# ==============================================
# Intent Agent Output Schema
# ==============================================
class HardConstraint(BaseModel):
    """硬性约束"""
    type: str = Field(description="约束类型: category, brand, voltage, certification, material, compatibility")
    value: str = Field(description="约束值")
    operator: str = Field(default="eq", description="操作符: eq, ne, in, not_in, gt, lt")


class SoftPreference(BaseModel):
    """软性偏好"""
    type: str = Field(description="偏好类型: brand, color, feature, price_range")
    value: str = Field(description="偏好值")
    weight: float = Field(default=0.5, ge=0.0, le=1.0, description="权重 0-1")


class ObjectiveWeights(BaseModel):
    """目标权重"""
    price: float = Field(default=0.4, ge=0.0, le=1.0, description="价格权重")
    speed: float = Field(default=0.3, ge=0.0, le=1.0, description="速度权重")
    risk: float = Field(default=0.3, ge=0.0, le=1.0, description="风险权重")


class MissionParseResult(BaseModel):
    """Intent Agent 解析结果"""
    destination_country: str | None = Field(default=None, description="目的国 ISO 代码")
    budget_amount: float | None = Field(default=None, description="预算金额")
    budget_currency: str = Field(default="USD", description="预算货币")
    quantity: int = Field(default=1, description="数量")
    arrival_days_max: int | None = Field(default=None, description="最长到货天数")
    hard_constraints: list[HardConstraint] = Field(default_factory=list, description="硬性约束")
    soft_preferences: list[SoftPreference] = Field(default_factory=list, description="软性偏好")
    objective_weights: ObjectiveWeights = Field(default_factory=ObjectiveWeights, description="目标权重")
    search_query: str = Field(default="", description="搜索关键词")
    needs_clarification: bool = Field(default=False, description="是否需要澄清")
    clarification_questions: list[str] = Field(default_factory=list, description="澄清问题")


# ==============================================
# Verifier Agent Output Schema (Simplified for LLM)
# ==============================================
class CandidateRanking(BaseModel):
    """候选排名（简化版）"""
    offer_id: str = Field(description="商品 ID")
    rank: int = Field(default=1, description="排名 1-10")
    score: float = Field(default=0.5, ge=0.0, le=1.0, description="综合得分 0-1")
    reason: str = Field(default="", description="评分理由")


class VerificationResult(BaseModel):
    """Verifier Agent 核验结果（简化版）"""
    rankings: list[CandidateRanking] = Field(default_factory=list, description="候选排名")
    top_recommendation: str = Field(default="", description="推荐的 offer_id")
    recommendation_reason: str = Field(default="", description="推荐理由")
    warnings: list[str] = Field(default_factory=list, description="警告信息")


# ==============================================
# Plan Agent Output Schema
# ==============================================
class PlanItem(BaseModel):
    """方案中的商品"""
    offer_id: str
    sku_id: str
    quantity: int
    unit_price: float
    subtotal: float


class TotalBreakdown(BaseModel):
    """费用明细"""
    subtotal: float = Field(description="商品小计")
    shipping_cost: float = Field(description="运费")
    tax_estimate: float = Field(description="税费估算")
    total_landed_cost: float = Field(description="到手总价")


class DeliveryEstimate(BaseModel):
    """送达时间估算"""
    min_days: int
    max_days: int
    min_date: str | None = None
    max_date: str | None = None


class PurchasePlan(BaseModel):
    """购买方案"""
    plan_name: str = Field(description="方案名称")
    plan_type: Literal["cheapest", "fastest", "best_value"] = Field(description="方案类型")
    items: list[PlanItem] = Field(default_factory=list)
    shipping_option_id: str = Field(description="运输选项 ID")
    shipping_option_name: str = Field(description="运输选项名称")
    total: TotalBreakdown
    delivery: DeliveryEstimate
    risks: list[str] = Field(default_factory=list, description="风险提示")
    confidence: float = Field(ge=0.0, le=1.0, description="置信度")
    confirmation_items: list[str] = Field(default_factory=list, description="需要用户确认的项目")


class PlanRecommendation(BaseModel):
    """Plan Agent 推荐结果（简化版，用于 LLM）"""
    recommended_plan: str = Field(default="Budget Saver", description="推荐方案名称")
    recommendation_reason: str = Field(default="Best value for your budget", description="推荐理由")
    alternative_suggestion: str = Field(default="", description="替代建议")


class PlanGenerationResult(BaseModel):
    """Plan Agent 方案生成结果"""
    plans: list[PurchasePlan] = Field(default_factory=list)
    recommended_plan: str = Field(default="", description="推荐方案的 plan_name")
    recommendation_reason: str = Field(default="", description="推荐理由")


# ==============================================
# Execution Agent Output Schema
# ==============================================
class ExecutionResult(BaseModel):
    """Execution Agent 执行结果"""
    success: bool
    draft_order_id: str | None = None
    cart_id: str | None = None
    total_amount: float | None = None
    currency: str = "USD"
    summary: str = Field(description="执行摘要")
    confirmation_items: list[str] = Field(default_factory=list)
    expires_at: str | None = None
    evidence_snapshot_id: str | None = None
    error_message: str | None = None

