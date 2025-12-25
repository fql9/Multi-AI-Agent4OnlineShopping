"""
Evidence Snapshot model definitions.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class ToolCallRecord(BaseModel):
    """工具调用记录"""

    tool: str
    tool_version: str | None = None
    request_redacted: dict = Field(default_factory=dict)
    response_hash: str
    response_ttl_seconds: int | None = None
    ts: datetime = Field(default_factory=datetime.utcnow)


class Citation(BaseModel):
    """证据引用"""

    chunk_id: str
    doc_version_hash: str | None = None
    offsets: list[int] = Field(default_factory=list, description="[start, end] offsets in source")
    source_type: str | None = None


class PolicyVersion(BaseModel):
    """策略版本记录"""

    policy_type: str
    version: str
    valid_from: datetime | None = None


class DerivedInfo(BaseModel):
    """推导信息"""

    assumptions: list[str] = Field(default_factory=list)
    risk_notes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class EvidenceSnapshot(BaseModel):
    """
    证据快照 - 可审计回放的关键事实集合
    """

    snapshot_id: str
    user_id: str | None = None
    session_id: str | None = None
    mission_id: str | None = None

    # 关联对象
    objects: dict = Field(
        default_factory=dict,
        description="Related object IDs: offer_ids, sku_ids, etc.",
    )

    # 工具调用记录
    tool_calls: list[ToolCallRecord] = Field(default_factory=list)

    # 策略版本
    policy_versions: dict[str, str] = Field(
        default_factory=dict,
        description="Policy type to version mapping",
    )

    # 证据引用
    citations: list[Citation] = Field(default_factory=list)

    # 推导信息
    derived: DerivedInfo = Field(default_factory=DerivedInfo)

    # 时间
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "snapshot_id": "ev_20241224_001",
                "user_id": "u_789",
                "mission_id": "ms_456",
                "objects": {"offer_ids": ["of_001"], "sku_ids": ["sku_001"]},
                "tool_calls": [
                    {
                        "tool": "pricing.get_realtime_quote",
                        "response_hash": "sha256:abc123",
                        "response_ttl_seconds": 60,
                    }
                ],
                "policy_versions": {"compliance_ruleset": "cr_2025_12_20"},
            }
        }

