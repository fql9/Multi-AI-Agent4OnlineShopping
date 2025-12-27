"""
Tool wrappers for calling MCP servers.

这些工具封装了对 Tool Gateway / MCP Servers 的调用。
所有工具都返回标准 Envelope 格式。
"""

from .catalog import get_offer_card, search_offers
from .checkout import add_to_cart, create_cart, create_draft_order
from .compliance import check_compliance
from .evidence import create_evidence_snapshot
from .kg import (
    get_brand_info,
    get_compatible_models,
    get_complements,
    get_merchant_info,
    get_sku_certificates,
    get_substitutes,
)
from .knowledge import extract_citations, get_chunk, search, search_for_offer, search_policy
from .pricing import get_realtime_quote
from .shipping import quote_shipping_options, validate_address

__all__ = [
    "search_offers",
    "get_offer_card",
    "get_realtime_quote",
    "quote_shipping_options",
    "validate_address",
    "check_compliance",
    "create_cart",
    "add_to_cart",
    "create_draft_order",
    "create_evidence_snapshot",
    # RAG / Knowledge
    "search",
    "search_for_offer",
    "search_policy",
    "get_chunk",
    "extract_citations",
    # Knowledge Graph
    "get_compatible_models",
    "get_substitutes",
    "get_complements",
    "get_sku_certificates",
    "get_brand_info",
    "get_merchant_info",
]

