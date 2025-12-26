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

// 确认项（用户必须勾选）
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

// Agent 步骤
export type AgentStep = {
  id: string
  name: string
  description: string
  icon: string
  status: 'pending' | 'running' | 'completed' | 'error'
  output?: string
  tokenUsed?: number
}

// Store 状态
interface ShoppingState {
  // 状态机
  orderState: OrderState
  
  // 用户输入
  query: string
  mission: Mission | null
  
  // Agent 处理
  agentSteps: AgentStep[]
  currentStepIndex: number
  isStreaming: boolean
  streamingText: string
  
  // 产品和方案
  candidates: Product[]
  plans: Plan[]
  selectedPlan: Plan | null
  
  // 草稿订单
  draftOrder: DraftOrder | null
  
  // AI 推荐
  aiRecommendation: {
    plan: string
    reason: string
    model: string
    confidence: number
  } | null
  
  // Actions
  setQuery: (query: string) => void
  setMission: (mission: Mission) => void
  setOrderState: (state: OrderState) => void
  startAgentProcess: () => Promise<void>
  updateAgentStep: (index: number, updates: Partial<AgentStep>) => void
  setStreamingText: (text: string) => void
  selectPlan: (plan: Plan) => void
  toggleConfirmation: (itemId: string) => void
  canProceedToPayment: () => boolean
  reset: () => void
}

// 初始 Agent 步骤
const initialAgentSteps: AgentStep[] = [
  { id: 'intent', name: 'Intent Agent', description: 'Parsing your shopping request...', icon: '🎯', status: 'pending' },
  { id: 'candidate', name: 'Candidate Agent', description: 'Searching for matching products...', icon: '🔍', status: 'pending' },
  { id: 'verifier', name: 'Verifier Agent', description: 'Checking price, compliance & shipping...', icon: '✅', status: 'pending' },
  { id: 'plan', name: 'Plan Agent', description: 'Generating purchase plans...', icon: '📋', status: 'pending' },
  { id: 'execution', name: 'Execution Agent', description: 'Creating draft order...', icon: '🛒', status: 'pending' },
]

// 模拟产品数据（含合规风险）
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

// 默认确认项
const defaultConfirmationItems: ConfirmationItem[] = [
  {
    id: 'tax_ack',
    type: 'tax',
    title: 'Tax Estimate Acknowledgment',
    description: 'I understand that tax and duty estimates may vary and final amounts will be determined at customs.',
    required: true,
    checked: false,
  },
  {
    id: 'compliance_ack',
    type: 'compliance',
    title: 'Compliance Acknowledgment',
    description: 'I confirm that I am aware of any compliance restrictions for this product in my destination country.',
    required: true,
    checked: false,
  },
  {
    id: 'return_ack',
    type: 'return',
    title: 'Return Policy Acknowledgment',
    description: 'I understand the return policy: returns within 30 days, buyer pays return shipping for cross-border orders.',
    required: true,
    checked: false,
  },
  {
    id: 'shipping_ack',
    type: 'shipping',
    title: 'Shipping Restrictions',
    description: 'I confirm my address is not a PO Box and is accessible for delivery.',
    required: false,
    checked: false,
  },
]

export const useShoppingStore = create<ShoppingState>((set, get) => ({
  // 初始状态
  orderState: 'IDLE',
  query: '',
  mission: null,
  agentSteps: initialAgentSteps.map(s => ({ ...s })),
  currentStepIndex: -1,
  isStreaming: false,
  streamingText: '',
  candidates: [],
  plans: [],
  selectedPlan: null,
  draftOrder: null,
  aiRecommendation: null,

  // Actions
  setQuery: (query) => set({ query }),
  
  setMission: (mission) => set({ mission, orderState: 'MISSION_READY' }),
  
  setOrderState: (orderState) => set({ orderState }),
  
  startAgentProcess: async () => {
    const { query } = get()
    
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
    
    // 模拟 Agent 处理流程（带 SSE 效果）
    const steps = get().agentSteps
    
    for (let i = 0; i < steps.length; i++) {
      set({ currentStepIndex: i })
      
      // 更新当前步骤为运行中
      set((state) => ({
        agentSteps: state.agentSteps.map((s, idx) => 
          idx === i ? { ...s, status: 'running' as const } : s
        ),
      }))
      
      // 模拟流式输出
      set({ isStreaming: true, streamingText: '' })
      const outputs = [
        `Processing ${steps[i].name}...`,
        `Analyzing data...`,
        `Generating results...`,
        `Complete!`,
      ]
      
      for (const output of outputs) {
        await new Promise(r => setTimeout(r, 200))
        set({ streamingText: output })
      }
      
      set({ isStreaming: false })
      
      // 更新状态机
      if (i === 0) set({ orderState: 'MISSION_READY' })
      if (i === 1) set({ orderState: 'CANDIDATES_READY', candidates: mockProducts })
      if (i === 2) set({ orderState: 'VERIFIED_TOPN_READY' })
      if (i === 3) set({ orderState: 'TOTAL_COMPUTED' })
      
      // 完成当前步骤
      set((state) => ({
        agentSteps: state.agentSteps.map((s, idx) => 
          idx === i ? { ...s, status: 'completed' as const, tokenUsed: Math.floor(Math.random() * 200) + 100 } : s
        ),
      }))
      
      await new Promise(r => setTimeout(r, 300))
    }
    
    // 生成方案
    const taxEstimateLow: TaxEstimate = {
      amount: 3.36,
      currency: 'USD',
      confidence: 'medium',
      method: 'rule_based',
      breakdown: { vat: 2.50, duty: 0.50, handling: 0.36 },
    }
    
    const taxEstimateMid: TaxEstimate = {
      amount: 4.16,
      currency: 'USD',
      confidence: 'high',
      method: 'hs_code',
      breakdown: { vat: 3.00, duty: 0.80, handling: 0.36 },
    }
    
    const taxEstimateHigh: TaxEstimate = {
      amount: 7.20,
      currency: 'USD',
      confidence: 'low',
      method: 'ml_estimate',
      breakdown: { vat: 5.00, duty: 1.50, handling: 0.70 },
    }
    
    const plans: Plan[] = [
      {
        name: 'Budget Saver',
        type: 'cheapest',
        product: mockProducts[0],
        shipping: 5.99,
        shippingOption: 'Standard International (7-14 days)',
        tax: taxEstimateLow,
        total: 45.34,
        deliveryDays: '7-14',
        emoji: '💰',
        recommended: true,
        reason: 'Best match for your $50 budget with reliable shipping to Germany',
        risks: ['Tax estimate may vary at customs'],
        confidence: 0.92,
      },
      {
        name: 'Express Delivery',
        type: 'fastest',
        product: mockProducts[2],
        shipping: 12.99,
        shippingOption: 'DHL Express (3-5 days)',
        tax: taxEstimateMid,
        total: 56.15,
        deliveryDays: '3-5',
        emoji: '⚡',
        recommended: false,
        reason: 'Fastest delivery with Apple quality guarantee',
        risks: ['Slightly over budget'],
        confidence: 0.85,
      },
      {
        name: 'Best Value',
        type: 'best_value',
        product: mockProducts[1],
        shipping: 0,
        shippingOption: 'Free Premium Shipping (5-7 days)',
        tax: taxEstimateHigh,
        total: 97.19,
        deliveryDays: '5-7',
        emoji: '⭐',
        recommended: false,
        reason: '3-in-1 charger with free shipping - premium choice',
        risks: ['Above budget', 'Tax estimate has low confidence'],
        confidence: 0.78,
      },
    ]
    
    set({
      plans,
      aiRecommendation: {
        plan: 'Budget Saver',
        reason: 'Based on your $50 budget and shipping to Germany, this Anker charger offers the best value with fast 15W charging and excellent reviews.',
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
    return draftOrder.confirmationItems
      .filter(item => item.required)
      .every(item => item.checked)
  },
  
  reset: () => set({
    orderState: 'IDLE',
    query: '',
    mission: null,
    agentSteps: initialAgentSteps.map(s => ({ ...s, status: 'pending' as const })),
    currentStepIndex: -1,
    isStreaming: false,
    streamingText: '',
    candidates: [],
    plans: [],
    selectedPlan: null,
    draftOrder: null,
    aiRecommendation: null,
  }),
}))

