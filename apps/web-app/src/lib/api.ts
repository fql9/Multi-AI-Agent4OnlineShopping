/**
 * API Client for Backend Agent Integration
 * 
 * 连接后端 Python Agent HTTP Server
 * 支持流式响应和会话管理
 */

// 配置
const AGENT_API_BASE =
  process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:28003'
const TOOL_GATEWAY_BASE =
  process.env.NEXT_PUBLIC_TOOL_GATEWAY_URL || 'http://localhost:28000'

// ========================================
// 类型定义
// ========================================

export interface ChatRequest {
  message: string
  session_id?: string
  user_id?: string
}

export interface ChatResponse {
  session_id: string
  current_step: string
  message?: string
  mission?: MissionSpec
  candidates: ProductCandidate[]
  verified_candidates: VerifiedCandidate[]
  plans: PlanOption[]
  selected_plan?: PlanOption
  draft_order_id?: string
  draft_order?: DraftOrderData
  evidence_snapshot_id?: string
  needs_user_input: boolean
  error?: string
  error_code?: string
  token_used: number
}

export interface MissionSpec {
  destination_country: string
  budget_amount: number | null
  budget_currency: string
  quantity: number
  arrival_days_max?: number
  hard_constraints: Array<{ type: string; value: string }>
  soft_preferences: Array<{ type: string; value: string }>
  search_query: string
  detected_language?: string
  purchase_context?: {
    occasion?: string | null
    recipient?: string | null
    recipient_gender?: string | null
    recipient_age_range?: string | null
    style_preference?: string | null
    urgency?: string | null
    budget_sensitivity?: string | null
    special_requirements?: string[]
  }
}

export interface ProductCandidate {
  offer_id: string
  title: string
  price: number
  currency: string
  brand?: string
  rating?: number
  image_url?: string
  product_url?: string
  store_name?: string
  source?: 'xoobay' | 'database'
}

export interface VerifiedCandidate extends ProductCandidate {
  verified_price: number
  shipping_options: ShippingOption[]
  compliance_status: ComplianceStatus
  tax_estimate?: TaxEstimate
}

export interface ShippingOption {
  id: string
  name: string
  price: number
  delivery_days_min: number
  delivery_days_max: number
}

export interface ComplianceStatus {
  allowed: boolean
  warnings: Array<{
    type: string
    severity: 'low' | 'medium' | 'high'
    message: string
    mitigation?: string
  }>
}

export interface TaxEstimate {
  amount: number
  currency: string
  confidence: 'low' | 'medium' | 'high'
  breakdown: {
    vat: number
    duty: number
    handling: number
  }
}

export interface PlanOption {
  name: string
  type: 'cheapest' | 'fastest' | 'best_value'
  offer_id: string
  product: ProductCandidate
  shipping: ShippingOption
  tax: TaxEstimate
  total: number
  reason: string
  confidence: number
  recommended: boolean
  ai_recommendation?: {
    main_reason: string
    context_factors?: string[]
    seasonal_relevance?: string | null
    value_proposition?: string | null
    personalized_tip?: string | null
  }
  product_highlights?: string[]
}

export interface DraftOrderData {
  id: string
  cart_id: string
  plan: PlanOption
  total_amount: number
  currency: string
  expires_at: string
  created_at: string
  evidence_snapshot_id?: string
}

export interface SessionInfo {
  session_id: string
  user_id: string
  created_at: string
  last_active: string
  token_used: number
  token_budget: number
  current_step?: string
}

export interface HealthStatus {
  status: string
  timestamp: string
  version: string
  uptime_seconds: number
}

// ========================================
// API 错误处理
// ========================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP error ${response.status}`
    let errorCode = 'HTTP_ERROR'
    
    try {
      const errorBody = await response.json()
      errorMessage = errorBody.detail || errorBody.message || errorMessage
      errorCode = errorBody.code || errorCode
    } catch {
      // 无法解析 JSON，使用默认错误信息
    }
    
    throw new ApiError(errorMessage, response.status, errorCode)
  }
  
  return response.json()
}

// ========================================
// Agent API
// ========================================

/**
 * 发送聊天请求到 Agent
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${AGENT_API_BASE}/api/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  
  return handleResponse<ChatResponse>(response)
}

/**
 * 获取 Agent 健康状态
 */
export async function getAgentHealth(): Promise<HealthStatus> {
  const response = await fetch(`${AGENT_API_BASE}/health`)
  return handleResponse<HealthStatus>(response)
}

// ========================================
// 会话 API
// ========================================

/**
 * 创建新会话
 */
export async function createSession(userId: string = 'anonymous'): Promise<SessionInfo> {
  const response = await fetch(`${AGENT_API_BASE}/api/v1/sessions?user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
  })
  return handleResponse<SessionInfo>(response)
}

/**
 * 获取会话信息
 */
export async function getSession(sessionId: string): Promise<SessionInfo> {
  const response = await fetch(`${AGENT_API_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}`)
  return handleResponse<SessionInfo>(response)
}

/**
 * 删除会话
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${AGENT_API_BASE}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
  await handleResponse(response)
}

/**
 * 列出所有会话
 */
export async function listSessions(userId?: string): Promise<SessionInfo[]> {
  const url = userId 
    ? `${AGENT_API_BASE}/api/v1/sessions?user_id=${encodeURIComponent(userId)}`
    : `${AGENT_API_BASE}/api/v1/sessions`
  const response = await fetch(url)
  return handleResponse<SessionInfo[]>(response)
}

// ========================================
// Tool Gateway API
// ========================================

export interface SearchOffersParams {
  query: string
  category_id?: string
  price_min?: number
  price_max?: number
  limit?: number
}

export interface SearchOffersResult {
  ok: boolean
  data?: {
    offer_ids: string[]
    total: number
  }
  error?: {
    code: string
    message: string
  }
}

export interface OfferCard {
  ok: boolean
  data?: {
    offer_id: string
    titles: Array<{ locale: string; text: string }>
    brand?: { name: string }
    price?: { amount: number; currency: string }
    rating?: number
    attributes?: {
      image_url?: string
      gallery_images?: string[]
      description?: string
      short_description?: string
      store_name?: string
      source?: string
    }
  }
  error?: {
    code: string
    message: string
  }
}

/**
 * 搜索产品
 */
export async function searchOffers(params: SearchOffersParams): Promise<SearchOffersResult> {
  const response = await fetch(`${TOOL_GATEWAY_BASE}/tools/catalog/search_offers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_id: crypto.randomUUID(),
      actor: { type: 'user', id: 'web-user' },
      client: { app: 'web', version: '1.0.0' },
      params,
    }),
  })
  
  return response.json()
}

/**
 * 获取产品详情
 */
export async function getOfferCard(offerId: string): Promise<OfferCard> {
  const response = await fetch(`${TOOL_GATEWAY_BASE}/tools/catalog/get_offer_card`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_id: crypto.randomUUID(),
      actor: { type: 'user', id: 'web-user' },
      client: { app: 'web', version: '1.0.0' },
      params: { offer_id: offerId },
    }),
  })
  
  return response.json()
}

// ========================================
// 连接状态检查
// ========================================

export interface ConnectionStatus {
  agent: 'connected' | 'disconnected' | 'unknown'
  toolGateway: 'connected' | 'disconnected' | 'unknown'
  agentVersion?: string
  lastChecked: Date
}

/**
 * 检查所有服务的连接状态
 */
export async function checkConnectionStatus(): Promise<ConnectionStatus> {
  const status: ConnectionStatus = {
    agent: 'unknown',
    toolGateway: 'unknown',
    lastChecked: new Date(),
  }
  
  // 检查 Agent
  try {
    const health = await getAgentHealth()
    status.agent = health.status === 'ok' ? 'connected' : 'disconnected'
    status.agentVersion = health.version
  } catch {
    status.agent = 'disconnected'
  }
  
  // 检查 Tool Gateway
  try {
    const response = await fetch(`${TOOL_GATEWAY_BASE}/health`)
    status.toolGateway = response.ok ? 'connected' : 'disconnected'
  } catch {
    status.toolGateway = 'disconnected'
  }
  
  return status
}

// ========================================
// Guided Chat API (Pre-agent conversation)
// ========================================

export interface GuidedChatRequest {
  message: string
  images?: string[]  // base64 encoded images
  session_id?: string
}

export interface GuidedChatResponse {
  session_id: string
  message: string
  turn_count: number
  max_turns: number
  ready_to_search: boolean
  extracted_mission?: MissionSpec
}

export interface GuidedChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  has_images: boolean
  timestamp: string
}

export interface GuidedChatSessionInfo {
  session_id: string
  turn_count: number
  max_turns: number
  ready_to_search: boolean
  extracted_mission?: MissionSpec
  messages: GuidedChatMessage[]
  created_at: string
  updated_at: string
}

export interface StreamChunk {
  type: 'text' | 'done' | 'error' | 'mission'
  content?: string
  data?: {
    session_id?: string
    turn_count?: number
    max_turns?: number
    ready_to_search?: boolean
    extracted_mission?: MissionSpec
  }
}

/**
 * Send a message to guided chat (non-streaming)
 */
export async function sendGuidedChatMessage(request: GuidedChatRequest): Promise<GuidedChatResponse> {
  const response = await fetch(`${AGENT_API_BASE}/api/v1/guided-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  
  return handleResponse<GuidedChatResponse>(response)
}

/**
 * Send a message to guided chat with streaming response
 * Returns an async generator that yields StreamChunk objects
 */
export async function* streamGuidedChat(request: GuidedChatRequest): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${AGENT_API_BASE}/api/v1/guided-chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  
  if (!response.ok) {
    throw new ApiError(`HTTP error ${response.status}`, response.status)
  }
  
  const reader = response.body?.getReader()
  if (!reader) {
    throw new ApiError('No response body', 500)
  }
  
  const decoder = new TextDecoder()
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    buffer += decoder.decode(value, { stream: true })
    
    // Parse SSE events
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          yield data as StreamChunk
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * Get guided chat session info
 */
export async function getGuidedChatSession(sessionId: string): Promise<GuidedChatSessionInfo> {
  const response = await fetch(`${AGENT_API_BASE}/api/v1/guided-chat/sessions/${encodeURIComponent(sessionId)}`)
  return handleResponse<GuidedChatSessionInfo>(response)
}

/**
 * Delete/reset a guided chat session
 */
export async function deleteGuidedChatSession(sessionId: string): Promise<void> {
  const response = await fetch(`${AGENT_API_BASE}/api/v1/guided-chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
  await handleResponse(response)
}

// ========================================
// 辅助函数
// ========================================

/**
 * 格式化价格
 */
export function formatPrice(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * 格式化日期
 */
export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

/**
 * 计算配送时间范围
 */
export function formatDeliveryRange(minDays: number, maxDays: number): string {
  if (minDays === maxDays) {
    return `${minDays} day${minDays === 1 ? '' : 's'}`
  }
  return `${minDays}-${maxDays} days`
}




