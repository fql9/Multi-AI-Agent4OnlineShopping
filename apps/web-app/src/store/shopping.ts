import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from '@/lib/api'

// ========================================
// 类型定义
// ========================================

// 状态机状态（符合 07_draft_order.md）
export type OrderState = 
  | 'IDLE'
  | 'MISSION_READY'
  | 'CANDIDATES_READY'
  | 'VERIFIED_TOPN_READY'
  | 'PLAN_SELECTED'
  | 'CART_READY'
  | 'SHIPPING_SELECTED'
  | 'TOTAL_COMPUTED'
  | 'DRAFT_ORDER_CREATED'
  | 'WAIT_USER_PAYMENT_CONFIRMATION'
  | 'PAID'
  | 'WAITING_USER_INPUT'

// 合规风险类型
export type ComplianceRisk = {
  type: 'battery' | 'liquid' | 'magnet' | 'food' | 'medical' | 'trademark'
  severity: 'low' | 'medium' | 'high'
  message: string
  mitigation?: string
}

// 税费估算
export type TaxEstimate = {
  amount: number
  currency: string
  confidence: 'low' | 'medium' | 'high'
  method: 'rule_based' | 'hs_code' | 'ml_estimate'
  breakdown: {
    vat: number
    duty: number
    handling: number
  }
}

// 确认项
export type ConfirmationItem = {
  id: string
  type: 'tax' | 'compliance' | 'return' | 'shipping' | 'customs'
  title: string
  description: string
  required: boolean
  checked: boolean
}

// Mission 类型
export type Mission = {
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

export type AIRecommendationReason = {
  main_reason: string
  context_factors?: string[]
  seasonal_relevance?: string | null
  value_proposition?: string | null
  personalized_tip?: string | null
}

// 产品类型
export type Product = {
  id: string
  title: string
  price: number
  image: string  // emoji fallback
  imageUrl?: string  // 真实图片URL
  galleryImages?: string[]  // 图库图片
  brand: string
  rating: number
  description?: string  // 产品描述
  shortDescription?: string  // 简短描述
  storeName?: string  // 店铺名称
  storeId?: string  // 店铺ID
  productUrl?: string  // 产品链接
  source?: 'xoobay' | 'database'  // 数据来源
  complianceRisks: ComplianceRisk[]
}

// 方案类型
export type Plan = {
  name: string
  type: 'cheapest' | 'fastest' | 'best_value'
  product: Product
  shipping: number
  shippingOption: string
  tax: TaxEstimate
  total: number
  deliveryDays: string
  emoji: string
  recommended: boolean
  reason: string
  risks: string[]
  confidence: number
  aiRecommendation?: AIRecommendationReason
  productHighlights?: string[]
}

// 草稿订单类型
export type DraftOrder = {
  id: string
  plan: Plan
  confirmationItems: ConfirmationItem[]
  evidenceSnapshotId: string
  expiresAt: string
  createdAt: string
}

// 工具调用记录
export type ToolCall = {
  id: string
  name: string
  input: string
  output: string
  duration: number
  status: 'pending' | 'running' | 'success' | 'error'
}

// LLM 思考步骤
export type ThinkingStep = {
  id: string
  text: string
  type: 'thinking' | 'decision' | 'action' | 'result'
  timestamp: number
}

// Agent 步骤
export type AgentStep = {
  id: string
  name: string
  description: string
  icon: string
  status: 'pending' | 'running' | 'completed' | 'error'
  output?: string
  tokenUsed?: number
  thinkingSteps: ThinkingStep[]
  toolCalls: ToolCall[]
  duration?: number
  result?: Record<string, unknown>
}

export type UserProfile = {
  id: string
  name?: string
  avatarUrl?: string
  defaults?: {
    destinationCountry?: string
    currency?: string
    priceMin?: number
    priceMax?: number
    quantity?: number
  }
}

// Guided Chat types
export type GuidedChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  images?: string[]  // base64 encoded
  isStreaming?: boolean
  timestamp: string
}

export type GuidedChatState = {
  sessionId: string | null
  messages: GuidedChatMessage[]
  turnCount: number
  maxTurns: number
  isStreaming: boolean
  streamingContent: string
  readyToSearch: boolean
  extractedMission: Mission | null
}

function sanitizeNonNegativeNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, value)
}

function sanitizeNonNegativeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function slugifyForXoobay(title: string): string {
  // XOOBAY 示例 URL: https://www.xoobay.com/products/<slug>
  // 这里用 title 生成 slug（尽量贴近网站习惯）：小写、非字母数字转为 -、压缩重复 -
  const raw = (title || '').toLowerCase()
  const slug = raw
    .normalize('NFKD')
    .replace(/['"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  // 避免超长 URL
  return slug.slice(0, 180).replace(/-$/g, '')
}

function normalizeUrlMaybe(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  if (trimmed.startsWith('/')) return `https://www.xoobay.com${trimmed}`
  return `https://www.xoobay.com/${trimmed}`
}

// Store 状态
interface ShoppingState {
  // 用户
  user: UserProfile | null

  // 首页可调参数（用户偏好 / 订单约束）
  destinationCountry: string
  currency: string
  priceMin: number | null
  priceMax: number | null
  quantity: number

  sessionId: string | null
  
  // 连接状态
  isAgentConnected: boolean
  isToolGatewayConnected: boolean
  
  // Guided Chat State (pre-agent conversation)
  guidedChat: GuidedChatState
  
  // 订单状态
  orderState: OrderState
  query: string
  mission: Mission | null
  agentSteps: AgentStep[]
  currentStepIndex: number
  isStreaming: boolean
  streamingText: string
  currentThinkingStep: string
  candidates: Product[]
  plans: Plan[]
  lastAgentMessage?: string // LLM 回复的消息
  selectedPlan: Plan | null
  draftOrder: DraftOrder | null
  aiRecommendation: {
    plan: string
    reason: string
    model: string
    confidence: number
  } | null
  totalTokens: number
  totalToolCalls: number
  
  // Clarification 计数（最多允许 3 次追问）
  clarificationAttempts: number
  maxClarificationAttempts: number
  
  // 错误状态
  error: string | null
  errorCode: string | null
  
  // Actions
  setUser: (user: UserProfile | null) => void
  setDestinationCountry: (value: string) => void
  setCurrency: (value: string) => void
  setPriceMin: (value: number | null) => void
  setPriceMax: (value: number | null) => void
  setQuantity: (value: number) => void

  setQuery: (query: string) => void
  setMission: (mission: Mission) => void
  setOrderState: (state: OrderState) => void
  startAgentProcess: () => Promise<void>
  updateAgentStep: (index: number, updates: Partial<AgentStep>) => void
  addThinkingStep: (stepIndex: number, thinking: ThinkingStep) => void
  addToolCall: (stepIndex: number, toolCall: ToolCall) => void
  updateToolCall: (stepIndex: number, toolId: string, updates: Partial<ToolCall>) => void
  setStreamingText: (text: string) => void
  selectPlan: (plan: Plan) => void
  toggleConfirmation: (itemId: string) => void
  canProceedToPayment: () => boolean
  reset: () => void
  setError: (error: string | null, code?: string | null) => void
  checkConnection: () => Promise<void>
  resetClarificationAttempts: () => void
  
  // Guided Chat Actions
  sendGuidedMessage: (message: string, images?: string[]) => Promise<void>
  confirmGuidedChat: () => void
  resetGuidedChat: () => void
}

// ========================================
// 初始数据
// ========================================

// 初始 Agent 步骤
const createInitialAgentSteps = (): AgentStep[] => [
  { id: 'intent', name: 'Intent Agent', description: 'Parsing your shopping request...', icon: '🎯', status: 'pending', thinkingSteps: [], toolCalls: [] },
  { id: 'candidate', name: 'Candidate Agent', description: 'Searching for matching products...', icon: '🔍', status: 'pending', thinkingSteps: [], toolCalls: [] },
  { id: 'verifier', name: 'Verifier Agent', description: 'Checking price, compliance & shipping...', icon: '✅', status: 'pending', thinkingSteps: [], toolCalls: [] },
  { id: 'plan', name: 'Plan Agent', description: 'Generating purchase plans...', icon: '📋', status: 'pending', thinkingSteps: [], toolCalls: [] },
  { id: 'execution', name: 'Execution Agent', description: 'Creating draft order...', icon: '🛒', status: 'pending', thinkingSteps: [], toolCalls: [] },
]

const defaultConfirmationItems: ConfirmationItem[] = [
  { id: 'tax_ack', type: 'tax', title: 'Tax Estimate Acknowledgment', description: 'I understand that tax and duty estimates may vary.', required: true, checked: false },
  { id: 'compliance_ack', type: 'compliance', title: 'Compliance Acknowledgment', description: 'I confirm awareness of compliance restrictions.', required: true, checked: false },
  { id: 'return_ack', type: 'return', title: 'Return Policy Acknowledgment', description: 'I understand returns within 30 days, buyer pays return shipping.', required: true, checked: false },
  { id: 'shipping_ack', type: 'shipping', title: 'Shipping Restrictions', description: 'I confirm my address is accessible for delivery.', required: false, checked: false },
]

// Helper: 延迟函数
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// Helper: 在 real API 模式下模拟 Agent 进度展示
// apiCompleteSignal: 当真实 API 返回时会 resolve 的 Promise
async function simulateAgentProgress(
  get: () => ShoppingState,
  set: (partial: Partial<ShoppingState> | ((state: ShoppingState) => Partial<ShoppingState>)) => void,
  addThinkingStep: (stepIndex: number, thinking: ThinkingStep) => void,
  addToolCall: (stepIndex: number, toolCall: ToolCall) => void,
  updateToolCall: (stepIndex: number, toolId: string, updates: Partial<ToolCall>) => void,
  apiCompleteSignal: Promise<void>,
) {
  const agentIds = ['intent', 'candidate', 'verifier', 'plan'] as const
  
  // 每个 Agent 的模拟思考过程
  const realApiThinkingSteps: Record<string, Array<{ type: 'thinking' | 'decision' | 'action' | 'result'; text: string }>> = {
    intent: [
      { type: 'thinking', text: 'Analyzing your shopping request...' },
      { type: 'action', text: 'Extracting product requirements, budget, and destination...' },
      { type: 'decision', text: 'Building structured mission specification...' },
    ],
    candidate: [
      { type: 'thinking', text: 'Searching product database...' },
      { type: 'action', text: 'Querying XooBay marketplace for matching products...' },
      { type: 'decision', text: 'Filtering candidates by availability and price...' },
    ],
    verifier: [
      { type: 'thinking', text: 'Verifying product details and pricing...' },
      { type: 'action', text: 'Checking shipping options and compliance...' },
      { type: 'decision', text: 'Calculating tax and duty estimates...' },
    ],
    plan: [
      { type: 'thinking', text: 'Generating optimized shopping plans...' },
      { type: 'action', text: 'Comparing price, delivery speed, and value...' },
      { type: 'result', text: 'Finalizing recommendations...' },
    ],
  }

  // 等待 API 的循环提示（用于最后一步）
  const waitingMessages = [
    'AI is thinking deeply...',
    'Generating personalized recommendations...',
    'Analyzing purchase context...',
    'Optimizing plans for best value...',
    'Almost there, finalizing results...',
    'AI agents collaborating...',
    'Evaluating seasonal relevance...',
    'Computing best options for you...',
  ]

  let totalTokens = 0
  let apiCompleted = false
  
  // 监听 API 完成信号
  apiCompleteSignal.then(() => { apiCompleted = true })
  
  for (let i = 0; i < agentIds.length; i++) {
    const agentId = agentIds[i]
    const thinkingSteps = realApiThinkingSteps[agentId]
    const startTime = Date.now()
    const isLastStep = i === agentIds.length - 1
    
    // 设置当前步骤索引
    set({ currentStepIndex: i })
    
    // 标记当前步骤为运行中
    set((state) => ({
      agentSteps: state.agentSteps.map((s, idx) => 
        idx === i ? { ...s, status: 'running' as const } : s
      ),
    }))
    
    // 模拟思考过程
    set({ isStreaming: true })
    for (const thinking of thinkingSteps) {
      const thinkingStep: ThinkingStep = {
        id: `t_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        text: thinking.text,
        type: thinking.type,
        timestamp: Date.now(),
      }
      addThinkingStep(i, thinkingStep)
      set({ currentThinkingStep: thinking.text })
      await delay(600 + Math.random() * 400) // 稍慢一些，让用户能看到
    }
    
    // 模拟工具调用
    const toolName = agentId === 'intent' ? 'mission.parse' :
                     agentId === 'candidate' ? 'catalog.search' :
                     agentId === 'verifier' ? 'compliance.check' : 'plan.generate'
    
    const toolCall: ToolCall = {
      id: `tc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: toolName,
      input: `{ "query": "${get().query.substring(0, 30)}..." }`,
      output: '',
      duration: 0,
      status: 'running',
    }
    addToolCall(i, toolCall)
    
    // 对于最后一步，等待 API 完成后再标记为 completed
    if (isLastStep) {
      // 显示循环等待动画，直到 API 返回
      let waitMsgIndex = 0
      while (!apiCompleted) {
        const waitMsg = waitingMessages[waitMsgIndex % waitingMessages.length]
        set({ currentThinkingStep: waitMsg })
        
        // 添加等待中的思考步骤
        const waitThinking: ThinkingStep = {
          id: `t_wait_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          text: waitMsg,
          type: 'thinking',
          timestamp: Date.now(),
        }
        addThinkingStep(i, waitThinking)
        
        waitMsgIndex++
        await delay(2000) // 每2秒更新一次等待消息
      }
      
      // API 已完成，更新工具调用状态
      const duration = Date.now() - startTime
      updateToolCall(i, toolCall.id, {
        output: '{ "status": "success", "plans_generated": true }',
        duration,
        status: 'success',
      })
    } else {
      // 非最后一步，正常模拟
      await delay(400 + Math.random() * 300)
      
      const duration = Date.now() - startTime
      updateToolCall(i, toolCall.id, {
        output: '{ "status": "success" }',
        duration,
        status: 'success',
      })
    }
    
    set({ isStreaming: false, currentThinkingStep: '' })
    
    // 更新状态机
    if (i === 0) set({ orderState: 'MISSION_READY' })
    if (i === 1) set({ orderState: 'CANDIDATES_READY' })
    if (i === 2) set({ orderState: 'VERIFIED_TOPN_READY' })
    
    const stepTokens = 80 + Math.floor(Math.random() * 120)
    totalTokens += stepTokens
    
    // 完成当前步骤
    set((state) => ({
      agentSteps: state.agentSteps.map((s, idx) => 
        idx === i ? { 
          ...s, 
          status: 'completed' as const, 
          tokenUsed: stepTokens,
          duration: Date.now() - startTime,
        } : s
      ),
      totalTokens,
    }))
    
    if (!isLastStep) {
      await delay(200)
    }
  }
}

// Helper: 解析 Mission
function parseMission(query: string): Mission {
  const mission: Mission = {
    destination_country: query.toLowerCase().includes('germany') ? 'DE' : 
                         query.toLowerCase().includes('uk') ? 'GB' : 'US',
    budget_amount: parseFloat(query.match(/\$?(\d+)/)?.[1] || '100'),
    budget_currency: 'USD',
    quantity: 1,
    hard_constraints: [],
    soft_preferences: [],
    search_query: query,
  }
  
  if (query.toLowerCase().includes('iphone')) {
    mission.hard_constraints.push({ type: 'compatibility', value: 'iPhone' })
  }
  if (query.toLowerCase().includes('wireless')) {
    mission.hard_constraints.push({ type: 'feature', value: 'wireless' })
  }
  if (query.toLowerCase().includes('fast')) {
    mission.soft_preferences.push({ type: 'feature', value: 'fast_charging' })
  }
  
  return mission
}

// ========================================
// Store
// ========================================

// Initial guided chat state
const createInitialGuidedChatState = (): GuidedChatState => ({
  sessionId: null,
  messages: [],
  turnCount: 0,
  maxTurns: 10,
  isStreaming: false,
  streamingContent: '',
  readyToSearch: false,
  extractedMission: null,
})

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set, get) => ({
      user: null,
      destinationCountry: '',
      currency: 'USD',
      priceMin: null,
      priceMax: null,
      quantity: 1,

      sessionId: null,
      
      // 连接状态
      isAgentConnected: false,
      isToolGatewayConnected: false,
      
      // Guided Chat State
      guidedChat: createInitialGuidedChatState(),
      
      // 订单状态
      orderState: 'IDLE' as OrderState,
      query: '',
      mission: null,
      agentSteps: createInitialAgentSteps(),
      currentStepIndex: -1,
      isStreaming: false,
      streamingText: '',
      currentThinkingStep: '',
      candidates: [],
      plans: [],
      selectedPlan: null,
      draftOrder: null,
      aiRecommendation: null,
      totalTokens: 0,
      totalToolCalls: 0,
      
      // Clarification 计数（最多允许 3 次追问）
      clarificationAttempts: 0,
      maxClarificationAttempts: 3,
      
      // 错误状态
      error: null,
      errorCode: null,

      setUser: (user) => set((state) => {
        // 如果用户 profile 里带 defaults，且当前字段未设置，则自动填充（不覆盖用户已手填的）
        const defaults = user?.defaults
        return {
          user,
          destinationCountry: state.destinationCountry || defaults?.destinationCountry || state.destinationCountry,
          currency: state.currency || defaults?.currency || state.currency,
          priceMin: state.priceMin ?? (defaults?.priceMin ?? state.priceMin),
          priceMax: state.priceMax ?? (defaults?.priceMax ?? state.priceMax),
          quantity: state.quantity || defaults?.quantity || state.quantity,
        }
      }),
      setDestinationCountry: (destinationCountry) => set({ destinationCountry }),
      setCurrency: (currency) => set({ currency }),
      setPriceMin: (priceMin) => set((state) => {
        if (priceMin === null) return { priceMin: null }
        const nextMin = sanitizeNonNegativeNumber(priceMin, 0)
        const nextMax = state.priceMax !== null ? sanitizeNonNegativeNumber(state.priceMax, nextMin) : null
        // 保证 min <= max：若当前 max 小于新的 min，则把 max 跟随到 min
        const fixedMax = nextMax !== null && nextMax < nextMin ? nextMin : nextMax
        return { priceMin: nextMin, priceMax: fixedMax }
      }),
      setPriceMax: (priceMax) => set((state) => {
        if (priceMax === null) return { priceMax: null }
        const nextMax = sanitizeNonNegativeNumber(priceMax, 0)
        const nextMin = state.priceMin !== null ? sanitizeNonNegativeNumber(state.priceMin, 0) : null
        // 保证 min <= max：若当前 min 大于新的 max，则把 min 跟随到 max
        const fixedMin = nextMin !== null && nextMin > nextMax ? nextMax : nextMin
        return { priceMin: fixedMin, priceMax: nextMax }
      }),
      setQuantity: (quantity) => set({ quantity: Math.max(1, sanitizeNonNegativeInt(quantity, 1)) }),

      setQuery: (query) => set({ query }),
      setMission: (mission) => set({ mission, orderState: 'MISSION_READY' }),
      setOrderState: (orderState) => set({ orderState }),
      setError: (error, code = null) => set({ error, errorCode: code }),

      addThinkingStep: (stepIndex, thinking) => set((state) => ({
        agentSteps: state.agentSteps.map((s, i) => 
          i === stepIndex 
            ? { ...s, thinkingSteps: [...s.thinkingSteps, thinking] }
            : s
        ),
      })),

      addToolCall: (stepIndex, toolCall) => set((state) => ({
        agentSteps: state.agentSteps.map((s, i) => 
          i === stepIndex 
            ? { ...s, toolCalls: [...s.toolCalls, toolCall] }
            : s
        ),
        totalToolCalls: state.totalToolCalls + 1,
      })),

      updateToolCall: (stepIndex, toolId, updates) => set((state) => ({
        agentSteps: state.agentSteps.map((s, i) => 
          i === stepIndex 
            ? { ...s, toolCalls: s.toolCalls.map(t => t.id === toolId ? { ...t, ...updates } : t) }
            : s
        ),
      })),

      checkConnection: async () => {
        try {
          const status = await api.checkConnectionStatus()
          set({
            isAgentConnected: status.agent === 'connected',
            isToolGatewayConnected: status.toolGateway === 'connected',
          })
        } catch {
          set({
            isAgentConnected: false,
            isToolGatewayConnected: false,
          })
        }
      },

      startAgentProcess: async () => {
        const { query, addThinkingStep, addToolCall, updateToolCall, isAgentConnected } = get()
        
        // 清除之前的错误
        set({ error: null, errorCode: null })
        
        // 检查连接状态
        if (!isAgentConnected) {
          await get().checkConnection()
          if (!get().isAgentConnected) {
            set({ 
              error: 'Agent service is not available. Please check if the backend is running.',
              errorCode: 'AGENT_UNAVAILABLE'
            })
            return
          }
        }
        
        // 解析意图
        const state = get()
        const mission = (() => {
          const base = parseMission(query)
          const budgetCurrency = state.currency || base.budget_currency
          const baseBudgetAmount = base.budget_amount ?? 0
          return {
            ...base,
            destination_country: state.destinationCountry || base.destination_country,
            budget_currency: budgetCurrency,
            budget_amount: sanitizeNonNegativeNumber(
              state.priceMax ?? state.priceMin ?? baseBudgetAmount,
              baseBudgetAmount
            ),
            quantity: Math.max(1, sanitizeNonNegativeInt(state.quantity || base.quantity, 1)),
          }
        })()
        set({ mission, orderState: 'MISSION_READY' })
        
        // 调用后端 Agent（Real API）
        // 创建一个可以从外部 resolve 的信号，用于通知动画 API 已完成
        let signalApiComplete: () => void = () => {}
        const apiCompleteSignal = new Promise<void>((resolve) => {
          signalApiComplete = resolve
        })
        
        // 启动进度模拟 - 在后台运行 API 调用的同时展示进度
        // 最后一步会等待 apiCompleteSignal 才标记为完成
        const progressPromise = simulateAgentProgress(get, set, addThinkingStep, addToolCall, updateToolCall, apiCompleteSignal)
          
        try {
          let response: api.ChatResponse
            
          try {
            const preferenceLines: string[] = []
            if (get().destinationCountry) preferenceLines.push(`Ship to: ${get().destinationCountry}`)
            if (get().currency) preferenceLines.push(`Currency: ${get().currency}`)
            if (get().priceMin !== null || get().priceMax !== null) {
              const min = get().priceMin !== null ? String(get().priceMin) : ''
              const max = get().priceMax !== null ? String(get().priceMax) : ''
              preferenceLines.push(`Desired price range: ${min}-${max} ${get().currency || 'USD'}`.trim())
            }
            if (get().quantity) preferenceLines.push(`Quantity: ${get().quantity}`)

            const composedMessage = preferenceLines.length
              ? `${query}\n\nPreferences:\n${preferenceLines.map((l) => `- ${l}`).join('\n')}`
              : query

            response = await api.sendChatMessage({
              message: composedMessage,
              session_id: get().sessionId || undefined,
            })
          } catch (err) {
            // 如果是 404 错误（Session not found），清除 session 并重试
            if (err instanceof api.ApiError && err.status === 404) {
              set({ sessionId: null })
              response = await api.sendChatMessage({
                message: query,
              })
            } else {
              throw err
            }
          }
          
          // API 已返回，通知动画可以完成最后一步
          signalApiComplete()
            
          // 等待进度模拟完成（最后一步收到信号后会立即完成）
          await progressPromise
            
          // 如果响应中包含 session 错误，也处理
          if (response.error?.includes('Session not found') || response.error_code === 'SESSION_NOT_FOUND') {
            set({ sessionId: null })
            response = await api.sendChatMessage({
              message: query,
            })
          }
            
          set({ sessionId: response.session_id })
            
            // 处理响应错误
            if (response.error) {
              // 对于 "No products found" 类型的错误，返回首页而不是显示错误弹窗
              const isNoProductsError = response.error.toLowerCase().includes('no products found') ||
                response.error.toLowerCase().includes('not found') ||
                response.error_code === 'NOT_FOUND' ||
                response.error_code === 'NO_RESULTS'
              
              if (isNoProductsError) {
                console.log('[DEBUG] No products found error, returning to input page')
                set({
                  orderState: 'IDLE',
                  clarificationAttempts: 0,
                  lastAgentMessage: '抱歉，未能找到符合您需求的商品。请尝试：\n- 使用更通用的搜索词\n- 调整预算范围\n- 更换目的地国家\n\nSorry, no products were found matching your criteria. Please try:\n- Using more general search terms\n- Adjusting your budget\n- Changing the destination country',
                  isStreaming: false,
                  error: null,
                  errorCode: null,
                })
                return
              }
              
              // 其他错误仍然显示弹窗
              set({ error: response.error, errorCode: response.error_code })
              return
            }

            // 先检查是否有 plans（优先显示 plans，即使 needs_user_input=true）
            // 因为有 plans 意味着搜索成功，需要用户选择
            const apiPlansCheck = response.plans as unknown as Array<Record<string, unknown>>
            if (apiPlansCheck && apiPlansCheck.length > 0) {
              console.log('[DEBUG] Found plans, skipping needs_user_input check, plans:', apiPlansCheck.length)
              // 继续处理 plans（不 return，让下面的 plans 处理逻辑执行）
            } else if (response.needs_user_input) {
              // 没有 plans 且需要用户输入 - 进入追问流程
              const currentAttempts = get().clarificationAttempts + 1
              const maxAttempts = get().maxClarificationAttempts
              
              console.log('[DEBUG] needs_user_input=true, attempt:', currentAttempts, '/', maxAttempts)
              console.log('[DEBUG] response.message:', response.message)
              
              // 检查是否超过最大追问次数
              if (currentAttempts > maxAttempts) {
                console.log('[DEBUG] Max clarification attempts reached, returning to input page')
                set({
                  orderState: 'IDLE',
                  clarificationAttempts: 0,
                  lastAgentMessage: '抱歉，我无法找到符合您需求的商品。请尝试修改您的搜索条件重新开始。\n\nSorry, I couldn\'t find products matching your requirements after several attempts. Please try modifying your search and start again.',
                  isStreaming: false
                })
                return
              }
              
              set({
                orderState: 'WAITING_USER_INPUT',
                lastAgentMessage: response.message,
                clarificationAttempts: currentAttempts,
                isStreaming: false
              })
              return
            }
            
            // 处理真实 API 响应并更新状态
            // 映射 API 响应到前端状态
            // Agent API 返回的 plan 格式与前端类型不同，需要转换
            const apiPlans = response.plans as unknown as Array<{
              plan_name?: string
              plan_type?: string
              items?: Array<{
                offer_id: string
                sku_id: string
                quantity: number
                unit_price: number
                subtotal: number
              }>
              total?: {
                subtotal: number
                shipping_cost: number
                tax_estimate: number
                total_landed_cost: number
              }
              delivery?: {
                min_days: number
                max_days: number
              }
              ai_recommendation?: AIRecommendationReason
              product_highlights?: string[]
            }>
            
            if (apiPlans && apiPlans.length > 0) {
              // 用后端返回的 mission 覆盖前端临时 mission（包含 purchase_context / detected_language 等新字段）
              if (response.mission) {
                set({
                  mission: response.mission as unknown as Mission,
                })
              }

              const getProductFromCandidate = (offerId: string): Product => {
                // 首先在 candidates 中查找
                let rawCandidate: Record<string, unknown> | undefined = response.candidates?.find((c) => c.offer_id === offerId) as Record<string, unknown> | undefined
                
                // 如果没找到，在 verified_candidates 中查找
                if (!rawCandidate) {
                  const verifiedCandidates = response.verified_candidates as unknown as Array<{ 
                    offer_id: string
                    candidate?: Record<string, unknown>
                  }>
                  const verifiedCandidate = verifiedCandidates?.find((v) => v.offer_id === offerId)
                  if (verifiedCandidate?.candidate) {
                    rawCandidate = verifiedCandidate.candidate
                  }
                }
                
                const candidateWithTitles = rawCandidate as { 
                  offer_id?: string
                  titles?: Array<{ text: string }>
                  title?: string
                  price?: { amount: number }
                  rating?: number
                  brand?: { name?: string } | string
                  product_url?: string
                  attributes?: {
                    image_url?: string
                    gallery_images?: string[]
                    description?: string
                    short_description?: string
                    store_name?: string
                    source?: string
                  }
                } | undefined
                
                let title = offerId
                if (candidateWithTitles?.titles && Array.isArray(candidateWithTitles.titles)) {
                  title = candidateWithTitles.titles[0]?.text || offerId
                } else if (candidateWithTitles?.title) {
                  title = candidateWithTitles.title
                }
                
                const brandObj = candidateWithTitles?.brand
                let brand = ''
                if (typeof brandObj === 'object' && brandObj?.name) {
                  brand = brandObj.name
                } else if (typeof brandObj === 'string') {
                  brand = brandObj
                }
                
                // 提取图片 URL
                const attributes = candidateWithTitles?.attributes
                let imageUrl = attributes?.image_url
                if (imageUrl && !imageUrl.startsWith('http')) {
                  imageUrl = `https://www.xoobay.com${imageUrl}`
                }
                
                const galleryImages = attributes?.gallery_images?.map(img => 
                  img.startsWith('http') ? img : `https://www.xoobay.com${img}`
                )
                
                // 判断是否为 XOOBAY 产品
                const isXoobay = offerId.startsWith('xoobay_') || attributes?.source === 'xoobay'
                const candidateProductUrl = candidateWithTitles?.product_url
                  ? normalizeUrlMaybe(candidateWithTitles.product_url)
                  : ''

                const productUrl = (() => {
                  // 1) 优先使用后端给出的真实链接（如果有）
                  if (candidateProductUrl) return candidateProductUrl

                  // 2) XOOBAY：按真实页面格式拼 /products/<slug>
                  if (isXoobay) {
                    const slug = slugifyForXoobay(title)
                    if (slug) return `https://www.xoobay.com/products/${encodeURIComponent(slug)}`
                  }

                  return undefined
                })()
                
                console.log('[DEBUG] getProductFromCandidate:', offerId, 'imageUrl:', imageUrl, 'title:', title)
                
                return {
                  id: offerId,
                  title,
                  price: candidateWithTitles?.price?.amount || 0,
                  image: '📦',
                  imageUrl,
                  galleryImages,
                  brand,
                  rating: candidateWithTitles?.rating || 4.0,
                  description: attributes?.description,
                  shortDescription: attributes?.short_description,
                  storeName: attributes?.store_name,
                  productUrl,
                  source: isXoobay ? 'xoobay' : 'database',
                  complianceRisks: [],
                }
              }
              
              const mappedPlans: Plan[] = apiPlans.map((plan, index) => {
                const firstItem = plan.items?.[0]
                const product = firstItem ? getProductFromCandidate(firstItem.offer_id) : {
                  id: 'unknown',
                  title: 'Unknown Product',
                  price: 0,
                  image: '📦',
                  brand: '',
                  rating: 0,
                  complianceRisks: [],
                }
                
                const planType = plan.plan_type as 'cheapest' | 'fastest' | 'best_value' || 
                  (index === 0 ? 'cheapest' : index === 1 ? 'fastest' : 'best_value')
                
                return {
                  name: plan.plan_name || `Plan ${index + 1}`,
                  type: planType,
                  product,
                  shipping: plan.total?.shipping_cost || 0,
                  shippingOption: 'Standard Shipping',
                  tax: {
                    amount: plan.total?.tax_estimate || 0,
                    currency: 'USD',
                    confidence: 'medium' as const,
                    method: 'rule_based' as const,
                    breakdown: {
                      vat: (plan.total?.tax_estimate || 0) * 0.7,
                      duty: (plan.total?.tax_estimate || 0) * 0.2,
                      handling: (plan.total?.tax_estimate || 0) * 0.1,
                    },
                  },
                  total: plan.total?.total_landed_cost || 0,
                  deliveryDays: `${plan.delivery?.min_days || 3}-${plan.delivery?.max_days || 10} days`,
                  emoji: planType === 'cheapest' ? '💰' : planType === 'fastest' ? '⚡' : '🏆',
                  recommended: index === 0,
                  reason: planType === 'cheapest' ? 'Lowest total cost' : 
                         planType === 'fastest' ? 'Fastest delivery' : 'Best value for money',
                  risks: [],
                  confidence: 0.8,
                  aiRecommendation: (plan as unknown as { ai_recommendation?: AIRecommendationReason }).ai_recommendation,
                  productHighlights: (plan as unknown as { product_highlights?: string[] }).product_highlights,
                }
              })
              
              // 完成最后一个步骤 (plan agent) 并添加 execution 的快速完成动画
              const finalTokens = get().totalTokens + 50
              set((state) => ({
                agentSteps: state.agentSteps.map((step, i) => {
                  if (i < 4) {
                    return { ...step, status: 'completed' as const, tokenUsed: step.tokenUsed || 80 }
                  }
                  return step
                }),
                totalTokens: finalTokens,
              }))
              
              // 短暂显示完成状态后再跳转
              await delay(500)
              
              set({ 
                plans: mappedPlans,
                orderState: 'TOTAL_COMPUTED',
                aiRecommendation: {
                  plan: mappedPlans[0]?.name || 'Best Option',
                  reason: `Found ${mappedPlans.length} shopping plans for your request.`,
                  model: 'GPT-4o-mini',
                  confidence: 0.85,
                },
                isStreaming: false,
                currentThinkingStep: '',
              })
            } else {
              set({ error: 'No shopping plans generated by the agent.', errorCode: 'NO_PLANS', isStreaming: false })
            }
            
            return
          } catch (err) {
            // 确保在错误情况下也通知动画完成，避免无限等待
            signalApiComplete()
            const errorMsg = err instanceof Error ? err.message : 'Unknown error'
            set({ error: `Failed to call agent: ${errorMsg}`, errorCode: 'API_ERROR', isStreaming: false })
            return
          }
      },

      updateAgentStep: (index, updates) => set((state) => ({
        agentSteps: state.agentSteps.map((s, i) => i === index ? { ...s, ...updates } : s),
      })),

      setStreamingText: (streamingText) => set({ streamingText }),

      selectPlan: (plan) => {
        const draftOrder: DraftOrder = {
          id: `do_${Math.random().toString(36).substr(2, 12)}`,
          plan,
          confirmationItems: defaultConfirmationItems.map(item => ({ ...item })),
          evidenceSnapshotId: `ev_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Math.random().toString(36).substr(2, 8)}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        }
        
        set({
          selectedPlan: plan,
          draftOrder,
          orderState: 'DRAFT_ORDER_CREATED',
        })
      },

      toggleConfirmation: (itemId) => set((state) => ({
        draftOrder: state.draftOrder ? {
          ...state.draftOrder,
          confirmationItems: state.draftOrder.confirmationItems.map(item =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
          ),
        } : null,
      })),

      canProceedToPayment: () => {
        const { draftOrder } = get()
        if (!draftOrder) return false
        return draftOrder.confirmationItems.filter(item => item.required).every(item => item.checked)
      },

      reset: () => set({
        orderState: 'IDLE',
        query: '',
        mission: null,
        agentSteps: createInitialAgentSteps(),
        currentStepIndex: -1,
        isStreaming: false,
        streamingText: '',
        currentThinkingStep: '',
        candidates: [],
        plans: [],
        selectedPlan: null,
        draftOrder: null,
        aiRecommendation: null,
        totalTokens: 0,
        totalToolCalls: 0,
        clarificationAttempts: 0,
        error: null,
        errorCode: null,
        lastAgentMessage: undefined,
      }),

      resetClarificationAttempts: () => set({ clarificationAttempts: 0 }),

      // Guided Chat Actions
      sendGuidedMessage: async (message: string, images: string[] = []) => {
        const { guidedChat } = get()
        
        // Check turn limit
        if (guidedChat.turnCount >= guidedChat.maxTurns) {
          set({ error: 'Maximum conversation turns reached. Please proceed with current information or start over.' })
          return
        }
        
        // Add user message immediately
        const userMessage: GuidedChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          role: 'user',
          content: message,
          images,
          timestamp: new Date().toISOString(),
        }
        
        // Add placeholder for assistant response
        const assistantPlaceholder: GuidedChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}_assistant`,
          role: 'assistant',
          content: '',
          isStreaming: true,
          timestamp: new Date().toISOString(),
        }
        
        set((state) => ({
          guidedChat: {
            ...state.guidedChat,
            messages: [...state.guidedChat.messages, userMessage, assistantPlaceholder],
            isStreaming: true,
            streamingContent: '',
          },
        }))
        
        try {
          // Use streaming API
          let fullContent = ''
          let sessionId = guidedChat.sessionId
          let turnCount = guidedChat.turnCount
          let readyToSearch = false
          let extractedMission: Mission | null = null
          
          for await (const chunk of api.streamGuidedChat({
            message,
            images,
            session_id: sessionId || undefined,
          })) {
            if (chunk.type === 'text' && chunk.content) {
              fullContent += chunk.content
              
              // Update streaming content
              set((state) => ({
                guidedChat: {
                  ...state.guidedChat,
                  streamingContent: fullContent,
                  messages: state.guidedChat.messages.map((m) =>
                    m.id === assistantPlaceholder.id
                      ? { ...m, content: fullContent }
                      : m
                  ),
                },
              }))
            } else if (chunk.type === 'done' && chunk.data) {
              sessionId = chunk.data.session_id || sessionId
              turnCount = chunk.data.turn_count || turnCount + 1
              readyToSearch = chunk.data.ready_to_search || false
              if (chunk.data.extracted_mission) {
                extractedMission = chunk.data.extracted_mission as unknown as Mission
              }
            } else if (chunk.type === 'mission' && chunk.data) {
              extractedMission = chunk.data as unknown as Mission
            } else if (chunk.type === 'error') {
              set({ error: chunk.content || 'Unknown error in guided chat' })
            }
          }
          
          // Finalize the message
          set((state) => ({
            guidedChat: {
              ...state.guidedChat,
              sessionId,
              turnCount,
              isStreaming: false,
              streamingContent: '',
              readyToSearch,
              extractedMission,
              messages: state.guidedChat.messages.map((m) =>
                m.id === assistantPlaceholder.id
                  ? { ...m, content: fullContent, isStreaming: false }
                  : m
              ),
            },
          }))
          
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          set({
            error: `Guided chat error: ${errorMsg}`,
            guidedChat: {
              ...get().guidedChat,
              isStreaming: false,
              messages: get().guidedChat.messages.filter((m) => m.id !== assistantPlaceholder.id),
            },
          })
        }
      },

      confirmGuidedChat: () => {
        const { guidedChat } = get()
        
        if (!guidedChat.extractedMission) {
          set({ error: 'No mission extracted yet. Please continue the conversation.' })
          return
        }
        
        // Transfer extracted mission to main flow
        set({
          mission: guidedChat.extractedMission,
          query: guidedChat.extractedMission.search_query || '',
          orderState: 'MISSION_READY',
        })
      },

      resetGuidedChat: () => {
        set({
          guidedChat: createInitialGuidedChatState(),
        })
      },
    }),
    {
      name: 'shopping-store',
      partialize: (state) => ({
        user: state.user,
        destinationCountry: state.destinationCountry,
        currency: state.currency,
        priceMin: state.priceMin,
        priceMax: state.priceMax,
        quantity: state.quantity,
      }),
    }
  )
)
