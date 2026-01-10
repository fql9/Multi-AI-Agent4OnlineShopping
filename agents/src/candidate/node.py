"""
Candidate Agent Node implementation.

基于 Mission 召回候选商品。
"""

from datetime import UTC

import structlog

from ..graph.state import AgentState
from ..llm.client import call_llm_and_parse
from ..llm.prompts import CANDIDATE_RELEVANCE_PROMPT
from ..llm.schemas import CandidateRelevanceResult
from ..tools.catalog import get_offer_card, search_offers

logger = structlog.get_logger()


async def candidate_node(state: AgentState) -> AgentState:
    """
    Candidate Agent 节点

    基于 Mission 召回候选商品
    """
    logger.info("candidate_node.start")

    try:
        mission = state.get("mission")
        if not mission:
            return {
                **state,
                "error": "No mission found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "candidate",
            }

        # 优先使用 mission 中的 search_query（由 Intent Agent 从用户输入中提取）
        # search_query 保持用户原始语言（中文/英文等）
        original_query = mission.get("search_query", "").strip()
        
        # 构建搜索查询 - 优先级：
        # 1. 直接使用 search_query（如果存在且有意义）
        # 2. 从硬性约束中提取产品类型关键词
        # 3. 作为最后手段，尝试从原始查询中提取关键词
        
        search_query = ""
        keywords = []
        
        # 检查 search_query 是否已经是一个有意义的搜索词
        # （对于中文，检测是否包含中文字符）
        if original_query and _is_meaningful_query(original_query):
            # 直接使用 search_query，它应该已经是用户想要搜索的产品关键词
            search_query = original_query
            keywords = [original_query]
            print(f"[DEBUG] candidate_node: using original search_query='{search_query}'")
        else:
            # 从硬性约束中提取主要关键词
            for constraint in mission.get("hard_constraints", []):
                value = constraint.get("value", "")
                constraint_type = constraint.get("type", "")
                # 跳过布尔值、操作符
                if value and value.lower() not in ("true", "false", "eq", "gt", "lt"):
                    # 优先添加产品类别和关键特征
                    if constraint_type in ("category", "product_type"):
                        keywords.insert(0, value)  # 类别放最前面
                    elif constraint_type in ("feature", "rugged"):
                        keywords.append(value)
            
            # 如果从约束中提取到了关键词，使用它们
            if keywords:
                search_query = " ".join(keywords[:4])
                print(f"[DEBUG] candidate_node: extracted keywords from constraints: {keywords}")
            else:
                # 最后尝试从原始查询中提取关键词（支持多语言）
                search_query = _extract_search_keywords(original_query)
                keywords = [search_query] if search_query else []
                print(f"[DEBUG] candidate_node: extracted from original query: '{search_query}'")
        
        # 确保有一个有效的搜索查询
        if not search_query:
            search_query = "product"
            
        print(f"[DEBUG] candidate_node.search: final query='{search_query}', keywords={keywords}")

        # 调用搜索工具 - 增加召回数量以便生成更多方案
        search_result = await search_offers(
            query=search_query.strip(),
            category_id=None,
            price_max=mission.get("budget_amount"),
            limit=50,  # 召回 50 个候选，以便有更多选择生成多个 plan
        )

        if not search_result.get("ok"):
            error_msg = search_result.get("error", {}).get("message", "Search failed")
            logger.error("candidate_node.search_failed", error=error_msg)
            return {
                **state,
                "error": error_msg,
                "error_code": "UPSTREAM_ERROR",
                "current_step": "candidate",
            }

        offer_ids = search_result.get("data", {}).get("offer_ids", [])
        logger.info("candidate_node.search_results", count=len(offer_ids))

        if not offer_ids:
            # 没有找到商品，可能需要放宽搜索条件
            return {
                **state,
                "candidates": [],
                "current_step": "candidate_complete",
                "error": "No products found matching your requirements",
                "error_code": "NOT_FOUND",
            }

        # 获取每个 offer 的详细信息（限制前 20 个以便生成多个方案）
        candidates = []
        for offer_id in offer_ids[:20]:
            try:
                aroc = await get_offer_card(offer_id=offer_id)
                if aroc.get("ok"):
                    candidate_data = aroc.get("data", {})
                    # 添加搜索分数
                    idx = offer_ids.index(offer_id)
                    scores = search_result.get("data", {}).get("scores", [])
                    candidate_data["search_score"] = scores[idx] if idx < len(scores) else 0.5
                    candidates.append(candidate_data)
            except Exception as e:
                logger.warning("candidate_node.get_aroc_failed", offer_id=offer_id, error=str(e))
                continue

        logger.info("candidate_node.fetched_candidates", count=len(candidates))

        # ====================================================
        # STRICT PRODUCT TYPE FILTERING
        # Use LLM to validate each candidate matches user's intent
        # ====================================================
        primary_type = mission.get("primary_product_type", "")
        primary_type_en = mission.get("primary_product_type_en", "")
        
        if (primary_type or primary_type_en) and candidates:
            logger.info(
                "candidate_node.relevance_filtering",
                primary_type=primary_type,
                primary_type_en=primary_type_en,
                initial_count=len(candidates),
            )
            
            validated_candidates = []
            filtered_out = []
            
            for candidate in candidates:
                is_relevant, reason = await _validate_candidate_relevance(
                    candidate,
                    primary_type,
                    primary_type_en,
                )
                if is_relevant:
                    validated_candidates.append(candidate)
                else:
                    title = candidate.get("titles", [{}])[0].get("text", "unknown")
                    filtered_out.append({"title": title, "reason": reason})
            
            logger.info(
                "candidate_node.filtering_complete",
                kept=len(validated_candidates),
                filtered_out=len(filtered_out),
                filtered_examples=filtered_out[:3],  # Log first 3 filtered items
            )
            
            # Use validated candidates
            candidates = validated_candidates
            
            # If all candidates were filtered out, return helpful error
            if not candidates:
                primary_display = primary_type_en or primary_type
                logger.warning(
                    "candidate_node.all_filtered_out",
                    primary_type=primary_display,
                    filtered_count=len(filtered_out),
                )
                return {
                    **state,
                    "candidates": [],
                    "current_step": "candidate_complete",
                    "error": f"No products matching '{primary_display}' found. The search returned related items but none matched your specific request.",
                    "error_code": "NO_EXACT_MATCH",
                }

        logger.info("candidate_node.complete", candidates_count=len(candidates))

        # 记录工具调用
        tool_calls = state.get("tool_calls", [])
        tool_calls.append({
            "tool_name": "catalog.search_offers",
            "request": {"query": search_query},
            "response_summary": {"count": len(offer_ids)},
            "called_at": _now_iso(),
        })

        return {
            **state,
            "candidates": candidates,
            "current_step": "candidate_complete",
            "tool_calls": tool_calls,
            "error": None,
        }

    except Exception as e:
        logger.error("candidate_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "candidate",
        }


def _now_iso() -> str:
    """返回当前时间的 ISO 格式"""
    from datetime import datetime
    return datetime.now(UTC).isoformat()


def _is_meaningful_query(query: str) -> bool:
    """
    检查查询是否是一个有意义的搜索词（而不是完整的句子）
    
    对于中文：检测是否包含中文字符且长度合适
    对于英文：检测是否是短语而非完整句子
    """
    if not query:
        return False
    
    query = query.strip()
    
    # 检测是否包含中文字符
    has_chinese = any('\u4e00' <= char <= '\u9fff' for char in query)
    
    if has_chinese:
        # 中文查询：如果长度在 2-20 个字符之间，认为是有意义的产品关键词
        # 排除包含明显句子结构的查询
        chinese_stop_patterns = ["我要", "我想", "帮我", "请给我", "我需要", "想买", "找一个", "找一件"]
        
        # 如果查询很短（只是产品名），直接认为有意义
        if len(query) <= 10:
            # 尝试移除常见的前缀
            cleaned = query
            for pattern in chinese_stop_patterns:
                if cleaned.startswith(pattern):
                    cleaned = cleaned[len(pattern):].strip()
            # 如果移除后还有内容，返回清理后的内容就是产品关键词
            return len(cleaned) >= 2
        
        # 较长的查询可能是完整句子
        return len(query) <= 20
    else:
        # 英文查询：检查是否像一个产品名称而不是完整句子
        words = query.lower().split()
        # 如果词数少于 6 个，可能是产品关键词
        if len(words) <= 5:
            return True
        # 包含常见句子开头，可能是完整句子
        sentence_starters = {"i", "please", "can", "could", "would", "help", "find"}
        if words[0] in sentence_starters:
            return False
        return len(words) <= 8


def _extract_search_keywords(query: str) -> str:
    """
    从用户查询中提取搜索关键词（支持多语言）
    
    Args:
        query: 用户输入的查询文本
        
    Returns:
        提取出的产品搜索关键词
    """
    if not query:
        return ""
    
    query = query.strip()
    
    # 检测是否包含中文字符
    has_chinese = any('\u4e00' <= char <= '\u9fff' for char in query)
    
    if has_chinese:
        # 中文处理：移除常见的无意义前缀和后缀
        chinese_prefixes = [
            "我要买", "我想买", "我需要", "我要", "我想", 
            "帮我找", "帮我买", "帮我", "请帮我", "请给我",
            "找一个", "找一件", "找", "买一个", "买一件", "买",
            "想要一个", "想要一件", "想要", "需要一个", "需要一件", "需要",
            "给我找", "给我买", "给我"
        ]
        chinese_suffixes = [
            "吧", "呢", "啊", "哦", "了", "的"
        ]
        
        result = query
        
        # 移除前缀
        for prefix in chinese_prefixes:
            if result.startswith(prefix):
                result = result[len(prefix):].strip()
                break
        
        # 移除数量词（如 "一个"、"一件"、"两双"）
        import re
        result = re.sub(r'^[一二三四五六七八九十两\d]+[个件双只条套][的]?', '', result)
        
        # 移除后缀
        for suffix in chinese_suffixes:
            if result.endswith(suffix):
                result = result[:-len(suffix)].strip()
        
        return result.strip() if result else query
    
    else:
        # 英文处理：移除常见停用词
        stop_words = {
            "i", "me", "my", "need", "want", "looking", "for", 
            "a", "an", "the", "to", "please", "can", "you", 
            "find", "get", "buy", "help", "with", "some",
            "budget", "ship", "within", "days", "under", "around"
        }
        
        # 分词并过滤
        words = query.lower().replace(",", "").replace(".", "").split()
        keywords = [w for w in words if w not in stop_words and len(w) > 1]
        
        # 返回前 4 个关键词
        return " ".join(keywords[:4]) if keywords else query


async def _validate_candidate_relevance(
    candidate: dict,
    primary_type: str,
    primary_type_en: str,
) -> tuple[bool, str]:
    """
    Validate if a candidate product matches the user's primary product type.
    
    Uses a two-tier approach:
    1. Quick heuristic check (keyword matching) - fast, no LLM call
    2. LLM validation for ambiguous cases - accurate, slower
    
    Args:
        candidate: The candidate product data
        primary_type: Primary product type in user's language
        primary_type_en: English translation of primary product type
        
    Returns:
        Tuple of (is_relevant, reason)
    """
    # Extract product info
    titles = candidate.get("titles", [])
    title = titles[0].get("text", "") if titles else ""
    title_lower = title.lower()
    
    category_obj = candidate.get("category", {})
    category = category_obj.get("name", "") if isinstance(category_obj, dict) else str(category_obj)
    category_lower = category.lower()
    
    # Build search terms list
    search_terms = []
    if primary_type:
        search_terms.append(primary_type.lower())
    if primary_type_en:
        search_terms.append(primary_type_en.lower())
        # Add common variations
        if primary_type_en.lower() == "charger":
            search_terms.extend(["charging", "power adapter", "usb charger", "wall charger"])
        elif primary_type_en.lower() == "dress":
            search_terms.extend(["gown", "frock"])
        elif primary_type_en.lower() == "blazer":
            search_terms.extend(["suit jacket", "sport coat", "suit blazer"])
        elif primary_type_en.lower() == "phone case":
            search_terms.extend(["case", "phone cover", "protective case"])
    
    # Remove empty terms
    search_terms = [t for t in search_terms if t]
    
    if not search_terms:
        # No primary type specified, accept all
        return True, "No product type filter specified"
    
    # Quick heuristic check: if any search term is in title or category
    for term in search_terms:
        if term in title_lower or term in category_lower:
            return True, f"Product title/category contains '{term}'"
    
    # Quick rejection for known mismatches (avoid LLM call for obvious cases)
    rejection_pairs = {
        "charger": ["case", "stand", "holder", "mount", "screen protector", "film", "earphone", "headphone"],
        "phone case": ["charger", "stand", "holder", "cable", "screen protector"],
        "dress": ["skirt", "blouse", "top", "pants", "shirt", "shorts"],
        "blazer": ["shirt", "pants", "shoes", "t-shirt", "jeans", "sneakers"],
    }
    
    product_type_key = primary_type_en.lower() if primary_type_en else primary_type.lower()
    if product_type_key in rejection_pairs:
        for reject_term in rejection_pairs[product_type_key]:
            if reject_term in title_lower:
                return False, f"Product is a '{reject_term}', not a '{product_type_key}'"
    
    # For ambiguous cases, use LLM validation
    try:
        result = await call_llm_and_parse(
            messages=[
                {"role": "system", "content": CANDIDATE_RELEVANCE_PROMPT},
                {
                    "role": "user",
                    "content": f"Primary type: {primary_type_en or primary_type}\nProduct: {title}\nCategory: {category}",
                },
            ],
            output_schema=CandidateRelevanceResult,
            model_type="fast",  # Use faster model for filtering
            temperature=0.0,
        )
        
        if result:
            return result.is_relevant, result.reason
        else:
            # LLM call failed, be conservative and include the product
            logger.warning(
                "_validate_candidate_relevance.llm_failed",
                title=title[:50],
                reason="LLM returned None",
            )
            return True, "LLM validation failed, including by default"
            
    except Exception as e:
        # On error, be conservative and include the product
        logger.warning(
            "_validate_candidate_relevance.error",
            title=title[:50],
            error=str(e),
        )
        return True, f"Validation error: {str(e)}"
