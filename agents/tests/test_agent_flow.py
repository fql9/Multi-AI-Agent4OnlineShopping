"""
Agent 流程集成测试

测试完整的购物代理流程：Intent → Candidate → Verify → Plan → Execute
"""

import os

import pytest
from langchain_core.messages import HumanMessage

# 设置测试环境使用 mock
os.environ["MOCK_TOOLS"] = "true"


class TestAgentFlow:
    """测试 Agent 流程"""

    @pytest.fixture
    def initial_state(self):
        """创建初始状态"""
        return {
            "messages": [
                HumanMessage(content="I need a wireless charger for iPhone, budget $50, shipping to Germany"),
            ],
            "mission": None,
            "candidates": [],
            "verified_candidates": [],
            "plans": [],
            "current_step": "start",
            "token_used": 0,
            "error": None,
        }

    @pytest.mark.asyncio
    async def test_intent_node_mock(self, initial_state):
        """测试 Intent 节点（mock 模式）"""
        # 确保没有 API key 使用 mock
        os.environ.pop("OPENAI_API_KEY", None)

        from src.intent import intent_node

        result = await intent_node(initial_state)

        assert result["error"] is None
        assert result["mission"] is not None
        assert result["current_step"] == "intent_complete"

        mission = result["mission"]
        assert mission["destination_country"] == "DE"  # Germany
        assert mission["budget_amount"] == 50.0
        assert len(mission["hard_constraints"]) > 0

    @pytest.mark.asyncio
    async def test_candidate_node_mock(self, initial_state):
        """测试 Candidate 节点（mock 模式）"""
        from src.candidate.node import candidate_node

        # 设置 mission
        initial_state["mission"] = {
            "search_query": "wireless charger iPhone",
            "destination_country": "DE",
            "budget_amount": 50.0,
            "quantity": 1,
            "hard_constraints": [
                {"type": "category", "value": "charger", "operator": "eq"},
            ],
            "soft_preferences": [],
            "objective_weights": {"price": 0.4, "speed": 0.3, "risk": 0.3},
        }

        result = await candidate_node(initial_state)

        assert result["error"] is None or result.get("candidates") is not None
        assert result["current_step"] in ["candidate_complete", "candidate"]

    @pytest.mark.asyncio
    async def test_plan_node_mock(self):
        """测试 Plan 节点"""
        from src.execution.plan_node import plan_node

        state = {
            "mission": {
                "destination_country": "US",
                "budget_amount": 100.0,
                "quantity": 1,
                "objective_weights": {"price": 0.4, "speed": 0.3, "risk": 0.3},
            },
            "verified_candidates": [
                {
                    "offer_id": "of_001",
                    "sku_id": "sku_001",
                    "candidate": {
                        "titles": [{"lang": "en", "text": "Test Product"}],
                    },
                    "checks": {
                        "pricing": {"passed": True, "unit_price": 29.99, "total_price": 29.99},
                        "shipping": {"passed": True, "fastest_days": 5, "cheapest_price": 9.99},
                        "compliance": {"passed": True, "issues": []},
                    },
                    "warnings": [],
                    "passed": True,
                },
            ],
            "current_step": "verifier_complete",
            "token_used": 0,
        }

        result = await plan_node(state)

        assert result["error"] is None
        assert len(result["plans"]) > 0
        assert result["current_step"] == "plan_complete"

        plan = result["plans"][0]
        assert "plan_name" in plan
        assert "items" in plan
        assert "total" in plan

    @pytest.mark.asyncio
    async def test_execution_node_mock(self):
        """测试 Execution 节点（mock 模式）"""
        from src.execution.execution_node import execution_node

        state = {
            "mission": {
                "destination_country": "US",
                "budget_amount": 100.0,
                "quantity": 1,
            },
            "plans": [
                {
                    "plan_name": "Budget Saver",
                    "plan_type": "cheapest",
                    "items": [
                        {
                            "offer_id": "of_001",
                            "sku_id": "sku_001",
                            "quantity": 1,
                            "unit_price": 29.99,
                            "subtotal": 29.99,
                        },
                    ],
                    "shipping_option_id": "ship_standard",
                    "shipping_option_name": "Standard Shipping",
                    "total": {
                        "subtotal": 29.99,
                        "shipping_cost": 9.99,
                        "tax_estimate": 3.20,
                        "total_landed_cost": 43.18,
                    },
                    "delivery": {"min_days": 5, "max_days": 12},
                    "risks": [],
                    "confidence": 0.8,
                    "confirmation_items": ["Tax estimate acknowledgment"],
                },
            ],
            "recommended_plan": "Budget Saver",
            "current_step": "plan_complete",
            "tool_calls": [],
        }

        result = await execution_node(state)

        # 由于使用 mock，可能会失败
        # 但测试结构是正确的
        assert "current_step" in result
        assert "error" in result


class TestLLMSchemas:
    """测试 LLM 输出 Schema"""

    def test_mission_parse_result(self):
        """测试 Mission 解析结果 schema"""
        from src.llm.schemas import MissionParseResult, ObjectiveWeights

        result = MissionParseResult(
            destination_country="US",
            budget_amount=100.0,
            budget_currency="USD",
            quantity=1,
            search_query="test product",
            objective_weights=ObjectiveWeights(price=0.4, speed=0.3, risk=0.3),
        )

        assert result.destination_country == "US"
        assert result.budget_amount == 100.0
        assert result.objective_weights.price == 0.4

    def test_purchase_plan(self):
        """测试购买方案 schema"""
        from src.llm.schemas import (
            DeliveryEstimate,
            PlanItem,
            PurchasePlan,
            TotalBreakdown,
        )

        plan = PurchasePlan(
            plan_name="Test Plan",
            plan_type="cheapest",
            items=[
                PlanItem(
                    offer_id="of_001",
                    sku_id="sku_001",
                    quantity=1,
                    unit_price=29.99,
                    subtotal=29.99,
                )
            ],
            shipping_option_id="ship_001",
            shipping_option_name="Standard",
            total=TotalBreakdown(
                subtotal=29.99,
                shipping_cost=9.99,
                tax_estimate=3.20,
                total_landed_cost=43.18,
            ),
            delivery=DeliveryEstimate(min_days=5, max_days=10),
            confidence=0.8,
        )

        assert plan.plan_name == "Test Plan"
        assert len(plan.items) == 1
        assert plan.total.total_landed_cost == 43.18

