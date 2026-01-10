"""
Intent Agent Node implementation.

解析用户意图，生成结构化的 MissionSpec。
"""


import structlog
from langchain_core.messages import AIMessage, HumanMessage

from ..config import get_settings
from ..graph.state import AgentState
from ..llm.client import call_llm_and_parse
from ..llm.prompts import INTENT_PREPROCESS_PROMPT, INTENT_PROMPT
from ..llm.schemas import IntentPreprocessResult, MissionParseResult

logger = structlog.get_logger()


async def intent_node(state: AgentState) -> AgentState:
    """
    Intent Agent 节点

    解析用户意图并生成结构化 MissionSpec
    """
    settings = get_settings()
    
    # 调试：检查当前 mission 状态
    current_mission = state.get("mission")
    print(f"[DEBUG] intent_node.start: has_mission={current_mission is not None}, step={state.get('current_step')}")
    
    # 如果已有 mission，直接返回（避免重复解析）
    if current_mission is not None:
        print("[DEBUG] intent_node.skip: mission already exists")
        return {
            **state,
            "current_step": "intent_complete",
        }

    try:
        # 获取最新的用户消息
        messages = state.get("messages", [])
        if not messages:
            return {
                **state,
                "error": "No user message provided",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "intent",
            }

        # 获取用户消息内容
        user_message = ""
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                user_message = msg.content
                break

        if not user_message:
            return {
                **state,
                "error": "No user message found",
                "error_code": "INVALID_ARGUMENT",
                "current_step": "intent",
            }

        # 检查是否有 API Key
        if not settings.openai_api_key:
            logger.warning("intent_node.no_api_key", msg="Using mock response")
            # 返回 mock 数据用于测试
            return _mock_intent_response(state, user_message)

        # 先用 LLM 做预处理：语言检测、归一化、翻译和澄清判断
        normalized_message = user_message
        translated_en = None
        preprocess_result = None
        try:
            preprocess_result = await call_llm_and_parse(
                messages=[
                    {"role": "system", "content": INTENT_PREPROCESS_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                output_schema=IntentPreprocessResult,
                model_type="planner",
                temperature=0.2,
            )

            if preprocess_result:
                if preprocess_result.needs_clarification:
                    clarification_msg = "我需要一些额外信息来澄清您的需求：\n"
                    for q in preprocess_result.clarification_questions:
                        clarification_msg += f"- {q}\n"
                    return {
                        **state,
                        "messages": [*messages, AIMessage(content=clarification_msg)],
                        "current_step": "awaiting_clarification",
                        "needs_clarification": True,
                        "error": None,
                    }

                normalized_message = preprocess_result.normalized_query or user_message
                translated_en = preprocess_result.translated_query_en
        except Exception as e:
            logger.warning("intent_node.preprocess_failed", error=str(e))

        # 构建消息
        prompt_messages = [
            {"role": "system", "content": INTENT_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Original query: {user_message}\n"
                    f"Normalized query: {normalized_message}\n"
                    f"English translation: {translated_en or ''}"
                ).strip(),
            },
        ]

        # 如果有历史对话，添加进去
        for msg in messages[:-1]:  # 除了最后一条
            if isinstance(msg, HumanMessage):
                prompt_messages.insert(-1, {"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                prompt_messages.insert(-1, {"role": "assistant", "content": msg.content})

        # 调用 LLM 并解析结果
        result = await call_llm_and_parse(
            messages=prompt_messages,
            output_schema=MissionParseResult,
            model_type="planner",
            temperature=0.1,
        )

        if result is None:
            logger.warning("intent_node.llm_parse_failed", msg="Falling back to mock")
            return _mock_intent_response(state, user_message)

        # 检查是否需要澄清
        if result.needs_clarification:
            logger.info(
                "intent_node.needs_clarification",
                questions=result.clarification_questions,
            )
            # 返回澄清问题
            clarification_msg = "我需要一些额外信息来帮您找到最合适的商品：\n"
            for q in result.clarification_questions:
                clarification_msg += f"- {q}\n"

            return {
                **state,
                "messages": [*messages, AIMessage(content=clarification_msg)],
                "current_step": "awaiting_clarification",
                "needs_clarification": True,
                "error": None,
            }

        # 构建 Mission 字典（包含购买上下文用于 AI 推荐）
        mission_dict = {
            "destination_country": result.destination_country,
            "budget_amount": result.budget_amount,
            "budget_currency": result.budget_currency,
            "quantity": result.quantity,
            "arrival_days_max": result.arrival_days_max,
            "hard_constraints": [c.model_dump() for c in result.hard_constraints],
            "soft_preferences": [p.model_dump() for p in result.soft_preferences],
            "objective_weights": result.objective_weights.model_dump(),
            "search_query": result.search_query or user_message,
            "primary_product_type": result.primary_product_type or "",
            "primary_product_type_en": result.primary_product_type_en or "",
            "detected_language": result.detected_language or (preprocess_result.detected_language if preprocess_result else "en"),
            "purchase_context": result.purchase_context.model_dump() if result.purchase_context else {},
        }

        # 估算 token 使用量（结构化输出没有直接返回 usage）
        token_used = state.get("token_used", 0) + 500  # 估算值

        logger.info(
            "intent_node.complete",
            destination_country=mission_dict.get("destination_country"),
            budget=mission_dict.get("budget_amount"),
            constraints_count=len(mission_dict.get("hard_constraints", [])),
        )

        return {
            **state,
            "mission": mission_dict,
            "current_step": "intent_complete",
            "token_used": token_used,
            "needs_clarification": False,
            "error": None,
        }

    except Exception as e:
        logger.error("intent_node.error", error=str(e))
        return {
            **state,
            "error": str(e),
            "error_code": "INTERNAL_ERROR",
            "current_step": "intent",
        }


def _mock_intent_response(state: AgentState, user_message: str) -> AgentState:
    """
    Mock 响应用于测试（无 API Key 时使用）
    支持多语言（中文/英文等）
    """
    print(f"[DEBUG] _mock_intent_response called with: {user_message[:50]}")
    import re
    
    message_lower = user_message.lower()

    # 检测目的国
    destination_country = "US"  # 默认
    if "germany" in message_lower or "德国" in user_message:
        destination_country = "DE"
    elif "uk" in message_lower or "england" in message_lower or "英国" in user_message:
        destination_country = "GB"
    elif "japan" in message_lower or "日本" in user_message:
        destination_country = "JP"
    elif "china" in message_lower or "中国" in user_message:
        destination_country = "CN"

    # 检测预算
    budget_amount = 100.0  # 默认
    budget_match = re.search(r"\$?(\d+(?:\.\d{2})?)", user_message)
    if budget_match:
        budget_amount = float(budget_match.group(1))

    # 检测是否包含中文
    has_chinese = any('\u4e00' <= char <= '\u9fff' for char in user_message)
    
    # 提取搜索关键词（核心改进：正确提取产品名称）
    search_query = _extract_product_keywords(user_message)
    
    # 检测约束
    hard_constraints = []
    
    if has_chinese:
        # 中文产品类型检测
        if search_query:
            hard_constraints.append({"type": "product_type", "value": search_query, "operator": "eq"})
        if "无线" in user_message:
            hard_constraints.append({"type": "feature", "value": "无线", "operator": "eq"})
        if "充电" in user_message:
            hard_constraints.append({"type": "feature", "value": "充电", "operator": "eq"})
    else:
        # 英文产品类型检测
        if "iphone" in message_lower:
            hard_constraints.append({"type": "compatibility", "value": "iPhone", "operator": "eq"})
        if "wireless" in message_lower:
            hard_constraints.append({"type": "feature", "value": "wireless", "operator": "eq"})
        if "charger" in message_lower:
            hard_constraints.append({"type": "category", "value": "charger", "operator": "eq"})
        if search_query:
            hard_constraints.append({"type": "product_type", "value": search_query, "operator": "eq"})

    # Extract primary product type for strict filtering
    primary_product_type = search_query
    primary_product_type_en = _translate_product_type_to_english(search_query, user_message)
    
    mission_dict = {
        "destination_country": destination_country,
        "budget_amount": budget_amount,
        "budget_currency": "USD",
        "quantity": 1,
        "arrival_days_max": 14,
        "hard_constraints": hard_constraints,
        "soft_preferences": [],
        "objective_weights": {"price": 0.4, "speed": 0.3, "risk": 0.3},
        "search_query": search_query,  # 使用提取的产品关键词，保持原始语言
        "primary_product_type": primary_product_type,
        "primary_product_type_en": primary_product_type_en,
    }

    print(f"[DEBUG] mock returning mission: country={mission_dict.get('destination_country')}, search_query='{search_query}', primary_type_en='{primary_product_type_en}'")

    return {
        **state,
        "mission": mission_dict,
        "current_step": "intent_complete",
        "token_used": 0,
        "needs_clarification": False,
        "error": None,
    }


def _extract_product_keywords(user_message: str) -> str:
    """
    从用户消息中提取产品关键词（支持多语言）
    
    Args:
        user_message: 用户输入的消息
        
    Returns:
        提取出的产品搜索关键词（保持用户原始语言）
    """
    import re
    
    if not user_message:
        return ""
    
    message = user_message.strip()
    
    # 检测是否包含中文
    has_chinese = any('\u4e00' <= char <= '\u9fff' for char in message)
    
    if has_chinese:
        # 中文处理：移除常见的无意义前缀
        chinese_prefixes = [
            "我要买", "我想买", "我需要", "我要", "我想", 
            "帮我找", "帮我买", "帮我", "请帮我", "请给我",
            "找一个", "找一件", "找", "买一个", "买一件", "买",
            "想要一个", "想要一件", "想要", "需要一个", "需要一件", "需要",
            "给我找", "给我买", "给我"
        ]
        chinese_suffixes = ["吧", "呢", "啊", "哦", "了", "的"]
        
        result = message
        
        # 移除前缀
        for prefix in chinese_prefixes:
            if result.startswith(prefix):
                result = result[len(prefix):].strip()
                break
        
        # 移除数量词（如 "一个"、"一件"、"两双"）
        result = re.sub(r'^[一二三四五六七八九十两\d]+[个件双只条套][的]?', '', result)
        
        # 移除后缀
        for suffix in chinese_suffixes:
            if result.endswith(suffix):
                result = result[:-len(suffix)].strip()
        
        return result.strip() if result else message
    
    else:
        # 英文处理：移除常见停用词，提取产品关键词
        stop_words = {
            "i", "me", "my", "need", "want", "looking", "for", 
            "a", "an", "the", "to", "please", "can", "you", 
            "find", "get", "buy", "help", "with", "some",
            "budget", "ship", "within", "days", "under", "around"
        }
        
        words = message.lower().replace(",", "").replace(".", "").split()
        keywords = [w for w in words if w not in stop_words and len(w) > 1]
        
        return " ".join(keywords[:4]) if keywords else message


def _translate_product_type_to_english(product_type: str, original_message: str) -> str:
    """
    Translate product type to English for matching.
    Uses a simple dictionary for common products, falls back to the original if English.
    
    Args:
        product_type: The extracted product type (may be Chinese or English)
        original_message: The original user message for context
        
    Returns:
        English translation of the product type
    """
    # Common Chinese to English product type mappings
    zh_en_mapping = {
        # Electronics
        "充电器": "charger",
        "数据线": "charging cable",
        "耳机": "earphones",
        "手机壳": "phone case",
        "手机支架": "phone stand",
        "电脑": "computer",
        "笔记本电脑": "laptop",
        "平板": "tablet",
        "键盘": "keyboard",
        "鼠标": "mouse",
        "音箱": "speaker",
        "蓝牙耳机": "bluetooth earphones",
        # Clothing
        "西装外套": "blazer",
        "西装": "suit",
        "外套": "jacket",
        "裙子": "dress",
        "连衣裙": "dress",
        "衬衫": "shirt",
        "T恤": "t-shirt",
        "裤子": "pants",
        "牛仔裤": "jeans",
        "鞋子": "shoes",
        "运动鞋": "sneakers",
        "高跟鞋": "high heels",
        # Accessories
        "手表": "watch",
        "项链": "necklace",
        "戒指": "ring",
        "包": "bag",
        "手提包": "handbag",
        "背包": "backpack",
        "钱包": "wallet",
        # Home
        "床垫": "mattress",
        "枕头": "pillow",
        "被子": "blanket",
        "台灯": "desk lamp",
    }
    
    # Check if product_type is Chinese and has a mapping
    if product_type in zh_en_mapping:
        return zh_en_mapping[product_type]
    
    # Check for partial matches in Chinese
    for zh, en in zh_en_mapping.items():
        if zh in product_type:
            return en
    
    # If already English or no mapping found, return as-is (lowercase)
    has_chinese = any('\u4e00' <= char <= '\u9fff' for char in product_type)
    if not has_chinese:
        return product_type.lower()
    
    # For Chinese without mapping, try to extract from original message if it has English
    message_lower = original_message.lower()
    common_products = [
        "charger", "case", "stand", "cable", "earphones", "headphones",
        "dress", "blazer", "jacket", "shirt", "pants", "shoes",
        "watch", "bag", "wallet", "laptop", "tablet", "mouse", "keyboard"
    ]
    for product in common_products:
        if product in message_lower:
            return product
    
    # Fallback: return the original
    return product_type
