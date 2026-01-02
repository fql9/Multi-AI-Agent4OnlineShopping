"""
Tool wrappers for calling MCP servers.

这些工具封装了对 Tool Gateway / MCP Servers 的调用。
所有工具都返回标准 Envelope 格式。

Enhanced with KG, risk_tag_definitions, and shipping_lanes support.
"""

from .catalog import (
    get_brand,
    get_category_tree,
    get_kg_relations,
    get_merchant,
    get_offer_card,
    search_offers,
)
from .checkout import add_to_cart, compute_total, create_cart, create_draft_order, get_draft_order_summary
from .compliance import (
    analyze_product_risks,
    check_compliance,
    get_compliance_rules,
    get_risk_tags,
    get_shipping_lanes,
)
from .evidence import create_evidence_snapshot
from .knowledge import get_chunk, index_product, search_knowledge, search_with_context
from .pricing import get_realtime_quote
from .shipping import quote_shipping_options, validate_address

__all__ = [
    # Catalog (Enhanced with KG)
    "search_offers",
    "get_offer_card",
    "get_brand",
    "get_merchant",
    "get_category_tree",
    "get_kg_relations",
    # Pricing
    "get_realtime_quote",
    # Shipping
    "quote_shipping_options",
    "validate_address",
    # Compliance (Enhanced with risk_tags and shipping_lanes)
    "check_compliance",
    "get_compliance_rules",
    "get_risk_tags",
    "analyze_product_risks",
    "get_shipping_lanes",
    # Checkout
    "create_cart",
    "add_to_cart",
    "compute_total",
    "create_draft_order",
    "get_draft_order_summary",
    # Evidence
    "create_evidence_snapshot",
    # Knowledge (RAG)
    "search_knowledge",
    "get_chunk",
    "index_product",
    "search_with_context",
]

