"""
Tool wrappers for calling MCP servers.

这些工具封装了对 Tool Gateway / MCP Servers 的调用。
所有工具都返回标准 Envelope 格式。
"""

from .catalog import get_offer_card, search_offers
from .checkout import add_to_cart, compute_total, create_cart, create_draft_order, get_draft_order_summary
from .compliance import check_compliance, get_compliance_rules
from .evidence import create_evidence_snapshot
from .knowledge import get_chunk, index_product, search_knowledge, search_with_context
from .pricing import get_realtime_quote
from .shipping import quote_shipping_options, validate_address

__all__ = [
    # Catalog
    "search_offers",
    "get_offer_card",
    # Pricing
    "get_realtime_quote",
    # Shipping
    "quote_shipping_options",
    "validate_address",
    # Compliance
    "check_compliance",
    "get_compliance_rules",
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

