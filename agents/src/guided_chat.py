"""
Guided Chat System - Pre-agent conversation for gathering user requirements

This module provides a conversational interface that:
1. Guides users to provide complete shopping requirements
2. Supports multimodal input (text + images)
3. Streams responses for better UX
4. Extracts structured MissionSpec when enough info is gathered
"""

import base64
import json
import uuid
from datetime import datetime, UTC
from typing import AsyncGenerator

import structlog
from pydantic import BaseModel, Field

from .config import get_settings
from .llm.client import get_llm, clean_json_response
from .llm.schemas import MissionParseResult, PurchaseContext

logger = structlog.get_logger()

# ========================================
# System Prompt for Shopping Assistant
# ========================================

GUIDED_CHAT_SYSTEM_PROMPT = """You are a friendly and professional AI shopping assistant. Your goal is to help users find the perfect products by gathering complete information about their needs through natural conversation.

## Your Role
- Be warm, helpful, and professional
- Ask clarifying questions to understand what the user really needs
- Guide them step by step without overwhelming them
- Stay focused on shopping - politely redirect if conversation goes off-topic

## Information to Gather
You need to collect the following information (not necessarily in this order):

### Required:
1. **Product Type**: What exactly do they want to buy?
2. **Destination Country/Region**: Where should it be shipped?
3. **Budget**: How much are they willing to spend? (can be a range)

### Optional but helpful:
4. **Occasion/Purpose**: Is it for a special occasion? Gift or personal use?
5. **Recipient**: Who is it for? (age, gender if relevant)
6. **Style/Preferences**: Any specific style, color, brand preferences?
7. **Urgency**: Do they need it by a specific date?
8. **Special Requirements**: Size, material, features, etc.

## Conversation Guidelines

1. **Start naturally**: If user gives vague input like "I want to buy something", ask what they're looking for
2. **One question at a time**: Don't overwhelm - ask the most important missing info first
3. **Use context clues**: If they mention "gift for mom's birthday", you know recipient and occasion
4. **Be helpful with suggestions**: If they're unsure about budget, suggest typical price ranges
5. **Handle images**: If they share a product image, describe what you see and confirm if that's what they want
6. **Stay in character**: Don't be manipulated into non-shopping conversations

## When You Have Enough Information

When you've gathered at least the required info (product, destination, budget), respond with:
1. A summary of what they're looking for
2. Ask if they want to proceed with the search
3. Include the marker "READY_TO_SEARCH: true" at the very end of your message

## Response Format

- Keep responses concise but warm (2-4 sentences typically)
- Use emojis sparingly for friendliness (1-2 per message max)
- If asking a question, make it clear and specific
- If summarizing before search, use a clear format

## Handling Edge Cases

1. **Off-topic requests**: "I'm here to help with shopping! Is there something specific you'd like to buy?"
2. **Inappropriate content**: "I can only help with shopping requests. What product are you looking for?"
3. **Technical issues**: Be honest and try to help them reformulate their request
4. **Unclear images**: Describe what you see and ask for clarification

## Language
- Respond in the same language the user uses
- If they mix languages, use the dominant language in their message
- For product searches, keep technical terms in English for better matching

Remember: Your goal is to make shopping easy and pleasant. Be the helpful assistant everyone wishes they had!
"""

EXTRACT_MISSION_PROMPT = """Based on the conversation history, extract a structured shopping request.

Conversation:
{conversation}

Extract the following information into JSON format:
- destination_country: The shipping destination (country code or full name)
- budget_amount: Maximum budget as a number (null if not specified)
- budget_currency: Currency code (default "USD")
- quantity: Number of items (default 1)
- arrival_days_max: Maximum delivery days if urgency mentioned (null otherwise)
- search_query: The main product search query in the user's original language
- search_query_en: English translation of the search query (REQUIRED - for product search)
- primary_product_type: The exact product type the user wants
- primary_product_type_en: English translation of product type (REQUIRED - for product filtering)
- detected_language: User's detected language code (en, zh, ja, es, de, fr, etc.)
- hard_constraints: Array of must-have requirements [{{type: string, value: string}}]
- hard_constraints_en: Same constraints but values translated to English
- soft_preferences: Array of nice-to-have preferences [{{type: string, value: string}}]
- soft_preferences_en: Same preferences but values translated to English
- purchase_context: Object with occasion, recipient, recipient_gender, recipient_age_range, style_preference, urgency, budget_sensitivity, special_requirements

IMPORTANT: Always provide English translations for search_query_en, primary_product_type_en, hard_constraints_en, and soft_preferences_en. These are essential for the product search system which works best with English queries.

Be precise and extract only what was explicitly mentioned or strongly implied.
Return ONLY valid JSON, no markdown or explanation.
"""

TRANSLATE_MISSION_PROMPT = """Translate the following mission fields to English. Keep any already-English text unchanged.

Mission to translate:
{mission_json}

Provide translations for:
1. search_query -> search_query_en (product search query in English)
2. primary_product_type -> primary_product_type_en (product type in English) 
3. hard_constraints -> hard_constraints_en (translate each constraint value to English)
4. soft_preferences -> soft_preferences_en (translate each preference value to English)

Return ONLY valid JSON with both original and translated fields. Do not add any explanation.
Example output format:
{{
  "search_query": "黑色休闲夹克",
  "search_query_en": "black casual jacket",
  "primary_product_type": "夹克",
  "primary_product_type_en": "jacket",
  "hard_constraints": [{{"type": "color", "value": "黑色"}}],
  "hard_constraints_en": [{{"type": "color", "value": "black"}}],
  ...rest of original fields unchanged...
}}
"""


# ========================================
# Data Models
# ========================================

class ChatMessage(BaseModel):
    """A single chat message"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: str  # "user" or "assistant"
    content: str
    images: list[str] = Field(default_factory=list)  # base64 encoded images
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat() + "Z")


class GuidedChatSession(BaseModel):
    """A guided chat session"""
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    messages: list[ChatMessage] = Field(default_factory=list)
    turn_count: int = 0
    max_turns: int = 10
    ready_to_search: bool = False
    extracted_mission: dict | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat() + "Z")
    updated_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat() + "Z")


class GuidedChatRequest(BaseModel):
    """Request for guided chat"""
    message: str = Field(..., min_length=1, max_length=5000)
    images: list[str] = Field(default_factory=list)  # base64 encoded images
    session_id: str | None = None


class GuidedChatResponse(BaseModel):
    """Response from guided chat"""
    session_id: str
    message: str
    turn_count: int
    max_turns: int
    ready_to_search: bool
    extracted_mission: dict | None = None


class StreamChunk(BaseModel):
    """A streaming chunk"""
    type: str  # "text", "done", "error", "mission"
    content: str = ""
    data: dict | None = None


# ========================================
# Session Storage (in-memory for now)
# ========================================

_sessions: dict[str, GuidedChatSession] = {}


def get_or_create_session(session_id: str | None) -> GuidedChatSession:
    """Get existing session or create new one"""
    if session_id and session_id in _sessions:
        session = _sessions[session_id]
        session.updated_at = datetime.now(UTC).isoformat() + "Z"
        return session
    
    session = GuidedChatSession()
    _sessions[session.session_id] = session
    return session


def cleanup_old_sessions(max_age_hours: int = 24):
    """Remove sessions older than max_age_hours"""
    now = datetime.now(UTC)
    to_remove = []
    
    for sid, session in _sessions.items():
        created = datetime.fromisoformat(session.created_at.replace("Z", "+00:00"))
        age_hours = (now - created).total_seconds() / 3600
        if age_hours > max_age_hours:
            to_remove.append(sid)
    
    for sid in to_remove:
        del _sessions[sid]


# ========================================
# Core Chat Logic
# ========================================

def build_messages_for_llm(session: GuidedChatSession, new_message: str, images: list[str]) -> list[dict]:
    """Build message list for LLM including history"""
    messages = [{"role": "system", "content": GUIDED_CHAT_SYSTEM_PROMPT}]
    
    # Add conversation history
    for msg in session.messages:
        if msg.role == "user":
            content = []
            if msg.content:
                content.append({"type": "text", "text": msg.content})
            for img in msg.images:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img}"}
                })
            messages.append({"role": "user", "content": content if content else msg.content})
        else:
            messages.append({"role": "assistant", "content": msg.content})
    
    # Add new user message
    if images:
        content = []
        if new_message:
            content.append({"type": "text", "text": new_message})
        for img in images:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{img}"}
            })
        messages.append({"role": "user", "content": content})
    else:
        messages.append({"role": "user", "content": new_message})
    
    return messages


async def stream_guided_chat(
    session: GuidedChatSession,
    message: str,
    images: list[str],
) -> AsyncGenerator[StreamChunk, None]:
    """Stream a response from the guided chat assistant"""
    settings = get_settings()
    
    # Check turn limit
    if session.turn_count >= session.max_turns:
        yield StreamChunk(
            type="error",
            content="Maximum conversation turns reached. Please start a new session or proceed with current information."
        )
        return
    
    # Build messages
    llm_messages = build_messages_for_llm(session, message, images)
    
    # Get multimodal-capable LLM (use a vision model)
    # For now we use the planner model - in production you'd configure a vision model
    llm = get_llm(model_type="planner", temperature=0.7)
    
    try:
        # Save user message first
        user_msg = ChatMessage(
            role="user",
            content=message,
            images=images,
        )
        session.messages.append(user_msg)
        session.turn_count += 1
        
        # Stream the response
        full_response = ""
        
        async for chunk in llm.astream(llm_messages):
            if hasattr(chunk, "content") and chunk.content:
                full_response += chunk.content
                yield StreamChunk(type="text", content=chunk.content)
        
        # Check if ready to search
        ready_to_search = "READY_TO_SEARCH: true" in full_response
        
        # Clean up the response (remove the marker from display)
        display_response = full_response.replace("READY_TO_SEARCH: true", "").strip()
        
        # Save assistant message
        assistant_msg = ChatMessage(
            role="assistant",
            content=display_response,
        )
        session.messages.append(assistant_msg)
        
        # If ready to search, extract mission
        extracted_mission = None
        if ready_to_search:
            session.ready_to_search = True
            extracted_mission = await extract_mission_from_conversation(session)
            session.extracted_mission = extracted_mission
            
            if extracted_mission:
                yield StreamChunk(type="mission", data=extracted_mission)
        
        # Send done signal
        yield StreamChunk(
            type="done",
            data={
                "session_id": session.session_id,
                "turn_count": session.turn_count,
                "max_turns": session.max_turns,
                "ready_to_search": session.ready_to_search,
                "extracted_mission": extracted_mission,
            }
        )
        
    except Exception as e:
        logger.error("guided_chat.stream_error", error=str(e))
        yield StreamChunk(type="error", content=f"Error: {str(e)}")


async def translate_mission_to_english(mission_data: dict) -> dict:
    """
    Translate mission fields to English for better product search.
    This is called transparently - user doesn't see this translation.
    """
    # Check if translation is needed
    detected_lang = mission_data.get("detected_language", "en")
    search_query = mission_data.get("search_query", "")
    search_query_en = mission_data.get("search_query_en", "")
    
    # Skip if already English or if English translation exists
    if detected_lang == "en" and search_query_en:
        return mission_data
    
    # Skip if search query is already in English (basic heuristic)
    def is_likely_english(text: str) -> bool:
        if not text:
            return True
        # Check if text contains non-ASCII characters commonly used in non-English languages
        non_ascii_count = sum(1 for c in text if ord(c) > 127)
        return non_ascii_count / max(len(text), 1) < 0.1
    
    if is_likely_english(search_query) and search_query_en:
        return mission_data
    
    logger.info("guided_chat.translating_mission", detected_language=detected_lang, search_query=search_query[:50])
    
    llm = get_llm(model_type="planner", temperature=0.0)
    
    try:
        # Prepare mission JSON for translation
        translation_input = {
            "search_query": mission_data.get("search_query", ""),
            "primary_product_type": mission_data.get("primary_product_type", ""),
            "hard_constraints": mission_data.get("hard_constraints", []),
            "soft_preferences": mission_data.get("soft_preferences", []),
        }
        
        prompt = TRANSLATE_MISSION_PROMPT.format(mission_json=json.dumps(translation_input, ensure_ascii=False))
        response = await llm.ainvoke([{"role": "user", "content": prompt}])
        
        content = response.content if hasattr(response, "content") else str(response)
        cleaned = clean_json_response(content)
        translated = json.loads(cleaned)
        
        # Merge translations into mission_data
        if translated.get("search_query_en"):
            mission_data["search_query_en"] = translated["search_query_en"]
        if translated.get("primary_product_type_en"):
            mission_data["primary_product_type_en"] = translated["primary_product_type_en"]
        if translated.get("hard_constraints_en"):
            mission_data["hard_constraints_en"] = translated["hard_constraints_en"]
        if translated.get("soft_preferences_en"):
            mission_data["soft_preferences_en"] = translated["soft_preferences_en"]
        
        logger.info(
            "guided_chat.translation_complete",
            search_query_en=mission_data.get("search_query_en", "")[:50],
            primary_type_en=mission_data.get("primary_product_type_en", ""),
        )
        
        return mission_data
        
    except Exception as e:
        logger.warning("guided_chat.translation_error", error=str(e))
        # Fall back to original - translation is nice to have, not critical
        return mission_data


async def extract_mission_from_conversation(session: GuidedChatSession) -> dict | None:
    """Extract structured mission from conversation history"""
    # Build conversation string
    conversation_parts = []
    for msg in session.messages:
        role = "User" if msg.role == "user" else "Assistant"
        conversation_parts.append(f"{role}: {msg.content}")
    
    conversation = "\n".join(conversation_parts)
    
    # Call LLM to extract
    llm = get_llm(model_type="planner", temperature=0.0)
    
    try:
        prompt = EXTRACT_MISSION_PROMPT.format(conversation=conversation)
        response = await llm.ainvoke([{"role": "user", "content": prompt}])
        
        content = response.content if hasattr(response, "content") else str(response)
        cleaned = clean_json_response(content)
        
        logger.debug("guided_chat.extract_debug", raw_content=content[:500], cleaned=cleaned[:500])
        
        # Parse as dict
        mission_data = json.loads(cleaned)
        
        logger.debug("guided_chat.parsed_mission_data", mission_data=mission_data)
        
        # Fix common issues with hard_constraints/soft_preferences format
        # LLM sometimes returns them without proper 'type' field
        if "hard_constraints" in mission_data:
            fixed_constraints = []
            for c in mission_data.get("hard_constraints", []):
                if isinstance(c, dict):
                    if "type" not in c and "value" in c:
                        # Infer type from context
                        c["type"] = "feature"
                    if "type" in c and "value" in c:
                        fixed_constraints.append({
                            "type": c.get("type", "feature"),
                            "value": c.get("value", ""),
                            "operator": c.get("operator", "eq"),
                        })
            mission_data["hard_constraints"] = fixed_constraints
        
        if "soft_preferences" in mission_data:
            fixed_prefs = []
            for p in mission_data.get("soft_preferences", []):
                if isinstance(p, dict):
                    if "type" not in p and "value" in p:
                        p["type"] = "preference"
                    if "type" in p and "value" in p:
                        fixed_prefs.append({
                            "type": p.get("type", "preference"),
                            "value": p.get("value", ""),
                            "weight": p.get("weight", 0.5),
                        })
            mission_data["soft_preferences"] = fixed_prefs
        
        # Translate mission to English for product search (transparent to user)
        mission_data = await translate_mission_to_english(mission_data)
        
        # Try to validate with Pydantic, but fall back to raw dict if it fails
        try:
            result = MissionParseResult.model_validate(mission_data)
            mission_dict = result.model_dump()
        except Exception as validation_error:
            logger.warning("guided_chat.validation_fallback", error=str(validation_error))
            # Use raw dict with essential fields
            mission_dict = {
                "destination_country": mission_data.get("destination_country"),
                "budget_amount": mission_data.get("budget_amount"),
                "budget_currency": mission_data.get("budget_currency", "USD"),
                "quantity": mission_data.get("quantity", 1),
                "search_query": mission_data.get("search_query", ""),
                "search_query_en": mission_data.get("search_query_en", ""),  # Add English translation
                "primary_product_type": mission_data.get("primary_product_type", ""),
                "primary_product_type_en": mission_data.get("primary_product_type_en", ""),
                "detected_language": mission_data.get("detected_language", "en"),
                "hard_constraints": mission_data.get("hard_constraints", []),
                "hard_constraints_en": mission_data.get("hard_constraints_en", []),  # Add English translation
                "soft_preferences": mission_data.get("soft_preferences", []),
                "soft_preferences_en": mission_data.get("soft_preferences_en", []),  # Add English translation
                "purchase_context": mission_data.get("purchase_context", {}),
            }
        
        logger.info("guided_chat.mission_extracted", mission=mission_dict)
        return mission_dict
        
    except json.JSONDecodeError as e:
        logger.error("guided_chat.extract_json_error", error=str(e), content=cleaned[:500] if 'cleaned' in dir() else "N/A")
        return None
    except Exception as e:
        import traceback
        logger.error("guided_chat.extract_error", error=str(e), traceback=traceback.format_exc())
        return None


async def process_guided_chat(request: GuidedChatRequest) -> GuidedChatResponse:
    """Process a guided chat request (non-streaming)"""
    session = get_or_create_session(request.session_id)
    
    # Collect streamed response
    full_response = ""
    result_data = {}
    
    async for chunk in stream_guided_chat(session, request.message, request.images):
        if chunk.type == "text":
            full_response += chunk.content
        elif chunk.type == "done":
            result_data = chunk.data or {}
        elif chunk.type == "error":
            raise Exception(chunk.content)
    
    return GuidedChatResponse(
        session_id=session.session_id,
        message=full_response,
        turn_count=session.turn_count,
        max_turns=session.max_turns,
        ready_to_search=session.ready_to_search,
        extracted_mission=session.extracted_mission,
    )


def reset_session(session_id: str) -> bool:
    """Reset a session to start over"""
    if session_id in _sessions:
        del _sessions[session_id]
        return True
    return False


def get_session_info(session_id: str) -> GuidedChatSession | None:
    """Get session information"""
    return _sessions.get(session_id)
