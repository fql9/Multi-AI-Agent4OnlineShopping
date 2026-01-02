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
  budget_amount: number
  budget_currency: string
  quantity: number
  arrival_days_max?: number
  hard_constraints: Array<{ type: string; value: string }>
  soft_preferences: Array<{ type: string; value: string }>
  search_query: string
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
  source?: 'xoobay' | 'database' | 'mock'  // 数据来源
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

// API 模式
export type ApiMode = 'real' | 'mock'

// Store 状态
interface ShoppingState {
  // 模式设置
  apiMode: ApiMode
  sessionId: string | null
  
  // 连接状态
  isAgentConnected: boolean
  isToolGatewayConnected: boolean
  
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
  setApiMode: (mode: ApiMode) => void
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

// 模拟数据
const mockProducts: Product[] = [
  {
    id: 'of_001',
    title: 'Anker MagSafe Wireless Charger 15W',
    price: 35.99,
    image: '📱',
    imageUrl: 'https://m.media-amazon.com/images/I/61UzMDJDJsL._AC_SL1500_.jpg',
    brand: 'Anker',
    rating: 4.8,
    description: 'Fast wireless charging with MagSafe compatibility for iPhone 12 and later.',
    shortDescription: '15W Fast Wireless Charger',
    storeName: 'Anker Official',
    source: 'mock',
    complianceRisks: [
      { type: 'magnet', severity: 'low', message: 'Contains magnets (MagSafe)', mitigation: 'Safe for shipping' },
    ],
  },
  {
    id: 'of_002',
    title: 'Belkin BoostCharge Pro 3-in-1',
    price: 89.99,
    image: '🔌',
    imageUrl: 'https://m.media-amazon.com/images/I/61UzMDJDJsL._AC_SL1500_.jpg',
    brand: 'Belkin',
    rating: 4.6,
    description: '3-in-1 wireless charging station for iPhone, Apple Watch, and AirPods.',
    shortDescription: '3-in-1 Charging Station',
    storeName: 'Belkin Store',
    source: 'mock',
    complianceRisks: [],
  },
  {
    id: 'of_003',
    title: 'Apple MagSafe Charger',
    price: 39.00,
    image: '🍎',
    imageUrl: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MHXH3?wid=1144&hei=1144&fmt=jpeg&qlt=90&.v=1603835871000',
    brand: 'Apple',
    rating: 4.5,
    description: 'The MagSafe Charger makes wireless charging a snap.',
    shortDescription: 'Apple MagSafe Charger',
    storeName: 'Apple Store',
    source: 'mock',
    complianceRisks: [
      { type: 'magnet', severity: 'low', message: 'Contains magnets (MagSafe)', mitigation: 'Safe for shipping' },
    ],
  },
]

// 模拟各 Agent 的详细处理过程
const agentProcesses = {
  intent: {
    thinking: [
      { type: 'thinking' as const, text: 'Analyzing user query structure and intent...' },
      { type: 'thinking' as const, text: 'Extracting key entities: product type, budget, destination...' },
      { type: 'decision' as const, text: 'Identified: wireless charger, iPhone compatible, $50 budget, Germany' },
      { type: 'action' as const, text: 'Building structured MissionSpec with constraints...' },
      { type: 'result' as const, text: 'Mission created with 2 hard constraints, 1 soft preference' },
    ],
    tools: [
      { name: 'mission.create', input: '{ user_id: "u_123", query: "..." }', output: '{ mission_id: "m_abc123" }' },
    ],
  },
  candidate: {
    thinking: [
      { type: 'thinking' as const, text: 'Constructing search query from mission constraints...' },
      { type: 'action' as const, text: 'Executing search: BM25 + vector similarity...' },
      { type: 'thinking' as const, text: 'Filtering by destination country availability...' },
      { type: 'decision' as const, text: 'Found 47 initial candidates, filtering to top 20...' },
      { type: 'result' as const, text: 'Selected 10 candidates for verification' },
    ],
    tools: [
      { name: 'catalog.search_offers', input: '{ query: "wireless charger iPhone", filters: {...} }', output: '{ count: 47, offers: [...] }' },
      { name: 'catalog.get_offer_card', input: '{ offer_ids: ["of_001", "of_002", ...] }', output: '{ cards: [...] }' },
      { name: 'catalog.get_availability', input: '{ offer_ids: [...], country: "DE" }', output: '{ available: 10 }' },
    ],
  },
  verifier: {
    thinking: [
      { type: 'thinking' as const, text: 'Starting real-time verification for 10 candidates...' },
      { type: 'action' as const, text: 'Fetching live pricing from pricing service...' },
      { type: 'action' as const, text: 'Checking shipping options to Germany...' },
      { type: 'action' as const, text: 'Running compliance checks for EU regulations...' },
      { type: 'decision' as const, text: 'of_001: ✓ price OK, ✓ shipping OK, ⚠️ magnet warning' },
      { type: 'decision' as const, text: 'of_002: ✓ price OK (over budget), ✓ compliant' },
      { type: 'decision' as const, text: 'of_003: ✓ price OK, ✓ Apple certified, ⚠️ magnet' },
      { type: 'thinking' as const, text: 'Estimating duties and taxes for DE destination...' },
      { type: 'result' as const, text: '3 candidates verified, 0 rejected' },
    ],
    tools: [
      { name: 'pricing.get_realtime_quote', input: '{ sku_ids: [...], qty: 1, country: "DE" }', output: '{ quotes: [...] }' },
      { name: 'shipping.quote_options', input: '{ items: [...], destination: "DE" }', output: '{ options: 4 }' },
      { name: 'compliance.check_item', input: '{ sku_id: "of_001", country: "DE" }', output: '{ allowed: true, warnings: [...] }' },
      { name: 'tax.estimate_duties_and_taxes', input: '{ items: [...], country: "DE" }', output: '{ total: 3.36, confidence: "medium" }' },
    ],
  },
  plan: {
    thinking: [
      { type: 'thinking' as const, text: 'Analyzing verified candidates for plan generation...' },
      { type: 'thinking' as const, text: 'Calculating total landed cost for each option...' },
      { type: 'action' as const, text: 'Generating Plan 1: Budget Saver (lowest cost)...' },
      { type: 'action' as const, text: 'Generating Plan 2: Express Delivery (fastest)...' },
      { type: 'action' as const, text: 'Generating Plan 3: Best Value (balanced)...' },
      { type: 'decision' as const, text: 'Recommending "Budget Saver" based on objective weights' },
      { type: 'result' as const, text: 'Generated 3 executable plans with confidence scores' },
    ],
    tools: [
      { name: 'promotion.list_applicable', input: '{ offer_ids: [...], user_id: "..." }', output: '{ promotions: 2 }' },
    ],
  },
  execution: {
    thinking: [
      { type: 'thinking' as const, text: 'Preparing to create draft order from selected plan...' },
      { type: 'action' as const, text: 'Creating shopping cart with selected items...' },
      { type: 'action' as const, text: 'Applying shipping option: Standard International...' },
      { type: 'action' as const, text: 'Computing final total with all fees...' },
      { type: 'action' as const, text: 'Creating evidence snapshot for audit trail...' },
      { type: 'decision' as const, text: 'Draft order ready, awaiting user confirmation' },
      { type: 'result' as const, text: 'Draft Order do_xxx created, expires in 24h' },
    ],
    tools: [
      { name: 'cart.create', input: '{ user_id: "u_123" }', output: '{ cart_id: "cart_abc" }' },
      { name: 'cart.add_item', input: '{ cart_id: "...", sku_id: "of_001", qty: 1 }', output: '{ success: true }' },
      { name: 'checkout.select_shipping', input: '{ cart_id: "...", option_id: "ship_std" }', output: '{ updated: true }' },
      { name: 'checkout.compute_total', input: '{ cart_id: "..." }', output: '{ total: 45.34, breakdown: {...} }' },
      { name: 'evidence.create_snapshot', input: '{ context: {...} }', output: '{ snapshot_id: "ev_xxx" }' },
      { name: 'checkout.create_draft_order', input: '{ cart_id: "...", consents: {...} }', output: '{ draft_order_id: "do_xxx" }' },
    ],
  },
}

// Helper: 延迟函数
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// Helper: 在 real API 模式下模拟 Agent 进度展示
async function simulateAgentProgress(
  get: () => ShoppingState,
  set: (partial: Partial<ShoppingState> | ((state: ShoppingState) => Partial<ShoppingState>)) => void,
  addThinkingStep: (stepIndex: number, thinking: ThinkingStep) => void,
  addToolCall: (stepIndex: number, toolCall: ToolCall) => void,
  updateToolCall: (stepIndex: number, toolId: string, updates: Partial<ToolCall>) => void,
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

  let totalTokens = 0
  
  for (let i = 0; i < agentIds.length; i++) {
    const agentId = agentIds[i]
    const thinkingSteps = realApiThinkingSteps[agentId]
    const startTime = Date.now()
    
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
    
    await delay(400 + Math.random() * 300)
    
    const duration = Date.now() - startTime
    updateToolCall(i, toolCall.id, {
      output: '{ "status": "success" }',
      duration,
      status: 'success',
    })
    
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
    
    await delay(200)
  }
}

// Helper: 提取搜索关键词
function extractSearchKeywords(query: string): string {
  const stopWords = ['i', 'need', 'want', 'buy', 'looking', 'for', 'a', 'an', 'the', 'to', 'my', 'me', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'must', 'shall', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'into', 'through', 'during', 'including', 'against', 'among', 'throughout', 'despite', 'towards', 'upon', 'concerning', 'from', 'up', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'some', 'keeping', 'budget', 'within', 'three', 'days', 'prioritizing', 'avoiding', 'small', 'parts', 'that', 'easy', 'swallow', 'delivery', 'stem']
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.includes(word))
    .slice(0, 5)
  
  let searchQuery = words.length > 0 ? words.join(' ') : ''
  if (searchQuery.length < 3 || words.length < 2) {
    const allWords = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1)
    const importantWords = allWords.filter(w => !stopWords.includes(w)).slice(0, 3)
    searchQuery = importantWords.length > 0 ? importantWords.join(' ') : query.trim().slice(0, 50)
  }
  return searchQuery
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

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set, get) => ({
      // 模式设置
      apiMode: 'mock' as ApiMode,
      sessionId: null,
      
      // 连接状态
      isAgentConnected: false,
      isToolGatewayConnected: false,
      
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

      setApiMode: (mode) => set({ apiMode: mode }),
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
        const { query, apiMode, addThinkingStep, addToolCall, updateToolCall, isAgentConnected, isToolGatewayConnected, updateAgentStep } = get()
        
        // 清除之前的错误
        set({ error: null, errorCode: null })
        
        // 检查连接状态
        if (apiMode === 'real' && !isAgentConnected) {
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
        const mission = parseMission(query)
        set({ mission, orderState: 'MISSION_READY' })
        
        // 如果使用真实 API 模式，尝试调用后端
        if (apiMode === 'real' && isAgentConnected) {
          // 启动进度模拟 - 在后台运行 API 调用的同时展示进度
          const progressPromise = simulateAgentProgress(get, set, addThinkingStep, addToolCall, updateToolCall)
          
          try {
            let response: api.ChatResponse
            
            try {
              response = await api.sendChatMessage({
                message: query,
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
            
            // 等待进度模拟完成或至少完成前两步
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
            }>
            
            if (apiPlans && apiPlans.length > 0) {
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
                const xoobayId = isXoobay ? offerId.replace('xoobay_', '') : null
                const productUrl = isXoobay && xoobayId
                  ? `https://www.xoobay.com/product/${xoobayId}`
                  : undefined
                
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
            const errorMsg = err instanceof Error ? err.message : 'Unknown error'
            set({ error: `Failed to call agent: ${errorMsg}`, errorCode: 'API_ERROR' })
            return
          }
        }
        
        // 使用模拟模式
        const agentIds = ['intent', 'candidate', 'verifier', 'plan', 'execution'] as const
        let totalTokens = 0
        let realProducts: Product[] = []
        
        for (let i = 0; i < agentIds.length; i++) {
          const agentId = agentIds[i]
          const process = agentProcesses[agentId]
          const startTime = Date.now()
          
          set({ currentStepIndex: i })
          
          // 设置为运行中
          set((state) => ({
            agentSteps: state.agentSteps.map((s, idx) => 
              idx === i ? { ...s, status: 'running' as const } : s
            ),
          }))
          
          // 模拟思考过程
          set({ isStreaming: true })
          for (const thinking of process.thinking) {
            const thinkingStep: ThinkingStep = {
              id: `t_${Date.now()}`,
              text: thinking.text,
              type: thinking.type,
              timestamp: Date.now(),
            }
            addThinkingStep(i, thinkingStep)
            set({ currentThinkingStep: thinking.text })
            await delay(400 + Math.random() * 300)
          }
          
          // 工具调用 - 如果是 candidate agent 且 Tool Gateway 连接，尝试获取真实产品
          if (agentId === 'candidate' && isToolGatewayConnected) {
            const searchQuery = extractSearchKeywords(query)
            
            const toolCall: ToolCall = {
              id: `tc_${Date.now()}_search`,
              name: 'catalog.search_offers',
              input: JSON.stringify({ query: searchQuery, limit: 10 }),
              output: '',
              duration: 0,
              status: 'running',
            }
            addToolCall(i, toolCall)
            
            try {
              const searchResult = await api.searchOffers({ query: searchQuery, limit: 10 })
              const duration = Date.now() - startTime
              
              if (searchResult.ok && searchResult.data?.offer_ids && searchResult.data.offer_ids.length > 0) {
                const offerIds = searchResult.data.offer_ids.slice(0, 3)
                const products: Product[] = []
                
                for (const offerId of offerIds) {
                  try {
                    const detailResult = await api.getOfferCard(offerId)
                    if (detailResult.ok && detailResult.data) {
                      const data = detailResult.data
                      let price = 0
                      if (data.price?.amount !== undefined) {
                        const priceValue = Number(data.price.amount)
                        price = isNaN(priceValue) ? 0 : Math.round(priceValue * 100) / 100
                      }
                      
                      const attributes = data.attributes as {
                        image_url?: string
                        gallery_images?: string[]
                        description?: string
                        short_description?: string
                        store_name?: string
                        source?: string
                      } | null
                      
                      const isXoobay = offerId.startsWith('xoobay_') || attributes?.source === 'xoobay'
                      const xoobayId = isXoobay ? offerId.replace('xoobay_', '') : null
                      
                      let imageUrl = attributes?.image_url
                      if (imageUrl && !imageUrl.startsWith('http')) {
                        imageUrl = `https://www.xoobay.com${imageUrl}`
                      }
                      
                      const galleryImages = attributes?.gallery_images?.map(img => 
                        img.startsWith('http') ? img : `https://www.xoobay.com${img}`
                      )
                      
                      const productUrl = isXoobay && xoobayId
                        ? `https://www.xoobay.com/product/${xoobayId}`
                        : undefined
                      
                      products.push({
                        id: offerId,
                        title: data.titles?.[0]?.text || data.titles?.[1]?.text || 'Product',
                        price: price,
                        image: '📦',
                        imageUrl: imageUrl,
                        galleryImages: galleryImages,
                        brand: data.brand?.name || 'Unknown',
                        rating: typeof data.rating === 'number' ? data.rating : (parseFloat(String(data.rating || 0)) || 4.0),
                        description: attributes?.description,
                        shortDescription: attributes?.short_description,
                        storeName: attributes?.store_name,
                        productUrl: productUrl,
                        source: isXoobay ? 'xoobay' : 'database',
                        complianceRisks: [],
                      })
                    }
                  } catch (err) {
                    console.error('Failed to fetch product detail:', err)
                  }
                }
                
                realProducts = products.length > 0 ? products : mockProducts
                
                updateToolCall(i, toolCall.id, {
                  output: JSON.stringify({ count: searchResult.data.offer_ids.length, products: realProducts.length, query: searchQuery }),
                  duration,
                  status: 'success',
                })
              } else {
                updateToolCall(i, toolCall.id, {
                  output: JSON.stringify({ error: 'No results found', fallback: 'using mock data', query: searchQuery }),
                  duration,
                  status: 'success',
                })
                realProducts = mockProducts
              }
            } catch (error) {
              console.error('API call failed:', error)
              updateToolCall(i, toolCall.id, {
                output: JSON.stringify({ error: String(error), fallback: 'using mock data' }),
                duration: Date.now() - startTime,
                status: 'success',
              })
              realProducts = mockProducts
            }
          } else {
            // 其他工具调用保持模拟
            for (const tool of process.tools) {
              const toolCall: ToolCall = {
                id: `tc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                name: tool.name,
                input: tool.input,
                output: '',
                duration: 0,
                status: 'running',
              }
              addToolCall(i, toolCall)
              await delay(200)
              
              const duration = 50 + Math.floor(Math.random() * 150)
              await delay(duration)
              
              updateToolCall(i, toolCall.id, {
                output: tool.output,
                duration,
                status: 'success',
              })
            }
          }
          
          set({ isStreaming: false, currentThinkingStep: '' })
          
          // 更新状态机
          if (i === 0) set({ orderState: 'MISSION_READY' })
          if (i === 1) set({ orderState: 'CANDIDATES_READY', candidates: realProducts.length > 0 ? realProducts : mockProducts })
          if (i === 2) set({ orderState: 'VERIFIED_TOPN_READY' })
          if (i === 3) set({ orderState: 'TOTAL_COMPUTED' })
          
          const stepTokens = 100 + Math.floor(Math.random() * 200)
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
          
          await delay(200)
        }
        
        // 使用真实产品或 mock 产品生成方案
        const productsToUse = realProducts.length > 0 ? realProducts : mockProducts
        
        // 方案模板配置
        const planTemplates = [
          { name: 'Budget Saver', type: 'cheapest' as const, shipping: 5.99, shippingOption: 'Standard International (7-14 days)', deliveryDays: '7-14', emoji: '💰', taxConfidence: 'medium' as const, confidence: 0.92 },
          { name: 'Express Delivery', type: 'fastest' as const, shipping: 12.99, shippingOption: 'DHL Express (3-5 days)', deliveryDays: '3-5', emoji: '⚡', taxConfidence: 'high' as const, confidence: 0.85 },
          { name: 'Best Value', type: 'best_value' as const, shipping: 0, shippingOption: 'Free Premium Shipping (5-7 days)', deliveryDays: '5-7', emoji: '⭐', taxConfidence: 'medium' as const, confidence: 0.88 },
          { name: 'Prime Choice', type: 'best_value' as const, shipping: 8.99, shippingOption: 'Prime Shipping (4-6 days)', deliveryDays: '4-6', emoji: '🏆', taxConfidence: 'high' as const, confidence: 0.82 },
          { name: 'Economy Option', type: 'cheapest' as const, shipping: 3.99, shippingOption: 'Economy Shipping (10-20 days)', deliveryDays: '10-20', emoji: '📦', taxConfidence: 'low' as const, confidence: 0.75 },
        ]
        
        // 生成方案 - 最多5个
        const plans: Plan[] = productsToUse.slice(0, 5).map((product, idx) => {
          const template = planTemplates[idx % planTemplates.length]
          const taxAmount = Math.round(product.price * 0.1 * 100) / 100
          const shippingCost = template.shipping
          
          return {
            name: template.name,
            type: template.type,
            product,
            shipping: shippingCost,
            shippingOption: template.shippingOption,
            tax: { 
              amount: taxAmount, 
              currency: 'USD', 
              confidence: template.taxConfidence, 
              method: 'rule_based', 
              breakdown: { 
                vat: Math.round(product.price * 0.07 * 100) / 100, 
                duty: Math.round(product.price * 0.02 * 100) / 100, 
                handling: Math.round(product.price * 0.01 * 100) / 100 
              } 
            },
            total: Math.round((product.price + shippingCost + taxAmount) * 100) / 100,
            deliveryDays: template.deliveryDays,
            emoji: template.emoji,
            recommended: idx === 0,
            reason: idx === 0 ? `Best match for your budget: ${product.title}` :
                    idx === 1 ? `Fastest delivery option: ${product.title}` :
                    idx === 2 ? `Best overall value: ${product.title}` :
                    idx === 3 ? `Premium quality choice: ${product.title}` :
                    `Most economical: ${product.title}`,
            risks: product.complianceRisks.length > 0 ? ['Compliance check required'] : [],
            confidence: template.confidence,
          }
        })
        
        set({
          plans,
          aiRecommendation: {
            plan: plans[0]?.name || 'Budget Saver',
            reason: `Based on your query "${query}", we found ${productsToUse.length} products. ${plans[0]?.reason || ''}`,
            model: 'GPT-4o-mini',
            confidence: plans[0]?.confidence || 0.92,
          },
        })
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
    }),
    {
      name: 'shopping-store',
      partialize: (state) => ({
        apiMode: state.apiMode,
        // 不持久化 sessionId，因为后端重启后会失效
      }),
    }
  )
)
