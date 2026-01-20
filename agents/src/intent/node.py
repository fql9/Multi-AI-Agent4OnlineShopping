"""
Intent Agent Node implementation.

解析用户意图，生成结构化的 MissionSpec。
支持多意图识别、任务拆解和属性提取。
"""

import re
from typing import Any

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

    解析用户意图并生成结构化 MissionSpec。
    
    功能：
    1. 意图识别（search, compare, purchase, inquiry, recommendation 等）
    2. 多任务拆解（支持复合请求如"找个充电器，顺便看看手机壳"）
    3. 属性提取（颜色、尺寸、品牌、功率等）
    4. 购买上下文分析（送礼、自用、预算敏感度等）
    5. 智能澄清（仅在产品类型完全不明确时请求澄清）
    """
    settings = get_settings()
    
    # 调试：检查当前 mission 状态
    current_mission = state.get("mission")
    logger.debug(
        "intent_node.start",
        has_mission=current_mission is not None,
        step=state.get("current_step"),
    )
    
    # 如果已有 mission，直接返回（避免重复解析）
    if current_mission is not None:
        logger.debug("intent_node.skip", reason="mission already exists")
        return {
            **state,
            "current_step": "intent_complete",
        }

    try:
        # 获取最新的用户消息
        messages = state.get("messages", [])
        if not messages:
            return _error_response(state, "No user message provided", "INVALID_ARGUMENT")

        # 获取用户消息内容
        user_message = _extract_user_message(messages)
        if not user_message:
            return _error_response(state, "No user message found", "INVALID_ARGUMENT")

        # 检查是否有 API Key
        if not settings.openai_api_key:
            logger.warning("intent_node.no_api_key", msg="Using mock response")
            return _mock_intent_response(state, user_message)

        # 阶段一：预处理（语言检测、归一化、初步意图识别）
        preprocess_result = await _preprocess_query(user_message)
        
        # 如果预处理阶段就需要澄清，直接返回
        if preprocess_result and preprocess_result.needs_clarification:
            return _clarification_response(
                state, 
                messages, 
                preprocess_result.clarification_questions,
                preprocess_result.detected_language or "zh",
            )

        # 阶段二：完整意图解析
        result = await _parse_intent(
            user_message,
            preprocess_result,
            messages,
        )

        if result is None:
            logger.warning("intent_node.llm_parse_failed", msg="Falling back to mock")
            return _mock_intent_response(state, user_message)

        # 如果需要澄清，返回澄清问题
        if result.needs_clarification:
            return _clarification_response(
                state,
                messages,
                result.clarification_questions,
                result.detected_language,
                result.clarification_reason,
            )

        # 构建 Mission 字典
        mission_dict = _build_mission_dict(result, preprocess_result, user_message)

        # 估算 token 使用量
        token_used = state.get("token_used", 0) + 500

        logger.info(
            "intent_node.complete",
            primary_intent=result.primary_intent,
            has_multiple_tasks=result.has_multiple_tasks,
            sub_tasks_count=len(result.sub_tasks),
            destination_country=mission_dict.get("destination_country"),
            budget=mission_dict.get("budget_amount"),
            primary_product_type=mission_dict.get("primary_product_type_en"),
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
        return _error_response(state, str(e), "INTERNAL_ERROR")


def _extract_user_message(messages: list) -> str:
    """从消息列表中提取最新的用户消息"""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            return msg.content
    return ""


def _error_response(state: AgentState, error: str, error_code: str) -> AgentState:
    """生成错误响应"""
    return {
        **state,
        "error": error,
        "error_code": error_code,
        "current_step": "intent",
    }


def _clarification_response(
    state: AgentState,
    messages: list,
    questions: list[str],
    language: str = "zh",
    reason: str = "",
) -> AgentState:
    """生成澄清响应"""
    logger.info(
        "intent_node.needs_clarification",
        questions=questions,
        reason=reason,
    )
    
    # 根据语言选择提示语
    if language == "zh":
        prefix = "我需要一些额外信息来帮您找到最合适的商品：\n"
    else:
        prefix = "I need some additional information to help you find the best products:\n"
    
    clarification_msg = prefix
    for q in questions:
        clarification_msg += f"- {q}\n"

    return {
        **state,
        "messages": [*messages, AIMessage(content=clarification_msg)],
        "current_step": "awaiting_clarification",
        "needs_clarification": True,
        "error": None,
    }


async def _preprocess_query(user_message: str) -> IntentPreprocessResult | None:
    """
    预处理用户查询
    
    - 语言检测
    - 查询归一化
    - 英文翻译
    - 初步意图识别
    - 多意图检测
    """
    try:
        result = await call_llm_and_parse(
            messages=[
                {"role": "system", "content": INTENT_PREPROCESS_PROMPT},
                {"role": "user", "content": user_message},
            ],
            output_schema=IntentPreprocessResult,
            model_type="planner",
            temperature=0.2,
        )
        return result
    except Exception as e:
        logger.warning("intent_node.preprocess_failed", error=str(e))
        return None


async def _parse_intent(
    user_message: str,
    preprocess_result: IntentPreprocessResult | None,
    messages: list,
) -> MissionParseResult | None:
    """
    完整意图解析
    
    - 意图分类
    - 任务拆解
    - 属性提取
    - 约束识别
    - 购买上下文
    """
    # 准备归一化信息
    normalized_message = user_message
    translated_en = None
    primary_intent = "search"
    has_multiple = False
    
    if preprocess_result:
        normalized_message = preprocess_result.normalized_query or user_message
        translated_en = preprocess_result.translated_query_en
        primary_intent = preprocess_result.primary_intent
        has_multiple = preprocess_result.has_multiple_intents

    # 构建消息
    prompt_messages = [
        {"role": "system", "content": INTENT_PROMPT},
        {
            "role": "user",
            "content": (
                f"Original query: {user_message}\n"
                f"Normalized query: {normalized_message}\n"
                f"English translation: {translated_en or ''}\n"
                f"Detected primary intent: {primary_intent}\n"
                f"Has multiple intents: {has_multiple}"
            ).strip(),
        },
    ]

    # 添加历史对话上下文（最近 3 轮）
    history_messages = []
    for msg in messages[:-1]:  # 除了最后一条
        if isinstance(msg, HumanMessage):
            history_messages.append({"role": "user", "content": msg.content})
        elif isinstance(msg, AIMessage):
            history_messages.append({"role": "assistant", "content": msg.content})
    
    # 只保留最近 6 条消息（3 轮对话）
    for hist_msg in history_messages[-6:]:
        prompt_messages.insert(-1, hist_msg)

    # 调用 LLM
    result = await call_llm_and_parse(
        messages=prompt_messages,
        output_schema=MissionParseResult,
        model_type="planner",
        temperature=0.1,
    )
    
    return result


def _build_mission_dict(
    result: MissionParseResult,
    preprocess_result: IntentPreprocessResult | None,
    user_message: str,
) -> dict[str, Any]:
    """
    构建 Mission 字典
    
    包含所有解析出的信息，供下游 Agent 使用
    """
    # 获取英文搜索查询：优先使用 LLM 结果，其次使用预处理翻译
    search_query_en = result.search_query_en or ""
    if not search_query_en and preprocess_result:
        search_query_en = preprocess_result.translated_query_en or ""

    # 获取检测的语言
    detected_language = result.detected_language
    if not detected_language and preprocess_result:
        detected_language = preprocess_result.detected_language
    detected_language = detected_language or "en"

    # 构建子任务列表
    sub_tasks = []
    if result.sub_tasks:
        sub_tasks = [
            {
                "task_id": t.task_id,
                "intent_type": t.intent_type,
                "description": t.description,
                "description_en": t.description_en,
                "product_type": t.product_type,
                "product_type_en": t.product_type_en,
                "priority": t.priority,
                "depends_on": t.depends_on,
                "extracted_attributes": t.extracted_attributes,
            }
            for t in result.sub_tasks
        ]

    # 构建提取的属性
    extracted_attrs = {}
    if result.extracted_attributes:
        attrs = result.extracted_attributes
        extracted_attrs = {
            "color": attrs.color,
            "size": attrs.size,
            "brand": attrs.brand,
            "material": attrs.material,
            "style": attrs.style,
            "gender": attrs.gender,
            "age_group": attrs.age_group,
            "power": attrs.power,
            "connectivity": attrs.connectivity,
            "compatibility": attrs.compatibility,
            **attrs.extra,
        }
        # 移除 None 值
        extracted_attrs = {k: v for k, v in extracted_attrs.items() if v is not None}

    mission_dict = {
        # 意图信息
        "primary_intent": result.primary_intent,
        "has_multiple_tasks": result.has_multiple_tasks,
        "sub_tasks": sub_tasks,
        
        # 基础信息
        "destination_country": result.destination_country or "US",
        "budget_amount": result.budget_amount,
        "budget_currency": result.budget_currency,
        "quantity": result.quantity,
        "arrival_days_max": result.arrival_days_max,
        
        # 约束与偏好
        "hard_constraints": [c.model_dump() for c in result.hard_constraints],
        "soft_preferences": [p.model_dump() for p in result.soft_preferences],
        "objective_weights": result.objective_weights.model_dump(),
        
        # 搜索关键词
        "search_query": result.search_query or user_message,
        "search_query_en": search_query_en,
        "primary_product_type": result.primary_product_type or "",
        "primary_product_type_en": result.primary_product_type_en or "",
        
        # 提取的属性
        "extracted_attributes": extracted_attrs,
        
        # 上下文
        "detected_language": detected_language,
        "purchase_context": result.purchase_context.model_dump() if result.purchase_context else {},
    }

    return mission_dict


def _mock_intent_response(state: AgentState, user_message: str) -> AgentState:
    """
    Mock 响应用于测试（无 API Key 时使用）
    
    支持：
    - 多语言（中文/英文等）
    - 多意图识别
    - 任务拆解
    - 属性提取
    """
    logger.debug("intent_node.mock", message=user_message[:50])
    
    message_lower = user_message.lower()
    has_chinese = _has_chinese(user_message)
    detected_language = "zh" if has_chinese else "en"

    # 1. 意图识别
    primary_intent = _detect_intent(user_message, has_chinese)
    
    # 2. 检测多任务
    has_multiple_tasks, sub_tasks = _detect_multi_tasks(user_message, has_chinese)

    # 3. 检测目的国
    destination_country = _detect_country(user_message)

    # 4. 检测预算
    budget_amount, budget_currency = _detect_budget(user_message)

    # 5. 提取产品关键词
    search_query = _extract_product_keywords(user_message)
    
    # 6. 提取属性
    extracted_attrs = _extract_attributes(user_message, has_chinese)

    # 7. 生成硬约束
    hard_constraints = _generate_constraints(user_message, search_query, has_chinese)

    # 8. 产品类型翻译
    primary_product_type = search_query
    primary_product_type_en = _translate_product_type_to_english(search_query, user_message)

    # 9. 购买上下文
    purchase_context = _extract_purchase_context(user_message, has_chinese)

    # 10. 检测时效要求
    arrival_days_max = _detect_arrival_days(user_message)

    mission_dict = {
        # 意图信息
        "primary_intent": primary_intent,
        "has_multiple_tasks": has_multiple_tasks,
        "sub_tasks": sub_tasks,
        
        # 基础信息
        "destination_country": destination_country,
        "budget_amount": budget_amount,
        "budget_currency": budget_currency,
        "quantity": 1,
        "arrival_days_max": arrival_days_max,
        
        # 约束与偏好
        "hard_constraints": hard_constraints,
        "soft_preferences": [],
        "objective_weights": {"price": 0.4, "speed": 0.3, "risk": 0.3},
        
        # 搜索关键词
        "search_query": search_query,
        "search_query_en": primary_product_type_en,
        "primary_product_type": primary_product_type,
        "primary_product_type_en": primary_product_type_en,
        
        # 提取的属性
        "extracted_attributes": extracted_attrs,
        
        # 上下文
        "detected_language": detected_language,
        "purchase_context": purchase_context,
    }

    logger.debug(
        "intent_node.mock.complete",
        primary_intent=primary_intent,
        has_multiple_tasks=has_multiple_tasks,
        search_query=search_query,
        primary_type_en=primary_product_type_en,
    )

    return {
        **state,
        "mission": mission_dict,
        "current_step": "intent_complete",
        "token_used": 0,
        "needs_clarification": False,
        "error": None,
    }


def _has_chinese(text: str) -> bool:
    """检测文本是否包含中文"""
    return any('\u4e00' <= char <= '\u9fff' for char in text)


def _detect_intent(message: str, has_chinese: bool) -> str:
    """检测用户意图类型"""
    message_lower = message.lower()
    
    # 意图关键词映射
    intent_patterns = {
        "compare": {
            "zh": ["比较", "对比", "哪个好", "哪款好", "VS", "vs"],
            "en": ["compare", "vs", "versus", "which one", "better"],
        },
        "purchase": {
            "zh": ["直接买", "下单", "立即购买", "马上买"],
            "en": ["buy now", "order", "purchase", "checkout"],
        },
        "inquiry": {
            "zh": ["吗", "是否", "能不能", "支持", "可以"],
            "en": ["does it", "can it", "is it", "will it", "support"],
        },
        "recommendation": {
            "zh": ["推荐", "建议", "适合", "有什么好的"],
            "en": ["recommend", "suggest", "best", "top"],
        },
        "cart_operation": {
            "zh": ["购物车", "加入", "添加到"],
            "en": ["cart", "add to", "shopping bag"],
        },
        "order_status": {
            "zh": ["订单", "物流", "到哪了", "配送"],
            "en": ["order", "track", "delivery", "shipping status"],
        },
        "return_refund": {
            "zh": ["退货", "退款", "换货", "退换"],
            "en": ["return", "refund", "exchange"],
        },
    }
    
    for intent, patterns in intent_patterns.items():
        lang_patterns = patterns["zh"] if has_chinese else patterns["en"]
        for pattern in lang_patterns:
            if pattern in (message if has_chinese else message_lower):
                return intent
    
    # 默认是搜索意图
    return "search"


def _detect_multi_tasks(message: str, has_chinese: bool) -> tuple[bool, list]:
    """检测多任务并拆解"""
    sub_tasks = []
    
    # 多任务连接词
    connectors_zh = ["顺便", "另外", "还要", "同时", "也想", "还想", "再找", "还有"]
    connectors_en = ["also", "and also", "plus", "as well", "additionally"]
    
    connectors = connectors_zh if has_chinese else connectors_en
    
    has_multiple = any(c in message for c in connectors)
    
    if has_multiple:
        # 简单拆解：按连接词分割
        parts = [message]
        for c in connectors:
            new_parts = []
            for part in parts:
                new_parts.extend(part.split(c))
            parts = new_parts
        
        parts = [p.strip() for p in parts if p.strip()]
        
        for i, part in enumerate(parts[:3]):  # 最多3个子任务
            product_type = _extract_product_keywords(part)
            sub_tasks.append({
                "task_id": f"task_{i + 1}",
                "intent_type": "search",
                "description": part[:50],
                "description_en": "",
                "product_type": product_type,
                "product_type_en": _translate_product_type_to_english(product_type, part),
                "priority": i + 1,
                "depends_on": [],
                "extracted_attributes": {},
            })
    
    return has_multiple, sub_tasks


def _detect_country(message: str) -> str:
    """检测目的国"""
    message_lower = message.lower()
    
    country_patterns = {
        "DE": ["germany", "德国"],
        "GB": ["uk", "england", "英国"],
        "JP": ["japan", "日本"],
        "CN": ["china", "中国"],
        "FR": ["france", "法国"],
        "AU": ["australia", "澳大利亚"],
        "CA": ["canada", "加拿大"],
    }
    
    for code, patterns in country_patterns.items():
        for pattern in patterns:
            if pattern in message_lower or pattern in message:
                return code
    
    return "US"


def _detect_budget(message: str) -> tuple[float | None, str]:
    """检测预算"""
    # 检测货币和金额
    patterns = [
        (r"\$\s*(\d+(?:\.\d{2})?)", "USD"),
        (r"(\d+(?:\.\d{2})?)\s*(?:美元|刀|美金)", "USD"),
        (r"(\d+(?:\.\d{2})?)\s*(?:块|元|人民币|rmb|RMB)", "CNY"),
        (r"€\s*(\d+(?:\.\d{2})?)", "EUR"),
        (r"£\s*(\d+(?:\.\d{2})?)", "GBP"),
        (r"(\d+(?:\.\d{2})?)\s*(?:以内|以下|左右)", "CNY"),  # 中文默认人民币
    ]
    
    for pattern, currency in patterns:
        match = re.search(pattern, message)
        if match:
            return float(match.group(1)), currency
    
    return None, "USD"


def _detect_arrival_days(message: str) -> int | None:
    """检测时效要求"""
    patterns = [
        (r"(\d+)\s*天内", 1),
        (r"(\d+)\s*天.*到", 1),
        (r"within\s*(\d+)\s*days?", 1),
        (r"(\d+)\s*days?.*delivery", 1),
    ]
    
    for pattern, group in patterns:
        match = re.search(pattern, message.lower())
        if match:
            return int(match.group(group))
    
    # 检测紧急关键词
    urgent_zh = ["急", "马上", "立刻", "尽快", "加急"]
    urgent_en = ["urgent", "asap", "rush", "immediately"]
    
    if any(w in message for w in urgent_zh):
        return 3
    if any(w in message.lower() for w in urgent_en):
        return 3
    
    return None


def _extract_attributes(message: str, has_chinese: bool) -> dict:
    """提取商品属性"""
    attrs = {}
    message_lower = message.lower()
    
    # 颜色
    colors_zh = {"红色": "red", "蓝色": "blue", "黑色": "black", "白色": "white", 
                 "绿色": "green", "黄色": "yellow", "粉色": "pink", "灰色": "gray"}
    colors_en = ["red", "blue", "black", "white", "green", "yellow", "pink", "gray", "brown", "purple"]
    
    for zh, en in colors_zh.items():
        if zh in message:
            attrs["color"] = en
            break
    else:
        for color in colors_en:
            if color in message_lower:
                attrs["color"] = color
                break
    
    # 尺寸
    size_patterns = [
        (r"\b(XS|S|M|L|XL|XXL|XXXL)\b", "size"),
        (r"(\d+)\s*码", "size"),
        (r"size\s*(\d+|XS|S|M|L|XL)", "size"),
    ]
    for pattern, key in size_patterns:
        match = re.search(pattern, message, re.IGNORECASE)
        if match:
            attrs[key] = match.group(1).upper()
            break
    
    # 品牌
    brands = ["apple", "samsung", "nike", "adidas", "sony", "lg", "dell", "hp", "lenovo",
              "苹果", "三星", "耐克", "阿迪达斯"]
    for brand in brands:
        if brand in message_lower or brand in message:
            attrs["brand"] = brand.lower() if brand.isascii() else brand
            break
    
    # 功率
    power_match = re.search(r"(\d+)\s*[wW瓦]", message)
    if power_match:
        attrs["power"] = f"{power_match.group(1)}W"
    
    # 连接方式
    if "无线" in message or "wireless" in message_lower:
        attrs["connectivity"] = "wireless"
    elif "usb-c" in message_lower or "usb c" in message_lower or "type-c" in message_lower:
        attrs["connectivity"] = "USB-C"
    elif "usb" in message_lower:
        attrs["connectivity"] = "USB"
    elif "蓝牙" in message or "bluetooth" in message_lower:
        attrs["connectivity"] = "Bluetooth"
    
    # 兼容性
    compat_patterns = ["iphone", "android", "macbook", "ipad", "三星", "华为"]
    for compat in compat_patterns:
        if compat in message_lower or compat in message:
            attrs["compatibility"] = compat.lower() if compat.isascii() else compat
            break
    
    return attrs


def _generate_constraints(message: str, search_query: str, has_chinese: bool) -> list[dict]:
    """生成硬约束列表"""
    constraints = []
    message_lower = message.lower()
    
    # 产品类型约束
    if search_query:
        constraints.append({"type": "product_type", "value": search_query, "operator": "eq"})
    
    # 兼容性约束
    if "iphone" in message_lower or "iPhone" in message:
        constraints.append({"type": "compatibility", "value": "iPhone", "operator": "eq"})
    if "macbook" in message_lower:
        constraints.append({"type": "compatibility", "value": "MacBook", "operator": "eq"})
    if "android" in message_lower:
        constraints.append({"type": "compatibility", "value": "Android", "operator": "eq"})
    
    # 功能约束
    if has_chinese:
        if "无线" in message:
            constraints.append({"type": "feature", "value": "wireless", "operator": "eq"})
        if "快充" in message:
            constraints.append({"type": "feature", "value": "fast_charging", "operator": "eq"})
    else:
        if "wireless" in message_lower:
            constraints.append({"type": "feature", "value": "wireless", "operator": "eq"})
        if "fast charg" in message_lower:
            constraints.append({"type": "feature", "value": "fast_charging", "operator": "eq"})
    
    return constraints


def _extract_purchase_context(message: str, has_chinese: bool) -> dict:
    """提取购买上下文"""
    context = {
        "occasion": None,
        "recipient": None,
        "recipient_gender": None,
        "recipient_age_range": None,
        "style_preference": None,
        "urgency": "normal",
        "budget_sensitivity": "moderate",
        "special_requirements": [],
    }
    
    message_lower = message.lower()
    
    # 场景检测
    if has_chinese:
        if "送" in message or "礼物" in message:
            context["occasion"] = "gift"
        elif "自己" in message or "自用" in message:
            context["occasion"] = "self_use"
        elif "办公" in message or "工作" in message:
            context["occasion"] = "business"
    else:
        if "gift" in message_lower:
            context["occasion"] = "gift"
        elif "myself" in message_lower or "self" in message_lower:
            context["occasion"] = "self_use"
        elif "work" in message_lower or "office" in message_lower:
            context["occasion"] = "business"
    
    # 收礼人检测
    recipient_patterns_zh = {
        "女朋友": ("girlfriend", "female", "young_adult"),
        "男朋友": ("boyfriend", "male", "young_adult"),
        "老婆": ("wife", "female", "adult"),
        "老公": ("husband", "male", "adult"),
        "妈妈": ("parent", "female", "adult"),
        "爸爸": ("parent", "male", "adult"),
        "朋友": ("friend", None, None),
        "同事": ("colleague", None, "adult"),
        "孩子": ("child", None, "child"),
    }
    
    recipient_patterns_en = {
        "girlfriend": ("girlfriend", "female", "young_adult"),
        "boyfriend": ("boyfriend", "male", "young_adult"),
        "wife": ("wife", "female", "adult"),
        "husband": ("husband", "male", "adult"),
        "mother": ("parent", "female", "adult"),
        "father": ("parent", "male", "adult"),
        "friend": ("friend", None, None),
        "colleague": ("colleague", None, "adult"),
        "kid": ("child", None, "child"),
    }
    
    patterns = recipient_patterns_zh if has_chinese else recipient_patterns_en
    for keyword, (recipient, gender, age) in patterns.items():
        if keyword in (message if has_chinese else message_lower):
            context["recipient"] = recipient
            if gender:
                context["recipient_gender"] = gender
            if age:
                context["recipient_age_range"] = age
            break
    
    # 紧急程度
    urgent_zh = ["急", "马上", "立刻", "尽快"]
    urgent_en = ["urgent", "asap", "rush"]
    
    if any(w in message for w in urgent_zh) or any(w in message_lower for w in urgent_en):
        context["urgency"] = "urgent"
    
    # 预算敏感度
    budget_zh = ["便宜", "实惠", "性价比", "划算"]
    budget_en = ["cheap", "budget", "affordable", "value"]
    premium_zh = ["高档", "奢侈", "顶级", "最好的"]
    premium_en = ["premium", "luxury", "high-end", "best"]
    
    if any(w in message for w in budget_zh) or any(w in message_lower for w in budget_en):
        context["budget_sensitivity"] = "budget_conscious"
    elif any(w in message for w in premium_zh) or any(w in message_lower for w in premium_en):
        context["budget_sensitivity"] = "premium"
    
    # 特殊要求
    special_zh = ["漂亮", "好看", "时尚", "实用", "耐用", "轻便"]
    special_en = ["beautiful", "stylish", "practical", "durable", "lightweight"]
    
    requirements = special_zh if has_chinese else special_en
    for req in requirements:
        if req in (message if has_chinese else message_lower):
            context["special_requirements"].append(req)
    
    return context


def _extract_product_keywords(user_message: str) -> str:
    """
    从用户消息中提取产品关键词（支持多语言）
    
    Args:
        user_message: 用户输入的消息
        
    Returns:
        提取出的产品搜索关键词（保持用户原始语言）
    """
    if not user_message:
        return ""
    
    message = user_message.strip()
    has_chinese = _has_chinese(message)
    
    if has_chinese:
        # 中文处理：移除常见的无意义前缀
        chinese_prefixes = [
            "我要买", "我想买", "我需要", "我要", "我想", 
            "帮我找", "帮我买", "帮我", "请帮我", "请给我",
            "找一个", "找一件", "找", "买一个", "买一件", "买",
            "想要一个", "想要一件", "想要", "需要一个", "需要一件", "需要",
            "给我找", "给我买", "给我", "给女朋友买", "给老婆买", "给朋友买",
            "给男朋友买", "给爸爸买", "给妈妈买",
        ]
        chinese_suffixes = ["吧", "呢", "啊", "哦", "了", "的", "送人", "当礼物"]
        
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
        
        # 移除价格信息
        result = re.sub(r'[\d]+[块元].*', '', result).strip()
        result = re.sub(r'预算.*', '', result).strip()
        
        # 移除时间信息
        result = re.sub(r'[\d]+天内.*', '', result).strip()
        
        return result.strip() if result else message
    
    else:
        # 英文处理：移除常见停用词，提取产品关键词
        stop_words = {
            "i", "me", "my", "need", "want", "looking", "for", 
            "a", "an", "the", "to", "please", "can", "you", 
            "find", "get", "buy", "help", "with", "some",
            "budget", "ship", "within", "days", "under", "around",
            "gift", "girlfriend", "boyfriend", "friend", "mom", "dad",
            "urgent", "asap", "quickly",
        }
        
        # 移除价格信息
        message = re.sub(r'\$\d+', '', message)
        message = re.sub(r'under \d+', '', message)
        
        words = message.lower().replace(",", "").replace(".", "").split()
        keywords = [w for w in words if w not in stop_words and len(w) > 1]
        
        return " ".join(keywords[:4]) if keywords else message


def _translate_product_type_to_english(product_type: str, original_message: str) -> str:
    """
    Translate product type to English for matching.
    
    Uses a comprehensive dictionary for common products.
    """
    # Common Chinese to English product type mappings
    zh_en_mapping = {
        # Electronics
        "充电器": "charger",
        "无线充电器": "wireless charger",
        "快充充电器": "fast charger",
        "数据线": "charging cable",
        "耳机": "earphones",
        "蓝牙耳机": "bluetooth earphones",
        "手机壳": "phone case",
        "手机支架": "phone stand",
        "电脑": "computer",
        "笔记本电脑": "laptop",
        "平板": "tablet",
        "键盘": "keyboard",
        "鼠标": "mouse",
        "无线鼠标": "wireless mouse",
        "音箱": "speaker",
        "移动电源": "power bank",
        "充电宝": "power bank",
        "智能手表": "smart watch",
        "显示器": "monitor",
        # Clothing
        "西装外套": "blazer",
        "西装": "suit",
        "外套": "jacket",
        "夹克": "jacket",
        "裙子": "dress",
        "连衣裙": "dress",
        "半身裙": "skirt",
        "衬衫": "shirt",
        "T恤": "t-shirt",
        "毛衣": "sweater",
        "裤子": "pants",
        "牛仔裤": "jeans",
        "短裤": "shorts",
        "鞋子": "shoes",
        "运动鞋": "sneakers",
        "高跟鞋": "high heels",
        "靴子": "boots",
        "卫衣": "hoodie",
        "大衣": "coat",
        "羽绒服": "down jacket",
        # Accessories
        "手表": "watch",
        "项链": "necklace",
        "戒指": "ring",
        "耳环": "earrings",
        "手链": "bracelet",
        "包": "bag",
        "手提包": "handbag",
        "背包": "backpack",
        "钱包": "wallet",
        "皮带": "belt",
        "帽子": "hat",
        "围巾": "scarf",
        "太阳镜": "sunglasses",
        # Home
        "床垫": "mattress",
        "枕头": "pillow",
        "被子": "blanket",
        "台灯": "desk lamp",
        "椅子": "chair",
        "桌子": "desk",
        "沙发": "sofa",
        "收纳盒": "storage box",
        # Beauty
        "口红": "lipstick",
        "香水": "perfume",
        "护肤品": "skincare",
        "面膜": "face mask",
    }
    
    # Check exact match first
    if product_type in zh_en_mapping:
        return zh_en_mapping[product_type]
    
    # Check for partial matches in Chinese
    for zh, en in zh_en_mapping.items():
        if zh in product_type:
            return en
    
    # If already English or no mapping found, return as-is (lowercase)
    if not _has_chinese(product_type):
        return product_type.lower()
    
    # For Chinese without mapping, try to extract from original message if it has English
    message_lower = original_message.lower()
    common_products = [
        "charger", "case", "stand", "cable", "earphones", "headphones",
        "dress", "blazer", "jacket", "shirt", "pants", "shoes", "sneakers",
        "watch", "bag", "wallet", "laptop", "tablet", "mouse", "keyboard",
        "necklace", "ring", "bracelet", "hoodie", "sweater", "coat",
    ]
    for product in common_products:
        if product in message_lower:
            return product
    
    # Fallback: return the original
    return product_type
