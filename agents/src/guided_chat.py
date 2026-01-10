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
- primary_product_type: The exact product type the user wants
- primary_product_type_en: English translation of product type
- detected_language: User's detected language code (en, zh, ja, es, de, fr, etc.)
- hard_constraints: Array of must-have requirements [{type: string, value: string}]
- soft_preferences: Array of nice-to-have preferences [{type: string, value: string}]
- purchase_context: Object with occasion, recipient, recipient_gender, recipient_age_range, style_preference, urgency, budget_sensitivity, special_requirements

Be precise and extract only what was explicitly mentioned or strongly implied.
Return ONLY valid JSON, no markdown or explanation.
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
        
        # Parse as dict
        mission_data = json.loads(cleaned)
        
        # Validate with Pydantic
        result = MissionParseResult.model_validate(mission_data)
        
        logger.info("guided_chat.mission_extracted", mission=result.model_dump())
        return result.model_dump()
        
    except Exception as e:
        logger.error("guided_chat.extract_error", error=str(e))
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
