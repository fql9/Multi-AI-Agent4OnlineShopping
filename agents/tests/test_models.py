"""
Tests for Pydantic models
"""

import pytest
from src.models.mission import MissionSpec, HardConstraint, SoftPreference


def test_mission_spec_minimal():
    """测试最小 MissionSpec"""
    mission = MissionSpec(
        query="Buy a phone case",
        destination_country="US",
    )
    assert mission.destination_country == "US"
    assert mission.budget_currency == "USD"
    assert len(mission.hard_constraints) == 0


def test_mission_spec_full():
    """测试完整 MissionSpec"""
    mission = MissionSpec(
        query="给孩子买 STEM 玩具",
        destination_country="US",
        budget_amount=80.0,
        budget_currency="USD",
        arrival_days_max=3,
        hard_constraints=[
            HardConstraint(
                constraint_type="child_safety",
                value="no_small_parts",
            ),
        ],
        soft_preferences=[
            SoftPreference(
                preference_type="brand_prefer",
                value="LEGO",
                weight=0.8,
            ),
        ],
    )
    assert mission.budget_amount == 80.0
    assert len(mission.hard_constraints) == 1
    assert mission.hard_constraints[0].constraint_type == "child_safety"


def test_hard_constraint_types():
    """测试硬约束类型"""
    constraint = HardConstraint(
        constraint_type="plug_type",
        value="US",
        description="美规插头",
    )
    assert constraint.constraint_type == "plug_type"
    assert constraint.value == "US"


def test_soft_preference_weight():
    """测试软偏好权重"""
    pref = SoftPreference(
        preference_type="price_sensitive",
        value="high",
        weight=0.9,
    )
    assert pref.weight == 0.9
    assert 0 <= pref.weight <= 1

