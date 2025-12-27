import { create } from 'zustand'

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
  image: string
  brand: string
  rating: number
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

// Store 状态
interface ShoppingState {
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
  
  // Actions
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
}

// 初始 Agent 步骤
const createInitialAgentSteps = (): AgentStep[] => [
  { id: 'intent', name: 'Intent Agent', description: 'Parsing your shopping request...', icon: '🎯', status: 'pending', thinkingSteps: [], toolCalls: [] },
  { id: 'candidate', name: 'Candidate Agent', description: 'Searching for matching products...', icon: '🔍', status: 'pending', thinkingSteps: [], toolCalls: [] },
  { id: 'verifier', name: 'Verifier Agent', description: 'Checking price, compliance & shipping...', icon: '✅', status: 'pending', thinkingSteps: [], toolCalls: [] },
  { id: 'plan', name: 'Plan Agent', description: 'Generating purchase plans...', icon: '📋', status: 'pending', thinkingSteps: [], toolCalls: [] },
  { id: 'execution', name: 'Execution Agent', description: 'Creating draft order...', icon: '🛒', status: 'pending', thinkingSteps: [], toolCalls: [] },
]

// 模拟数据
const mockProducts: Product[] = [
  {
    id: 'of_001',
    title: 'Anker MagSafe Wireless Charger 15W',
    price: 35.99,
    image: '📱',
    brand: 'Anker',
    rating: 4.8,
    complianceRisks: [
      { type: 'magnet', severity: 'low', message: 'Contains magnets (MagSafe)', mitigation: 'Safe for shipping' },
    ],
  },
  {
    id: 'of_002',
    title: 'Belkin BoostCharge Pro 3-in-1',
    price: 89.99,
    image: '🔌',
    brand: 'Belkin',
    rating: 4.6,
    complianceRisks: [],
  },
  {
    id: 'of_003',
    title: 'Apple MagSafe Charger',
    price: 39.00,
    image: '🍎',
    brand: 'Apple',
    rating: 4.5,
    complianceRisks: [
      { type: 'magnet', severity: 'low', message: 'Contains magnets (MagSafe)', mitigation: 'Safe for shipping' },
    ],
  },
]

const defaultConfirmationItems: ConfirmationItem[] = [
  { id: 'tax_ack', type: 'tax', title: 'Tax Estimate Acknowledgment', description: 'I understand that tax and duty estimates may vary.', required: true, checked: false },
  { id: 'compliance_ack', type: 'compliance', title: 'Compliance Acknowledgment', description: 'I confirm awareness of compliance restrictions.', required: true, checked: false },
  { id: 'return_ack', type: 'return', title: 'Return Policy Acknowledgment', description: 'I understand returns within 30 days, buyer pays return shipping.', required: true, checked: false },
  { id: 'shipping_ack', type: 'shipping', title: 'Shipping Restrictions', description: 'I confirm my address is accessible for delivery.', required: false, checked: false },
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
      { type: 'action' as const, text: 'Executing hybrid search: BM25 + vector similarity...' },
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

export const useShoppingStore = create<ShoppingState>((set, get) => ({
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

  setQuery: (query) => set({ query }),
  setMission: (mission) => set({ mission, orderState: 'MISSION_READY' }),
  setOrderState: (orderState) => set({ orderState }),

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

  startAgentProcess: async () => {
    const { query, addThinkingStep, addToolCall, updateToolCall } = get()
    
    // 解析意图
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
    
    set({ mission, orderState: 'MISSION_READY' })
    
    const agentIds = ['intent', 'candidate', 'verifier', 'plan', 'execution'] as const
    let totalTokens = 0
    
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
      
      // 模拟工具调用
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
      
      set({ isStreaming: false, currentThinkingStep: '' })
      
      // 更新状态机
      if (i === 0) set({ orderState: 'MISSION_READY' })
      if (i === 1) set({ orderState: 'CANDIDATES_READY', candidates: mockProducts })
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
    
    // 生成方案
    const plans: Plan[] = [
      {
        name: 'Budget Saver',
        type: 'cheapest',
        product: mockProducts[0],
        shipping: 5.99,
        shippingOption: 'Standard International (7-14 days)',
        tax: { amount: 3.36, currency: 'USD', confidence: 'medium', method: 'rule_based', breakdown: { vat: 2.50, duty: 0.50, handling: 0.36 } },
        total: 45.34,
        deliveryDays: '7-14',
        emoji: '💰',
        recommended: true,
        reason: 'Best match for your $50 budget with reliable shipping',
        risks: ['Tax estimate may vary at customs'],
        confidence: 0.92,
      },
      {
        name: 'Express Delivery',
        type: 'fastest',
        product: mockProducts[2],
        shipping: 12.99,
        shippingOption: 'DHL Express (3-5 days)',
        tax: { amount: 4.16, currency: 'USD', confidence: 'high', method: 'hs_code', breakdown: { vat: 3.00, duty: 0.80, handling: 0.36 } },
        total: 56.15,
        deliveryDays: '3-5',
        emoji: '⚡',
        recommended: false,
        reason: 'Fastest delivery with Apple quality',
        risks: ['Slightly over budget'],
        confidence: 0.85,
      },
      {
        name: 'Best Value',
        type: 'best_value',
        product: mockProducts[1],
        shipping: 0,
        shippingOption: 'Free Premium Shipping (5-7 days)',
        tax: { amount: 7.20, currency: 'USD', confidence: 'low', method: 'ml_estimate', breakdown: { vat: 5.00, duty: 1.50, handling: 0.70 } },
        total: 97.19,
        deliveryDays: '5-7',
        emoji: '⭐',
        recommended: false,
        reason: '3-in-1 charger with free shipping',
        risks: ['Above budget', 'Low tax confidence'],
        confidence: 0.78,
      },
    ]
    
    set({
      plans,
      aiRecommendation: {
        plan: 'Budget Saver',
        reason: 'Based on your $50 budget and shipping to Germany, this Anker charger offers the best value.',
        model: 'GPT-4o-mini',
        confidence: 0.92,
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
  }),
}))
