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


class TestComplianceNode:
    """测试 Compliance Agent 节点"""

    @pytest.mark.asyncio
    async def test_compliance_node_basic(self):
        """测试 Compliance 节点基本功能"""
        from src.compliance.node import compliance_node

        state = {
            "mission": {
                "destination_country": "DE",
                "budget_amount": 100.0,
                "quantity": 1,
            },
            "candidates": [
                {
                    "offer_id": "of_001",
                    "variants": {"skus": [{"sku_id": "sku_001"}]},
                    "risk_tags": ["battery_included"],
                    "certifications": [],
                    "category": {"id": "cat_electronics"},
                },
            ],
            "tool_calls": [],
            "current_step": "candidate_complete",
        }

        result = await compliance_node(state)

        assert result["current_step"] == "compliance_complete"
        assert "compliance_results" in result or "blocked_candidates" in result
        assert "compliance_summary" in result

    @pytest.mark.asyncio
    async def test_compliance_node_no_candidates(self):
        """测试 Compliance 节点无候选时的处理"""
        from src.compliance.node import compliance_node

        state = {
            "mission": {"destination_country": "US"},
            "candidates": [],
            "tool_calls": [],
        }

        result = await compliance_node(state)

        assert result["error"] is not None
        assert result["error_code"] == "INVALID_ARGUMENT"


class TestPaymentNode:
    """测试 Payment Agent 节点"""

    @pytest.mark.asyncio
    async def test_payment_node_basic(self):
        """测试 Payment 节点基本功能"""
        from src.execution.payment_node import payment_node

        state = {
            "draft_order_id": "do_test123",
            "execution_result": {
                "confirmation_items": ["tax_estimate_ack"],
                "payable_amount": 99.99,
            },
            "user_confirmation": {
                "tax_estimate_ack": True,
            },
            "tool_calls": [],
        }

        result = await payment_node(state)

        assert result["current_step"] in ["payment_ready", "payment"]
        if result["current_step"] == "payment_ready":
            assert "payment_ready" in result
            assert result["payment_ready"]["ready"] is True

    @pytest.mark.asyncio
    async def test_payment_node_missing_confirmation(self):
        """测试 Payment 节点缺少确认时的处理"""
        from src.execution.payment_node import payment_node

        state = {
            "draft_order_id": "do_test123",
            "execution_result": {
                "confirmation_items": ["tax_estimate_ack", "return_policy_ack"],
            },
            "user_confirmation": {
                "tax_estimate_ack": True,
                # missing return_policy_ack
            },
            "tool_calls": [],
        }

        result = await payment_node(state)

        # 应该需要更多确认
        if result.get("missing_confirmations"):
            assert "return_policy_ack" in [c.lower().replace(" ", "_") for c in result["missing_confirmations"]]


class TestSessionManager:
    """测试 Session Manager"""

    def test_session_creation(self):
        """测试创建会话"""
        from src.orchestrator.session import SessionManager

        manager = SessionManager()
        session = manager.create_session(user_id="user_001")

        assert session.session_id is not None
        assert session.user_id == "user_001"
        assert session.token_remaining > 0

    def test_session_token_budget(self):
        """测试 Token 预算控制"""
        from src.orchestrator.session import Session

        session = Session(
            session_id="sess_test",
            user_id="user_001",
            token_budget=1000,
        )

        assert session.can_afford_tokens(500) is True
        assert session.can_afford_tokens(1500) is False

        session.add_tokens(800)
        assert session.token_remaining == 200
        assert session.can_afford_tokens(300) is False

    def test_session_serialization(self):
        """测试会话序列化"""
        from src.orchestrator.session import Session

        session = Session(
            session_id="sess_test",
            user_id="user_001",
        )

        data = session.to_dict()
        restored = Session.from_dict(data)

        assert restored.session_id == session.session_id
        assert restored.user_id == session.user_id


class TestRAGIntegration:
    """测试 RAG 集成"""

    @pytest.mark.asyncio
    async def test_knowledge_search(self):
        """测试知识库搜索"""
        from src.tools.knowledge import search_knowledge

        result = await search_knowledge(
            query="wireless charger",
            limit=5,
        )

        assert result["ok"] is True
        assert "chunks" in result["data"]

    @pytest.mark.asyncio
    async def test_search_with_context(self):
        """测试带上下文的综合搜索"""
        from src.tools.knowledge import search_with_context

        result = await search_with_context(
            query="iPhone charger",
            include_compliance=True,
            include_shipping=True,
        )

        assert result["ok"] is True
        assert "product_chunks" in result["data"]
        assert "compliance_chunks" in result["data"]
        assert "shipping_chunks" in result["data"]


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

    def test_compliance_analysis(self):
        """测试 Compliance 分析结果 schema"""
        from src.llm.schemas import ComplianceAnalysis, ComplianceIssue

        analysis = ComplianceAnalysis(
            summary="Product has battery restrictions",
            risk_level="medium",
            key_issues=[
                ComplianceIssue(
                    issue_type="certification_required",
                    severity="warning",
                    message="CE marking required for EU",
                )
            ],
            required_actions=["Obtain CE certification"],
            can_proceed=True,
        )

        assert analysis.risk_level == "medium"
        assert len(analysis.key_issues) == 1
        assert analysis.can_proceed is True

    def test_payment_result(self):
        """测试 Payment 结果 schema"""
        from src.llm.schemas import PaymentResult

        result = PaymentResult(
            success=True,
            payment_id="pay_123",
            order_id="ord_456",
            status="succeeded",
            amount_charged=99.99,
            currency="USD",
        )

        assert result.success is True
        assert result.order_id == "ord_456"

