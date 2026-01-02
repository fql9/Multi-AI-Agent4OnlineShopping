'use client'

import { useEffect, useState, useRef } from 'react'
import { 
  ShoppingCart, Bot, Package, CheckCircle, Loader2, Send, 
  Sparkles, AlertTriangle, Info, Shield, Truck, Receipt,
  ChevronRight, Clock, Zap, Terminal, Brain, Wrench,
  ChevronDown, ChevronUp, Code, Activity, Cpu, Layers,
  LayoutGrid, Table2, ArrowUpDown, Star, DollarSign
} from 'lucide-react'
import { useShoppingStore, type OrderState, type TaxEstimate, type ComplianceRisk, type ThinkingStep, type ToolCall, type AgentStep } from '@/store/shopping'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// 状态机步骤映射
const STATE_LABELS: Record<OrderState, { label: string; step: number }> = {
  'IDLE': { label: 'Ready', step: 0 },
  'MISSION_READY': { label: 'Mission Created', step: 1 },
  'CANDIDATES_READY': { label: 'Products Found', step: 2 },
  'VERIFIED_TOPN_READY': { label: 'Verified', step: 3 },
  'PLAN_SELECTED': { label: 'Plan Selected', step: 4 },
  'CART_READY': { label: 'Cart Ready', step: 5 },
  'SHIPPING_SELECTED': { label: 'Shipping Selected', step: 6 },
  'TOTAL_COMPUTED': { label: 'Total Computed', step: 7 },
  'DRAFT_ORDER_CREATED': { label: 'Draft Order', step: 8 },
  'WAIT_USER_PAYMENT_CONFIRMATION': { label: 'Awaiting Confirmation', step: 9 },
  'PAID': { label: 'Paid', step: 10 },
}

// 思考类型图标和颜色 - Light theme
const thinkingTypeConfig = {
  thinking: { icon: Brain, color: 'text-primary-600', bg: 'bg-primary-50', label: 'Thinking' },
  decision: { icon: Sparkles, color: 'text-warning-600', bg: 'bg-warning-50', label: 'Decision' },
  action: { icon: Zap, color: 'text-accent-600', bg: 'bg-accent-50', label: 'Action' },
  result: { icon: CheckCircle, color: 'text-success-600', bg: 'bg-success-50', label: 'Result' },
}

// 税费置信度颜色 - Light theme
function getTaxConfidenceColor(confidence: TaxEstimate['confidence']) {
  switch (confidence) {
    case 'high': return 'text-success-600'
    case 'medium': return 'text-warning-600'
    case 'low': return 'text-danger-600'
  }
}

// 合规风险图标
function getComplianceIcon(type: ComplianceRisk['type']) {
  switch (type) {
    case 'battery': return '🔋'
    case 'liquid': return '💧'
    case 'magnet': return '🧲'
    case 'food': return '🍔'
    case 'medical': return '💊'
    case 'trademark': return '™️'
    default: return '⚠️'
  }
}

// 思考步骤组件 - Light theme
function ThinkingStepItem({ step, isLatest }: { step: ThinkingStep; isLatest: boolean }) {
  const config = thinkingTypeConfig[step.type]
  const Icon = config.icon
  
  return (
    <div className={cn(
      "flex items-start gap-3 py-2.5 px-3 rounded-xl transition-all duration-300 border",
      isLatest && "animate-slide-in",
      config.bg,
      "border-transparent"
    )}>
      <div className={cn("mt-0.5", config.color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm font-medium", config.color)}>{step.text}</span>
      </div>
      <Badge variant="default" className="text-xs">
        {config.label}
      </Badge>
    </div>
  )
}

// 工具调用组件 - Light theme
function ToolCallItem({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <div className="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-surface-50 transition-colors"
      >
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center",
          tool.status === 'success' ? "bg-success-100" : 
          tool.status === 'running' ? "bg-primary-100" : "bg-surface-100"
        )}>
          {tool.status === 'running' ? (
            <Loader2 className="w-3.5 h-3.5 text-primary-600 animate-spin" />
          ) : tool.status === 'success' ? (
            <CheckCircle className="w-3.5 h-3.5 text-success-600" />
          ) : (
            <Terminal className="w-3.5 h-3.5 text-surface-500" />
          )}
        </div>
        <code className="text-sm text-primary-600 font-mono flex-1 text-left truncate">
          {tool.name}
        </code>
        {tool.duration > 0 && (
          <span className="text-xs text-surface-400 font-medium">{tool.duration}ms</span>
        )}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-surface-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-surface-400" />
        )}
      </button>
      
      {expanded && (
        <div className="border-t border-surface-100 p-3 space-y-3 animate-expand bg-surface-50">
          <div>
            <span className="text-xs text-surface-500 font-medium block mb-1.5">Input:</span>
            <pre className="text-xs text-surface-700 bg-white p-2.5 rounded-lg overflow-x-auto font-mono border border-surface-200">
              {tool.input}
            </pre>
          </div>
          {tool.output && (
            <div>
              <span className="text-xs text-surface-500 font-medium block mb-1.5">Output:</span>
              <pre className="text-xs text-success-700 bg-success-50 p-2.5 rounded-lg overflow-x-auto font-mono border border-success-100">
                {tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Agent 步骤详情组件 - Light theme
function AgentStepDetail({ step, isActive }: { step: AgentStep; isActive: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (scrollRef.current && isActive) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [step.thinkingSteps.length, isActive])
  
  if (step.status === 'pending') return null
  
  return (
    <div className="mt-4 space-y-4 animate-fade-in">
      {/* 思考过程 */}
      {step.thinkingSteps.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-surface-500 font-medium">
            <Brain className="w-4 h-4" />
            <span>LLM Reasoning ({step.thinkingSteps.length} steps)</span>
          </div>
          <div 
            ref={scrollRef}
            className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin"
          >
            {step.thinkingSteps.map((thinking, idx) => (
              <ThinkingStepItem 
                key={thinking.id} 
                step={thinking} 
                isLatest={idx === step.thinkingSteps.length - 1 && isActive}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* 工具调用 */}
      {step.toolCalls.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-surface-500 font-medium">
            <Wrench className="w-4 h-4" />
            <span>Tool Calls ({step.toolCalls.length})</span>
          </div>
          <div className="space-y-2">
            {step.toolCalls.map((tool) => (
              <ToolCallItem key={tool.id} tool={tool} />
            ))}
          </div>
        </div>
      )}
      
      {/* 步骤统计 */}
      {step.status === 'completed' && (
        <div className="flex items-center gap-4 text-xs text-surface-400 pt-3 border-t border-surface-100">
          {step.tokenUsed && (
            <span className="flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              ~{step.tokenUsed} tokens
            </span>
          )}
          {step.duration && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {(step.duration / 1000).toFixed(1)}s
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Terminal className="w-3 h-3" />
            {step.toolCalls.length} tool calls
          </span>
        </div>
      )}
    </div>
  )
}

// 状态机进度条 - Light theme
function StateMachineProgress({ currentState }: { currentState: OrderState }) {
  const { step } = STATE_LABELS[currentState]
  const progress = (step / 10) * 100
  
  return (
    <div className="mb-6 p-4 bg-white rounded-2xl border border-surface-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-surface-600">Order State Machine</span>
        </div>
        <Badge variant={step >= 8 ? 'success' : 'info'}>
          {STATE_LABELS[currentState].label}
        </Badge>
      </div>
      <Progress value={progress} />
      <div className="flex justify-between mt-2 text-xs text-surface-400 font-medium">
        <span>IDLE</span>
        <span>DRAFT_ORDER</span>
        <span>PAID</span>
      </div>
    </div>
  )
}

// 实时统计面板 - Light theme
function LiveStats({ tokens, toolCalls, isProcessing }: { tokens: number; toolCalls: number; isProcessing: boolean }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-surface-200 shadow-sm mb-6">
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-2.5 h-2.5 rounded-full",
          isProcessing ? "bg-success-500 animate-pulse" : "bg-surface-300"
        )} />
        <span className="text-sm font-medium text-surface-600">
          {isProcessing ? 'Processing...' : 'Idle'}
        </span>
      </div>
      <div className="h-5 w-px bg-surface-200" />
      <div className="flex items-center gap-2 text-sm">
        <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
          <Activity className="w-3.5 h-3.5 text-primary-600" />
        </div>
        <span className="text-surface-700 font-semibold">{tokens}</span>
        <span className="text-surface-400">tokens</span>
      </div>
      <div className="h-5 w-px bg-surface-200" />
      <div className="flex items-center gap-2 text-sm">
        <div className="w-7 h-7 rounded-lg bg-accent-100 flex items-center justify-center">
          <Terminal className="w-3.5 h-3.5 text-accent-600" />
        </div>
        <span className="text-surface-700 font-semibold">{toolCalls}</span>
        <span className="text-surface-400">tool calls</span>
      </div>
    </div>
  )
}

// 对比表格组件
type Plan = ReturnType<typeof useShoppingStore.getState>['plans'][0]
function ComparisonTable({ plans, onSelectPlan }: { plans: Plan[]; onSelectPlan: (plan: Plan) => void }) {
  const [sortKey, setSortKey] = useState<'total' | 'price' | 'shipping' | 'delivery'>('total')
  const [sortAsc, setSortAsc] = useState(true)
  
  const sortedPlans = [...plans].sort((a, b) => {
    let aVal: number, bVal: number
    switch (sortKey) {
      case 'total': aVal = a.total; bVal = b.total; break
      case 'price': aVal = a.product.price; bVal = b.product.price; break
      case 'shipping': aVal = a.shipping; bVal = b.shipping; break
      case 'delivery': 
        aVal = parseInt(a.deliveryDays.split('-')[0])
        bVal = parseInt(b.deliveryDays.split('-')[0])
        break
      default: aVal = a.total; bVal = b.total
    }
    return sortAsc ? aVal - bVal : bVal - aVal
  })
  
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }
  
  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: typeof sortKey }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className={cn(
        "flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide transition-colors",
        sortKey === sortKeyName ? "text-primary-600" : "text-surface-500 hover:text-surface-700"
      )}
    >
      {label}
      <ArrowUpDown className={cn("w-3.5 h-3.5", sortKey === sortKeyName && "text-primary-500")} />
    </button>
  )
  
  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 p-4 bg-surface-50 border-b border-surface-200">
        <div className="col-span-4 flex items-center gap-2">
          <span className="font-semibold text-xs uppercase tracking-wide text-surface-500">Product</span>
        </div>
        <div className="col-span-2 flex justify-center">
          <SortHeader label="Price" sortKeyName="price" />
        </div>
        <div className="col-span-2 flex justify-center">
          <SortHeader label="Shipping" sortKeyName="shipping" />
        </div>
        <div className="col-span-1 flex justify-center">
          <span className="font-semibold text-xs uppercase tracking-wide text-surface-500">Tax</span>
        </div>
        <div className="col-span-1 flex justify-center">
          <SortHeader label="Delivery" sortKeyName="delivery" />
        </div>
        <div className="col-span-2 flex justify-center">
          <SortHeader label="Total" sortKeyName="total" />
        </div>
      </div>
      
      {/* Table Body */}
      <div className="divide-y divide-surface-100">
        {sortedPlans.map((plan, idx) => (
          <div 
            key={plan.name + idx}
            onClick={() => onSelectPlan(plan)}
            className={cn(
              "grid grid-cols-12 gap-4 p-4 cursor-pointer transition-all hover:bg-primary-50/50 group",
              plan.recommended && "bg-primary-50/30"
            )}
          >
            {/* Product Info */}
            <div className="col-span-4 flex items-center gap-3">
              <div className="text-2xl">{plan.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-surface-800 truncate">{plan.name}</span>
                  {plan.recommended && (
                    <Star className="w-4 h-4 text-warning-500 fill-warning-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-sm text-surface-500 truncate">{plan.product.title}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant={
                    plan.type === 'cheapest' ? 'success' :
                    plan.type === 'fastest' ? 'info' : 'warning'
                  } className="text-[10px]">
                    {plan.type.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-surface-400">★ {plan.product.rating}</span>
                </div>
              </div>
            </div>
            
            {/* Price */}
            <div className="col-span-2 flex items-center justify-center">
              <span className="font-bold text-surface-800">${plan.product.price}</span>
            </div>
            
            {/* Shipping */}
            <div className="col-span-2 flex items-center justify-center">
              <div className="text-center">
                <span className={cn(
                  "font-semibold",
                  plan.shipping === 0 ? "text-success-600" : "text-surface-700"
                )}>
                  {plan.shipping === 0 ? 'FREE' : `$${plan.shipping}`}
                </span>
              </div>
            </div>
            
            {/* Tax */}
            <div className="col-span-1 flex items-center justify-center">
              <div className="text-center">
                <span className={cn("font-medium text-sm", getTaxConfidenceColor(plan.tax.confidence))}>
                  ${plan.tax.amount}
                </span>
              </div>
            </div>
            
            {/* Delivery */}
            <div className="col-span-1 flex items-center justify-center">
              <div className="text-center">
                <span className="font-medium text-surface-700 text-sm">{plan.deliveryDays}</span>
                <span className="text-xs text-surface-400 block">days</span>
              </div>
            </div>
            
            {/* Total */}
            <div className="col-span-2 flex items-center justify-center gap-2">
              <span className="font-bold text-lg text-surface-800">${plan.total}</span>
              <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-primary-500 transition-colors" />
            </div>
          </div>
        ))}
      </div>
      
      {/* Table Footer - Summary */}
      <div className="p-4 bg-surface-50 border-t border-surface-200">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-surface-500">
              <span className="font-semibold text-surface-700">{plans.length}</span> plans available
            </span>
            <span className="text-surface-300">|</span>
            <span className="text-surface-500">
              Price range: <span className="font-semibold text-surface-700">${Math.min(...plans.map(p => p.total))} - ${Math.max(...plans.map(p => p.total))}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-warning-500 fill-warning-500" />
            <span className="text-surface-500">= AI Recommended</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const store = useShoppingStore()
  const [currentView, setCurrentView] = useState<'input' | 'processing' | 'plans' | 'confirmation'>('input')
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  // 根据状态切换视图
  useEffect(() => {
    if (store.orderState === 'IDLE') {
      setCurrentView('input')
    } else if (store.orderState === 'DRAFT_ORDER_CREATED' || store.orderState === 'WAIT_USER_PAYMENT_CONFIRMATION') {
      setCurrentView('confirmation')
    } else if (store.plans.length > 0 && store.orderState === 'TOTAL_COMPUTED') {
      setCurrentView('plans')
    } else {
      setCurrentView('processing')
    }
  }, [store.orderState, store.plans.length])

  // 自动展开当前运行的步骤
  useEffect(() => {
    if (store.currentStepIndex >= 0) {
      setExpandedStep(store.currentStepIndex)
    }
  }, [store.currentStepIndex])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store.query.trim()) return
    setCurrentView('processing')
    await store.startAgentProcess()
    setCurrentView('plans')
  }

  const handleSelectPlan = (plan: typeof store.plans[0]) => {
    store.selectPlan(plan)
    setCurrentView('confirmation')
  }

  const handleReset = () => {
    store.reset()
    setCurrentView('input')
    setExpandedStep(null)
  }

  const toggleStepExpansion = (index: number) => {
    setExpandedStep(expandedStep === index ? null : index)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-surface-50 via-white to-surface-100">
      {/* Background patterns */}
      <div className="fixed inset-0 gradient-mesh pointer-events-none" />
      <div className="fixed inset-0 circuit-pattern pointer-events-none" />

      {/* Header - Light tech theme */}
      <header className="relative border-b border-surface-200 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">AI Shopping Agent</h1>
              <p className="text-xs text-surface-500 font-medium">Shopping like prompting!</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-surface-100 rounded-xl text-sm border border-surface-200">
              <Cpu className="w-4 h-4 text-surface-500" />
              <span className="text-primary-600 font-mono font-medium">GPT-4o-mini</span>
            </div>
            <div className="flex items-center gap-2 text-surface-500 text-sm font-medium">
              <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-accent-600" />
              </div>
              <span>Multi-Agent</span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative max-w-4xl mx-auto px-4 py-8 pb-28">
        {/* State Machine Progress */}
        {currentView !== 'input' && (
          <StateMachineProgress currentState={store.orderState} />
        )}

        {/* Live Stats */}
        {currentView === 'processing' && (
          <LiveStats 
            tokens={store.totalTokens} 
            toolCalls={store.totalToolCalls}
            isProcessing={store.isStreaming}
          />
        )}

        {/* Input View - Light theme */}
        {currentView === 'input' && (
          <div className="animate-fade-in">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 mb-6 shadow-tech animate-float">
                <ShoppingCart className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-4xl font-bold text-surface-800 mb-4">
                What would you like to buy?
              </h2>
              <p className="text-surface-500 text-lg max-w-xl mx-auto">
                Describe your shopping needs and watch our AI agents work in real-time.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <div className="relative">
                <textarea
                  value={store.query}
                  onChange={(e) => store.setQuery(e.target.value)}
                  placeholder="e.g., I need a wireless charger for my iPhone 15, budget around $50, shipping to Germany..."
                  className="w-full h-36 px-6 py-5 bg-white border border-surface-200 rounded-2xl text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 resize-none shadow-sm transition-all"
                />
                <button
                  type="submit"
                  disabled={!store.query.trim()}
                  className="absolute bottom-4 right-4 px-6 py-2.5 bg-gradient-to-r from-primary-500 to-accent-500 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-primary-600 hover:to-accent-600 transition-all flex items-center gap-2 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
                >
                  <Send className="w-4 h-4" />
                  Find Products
                </button>
              </div>
            </form>

            {/* Example queries - Light theme */}
            <div className="mt-8">
              <p className="text-surface-500 text-sm mb-3 font-medium">Try these examples:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Wireless charger for iPhone, $50 budget, ship to Germany',
                  'Power bank 10000mAh, fast charging, under $40',
                  'USB-C hub for MacBook, good brand, ship to UK',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => store.setQuery(example)}
                    className="px-4 py-2.5 bg-white hover:bg-surface-50 border border-surface-200 rounded-xl text-surface-600 text-sm transition-all hover:border-primary-300 hover:text-primary-600 hover:shadow-sm"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Processing View - Light theme */}
        {currentView === 'processing' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-surface-800 mb-2">Processing your request...</h2>
              <p className="text-surface-500">&quot;{store.query}&quot;</p>
            </div>

            {/* Parsed Mission - Light theme */}
            {store.mission && (
              <div className="mb-6 p-5 bg-white rounded-2xl border border-surface-200 shadow-sm">
                <h3 className="text-surface-700 text-sm font-semibold mb-3">Parsed Mission</h3>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Badge variant="info">🌍 {store.mission.destination_country}</Badge>
                  <Badge variant="success">💰 ${store.mission.budget_amount}</Badge>
                  {store.mission.hard_constraints.map((c) => (
                    <Badge key={c.value} variant="default">{c.value}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Current thinking step - Light theme */}
            {store.currentThinkingStep && (
              <div className="mb-6 p-4 bg-primary-50 border border-primary-100 rounded-2xl animate-pulse-slow">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                    <Brain className="w-4 h-4 text-primary-600 animate-bounce-slow" />
                  </div>
                  <span className="text-primary-700 font-medium">{store.currentThinkingStep}</span>
                </div>
              </div>
            )}

            {/* Agent Progress - Light theme */}
            <div className="space-y-4">
              {store.agentSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-2xl border transition-all duration-500 overflow-hidden bg-white shadow-sm",
                    step.status === 'completed' && "border-success-200 bg-success-50/30",
                    step.status === 'running' && "border-primary-300 ring-2 ring-primary-100 shadow-lg",
                    step.status === 'pending' && "border-surface-200 opacity-60"
                  )}
                >
                  <button
                    onClick={() => step.status !== 'pending' && toggleStepExpansion(index)}
                    className="w-full p-5 flex items-center gap-4"
                    disabled={step.status === 'pending'}
                  >
                    <div className="text-3xl">{step.icon}</div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <h3 className="text-surface-800 font-semibold">{step.name}</h3>
                        {step.status === 'completed' && step.tokenUsed && (
                          <span className="text-xs text-surface-400">~{step.tokenUsed} tokens</span>
                        )}
                      </div>
                      <p className="text-surface-500 text-sm">{step.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {step.status === 'completed' ? (
                        <div className="w-8 h-8 rounded-full bg-success-100 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-success-600" />
                        </div>
                      ) : step.status === 'running' ? (
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full border-2 border-surface-300" />
                      )}
                      {step.status !== 'pending' && (
                        expandedStep === index ? (
                          <ChevronUp className="w-5 h-5 text-surface-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-surface-400" />
                        )
                      )}
                    </div>
                  </button>
                  
                  {/* Expanded details */}
                  {expandedStep === index && (
                    <div className="px-5 pb-5">
                      <AgentStepDetail step={step} isActive={step.status === 'running'} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plans View - Light theme */}
        {currentView === 'plans' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-surface-800 mb-2">Choose Your Plan</h2>
              <p className="text-surface-500">We found {store.plans.length} options for you</p>
            </div>

            {/* AI Recommendation Card - Light theme */}
            {store.aiRecommendation && (
              <div className="mb-6 p-5 bg-gradient-to-r from-primary-50 to-accent-50 border border-primary-100 rounded-2xl shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary-500/20">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-primary-700 font-bold">AI Recommendation</span>
                      <Badge variant="default">{store.aiRecommendation.model}</Badge>
                      <Badge variant="success">
                        {Math.round(store.aiRecommendation.confidence * 100)}% confidence
                      </Badge>
                    </div>
                    <p className="text-surface-600 text-sm">{store.aiRecommendation.reason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Stats & View Toggle */}
            <div className="mb-6 p-4 bg-white rounded-2xl border border-surface-200 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5 text-primary-600" />
                  </div>
                  <span className="text-surface-700 font-semibold">{store.totalTokens}</span>
                  <span className="text-surface-400">tokens</span>
                </div>
                <div className="h-5 w-px bg-surface-200" />
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-accent-100 flex items-center justify-center">
                    <Terminal className="w-3.5 h-3.5 text-accent-600" />
                  </div>
                  <span className="text-surface-700 font-semibold">{store.totalToolCalls}</span>
                  <span className="text-surface-400">tools</span>
                </div>
                <div className="h-5 w-px bg-surface-200" />
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-success-100 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-success-600" />
                  </div>
                  <span className="text-surface-700 font-semibold">{store.plans.length}</span>
                  <span className="text-surface-400">plans</span>
                </div>
              </div>
              
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-xl">
                <button
                  onClick={() => setViewMode('cards')}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    viewMode === 'cards' 
                      ? "bg-white text-primary-600 shadow-sm" 
                      : "text-surface-500 hover:text-surface-700"
                  )}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    viewMode === 'table' 
                      ? "bg-white text-primary-600 shadow-sm" 
                      : "text-surface-500 hover:text-surface-700"
                  )}
                >
                  <Table2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Compare</span>
                </button>
              </div>
            </div>

            {/* Comparison Table View */}
            {viewMode === 'table' && (
              <div className="mb-6">
                <ComparisonTable plans={store.plans} onSelectPlan={handleSelectPlan} />
              </div>
            )}

            {/* Cards View */}
            {viewMode === 'cards' && (
            <div className="grid gap-4">
              {store.plans.map((plan) => (
                <div
                  key={plan.name}
                  onClick={() => handleSelectPlan(plan)}
                  className={cn(
                    "p-6 bg-white hover:bg-surface-50 border rounded-2xl cursor-pointer transition-all group relative shadow-sm hover:shadow-lg",
                    plan.recommended 
                      ? "border-primary-300 ring-2 ring-primary-100" 
                      : "border-surface-200 hover:border-primary-200"
                  )}
                >
                  {plan.recommended && (
                    <div className="absolute -top-3 left-4 px-3 py-1.5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full text-xs text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-primary-500/20">
                      <Sparkles className="w-3 h-3" />
                      AI Recommended
                    </div>
                  )}
                  
                  <div className="flex items-start gap-5">
                    <div className="text-4xl">{plan.emoji}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="text-xl font-bold text-surface-800">{plan.name}</h3>
                        <Badge variant={
                          plan.type === 'cheapest' ? 'success' :
                          plan.type === 'fastest' ? 'info' : 'warning'
                        }>
                          {plan.type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-surface-700 font-medium mb-2">{plan.product.title}</p>
                      <p className="text-surface-500 text-sm mb-3">{plan.reason}</p>
                      
                      {/* Tax Confidence */}
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-1.5">
                          <Receipt className="w-4 h-4 text-surface-400" />
                          <span className="text-sm text-surface-500">Tax:</span>
                          <span className={cn("text-sm font-semibold", getTaxConfidenceColor(plan.tax.confidence))}>
                            ${plan.tax.amount} ({plan.tax.confidence})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-surface-400" />
                          <span className="text-sm text-surface-500">{plan.deliveryDays} days</span>
                        </div>
                      </div>

                      {/* Compliance Risks */}
                      {plan.product.complianceRisks.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {plan.product.complianceRisks.map((risk, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-warning-50 border border-warning-200 rounded-lg text-xs">
                              <span>{getComplianceIcon(risk.type)}</span>
                              <span className="text-warning-700 font-medium">{risk.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-surface-100">
                        <div>
                          <span className="text-surface-400 block text-xs font-medium mb-1">Product</span>
                          <span className="text-surface-800 font-bold">${plan.product.price}</span>
                        </div>
                        <div>
                          <span className="text-surface-400 block text-xs font-medium mb-1">Shipping</span>
                          <span className="text-surface-800 font-bold">{plan.shipping === 0 ? 'FREE' : `$${plan.shipping}`}</span>
                        </div>
                        <div>
                          <span className="text-surface-400 block text-xs font-medium mb-1">Tax Est.</span>
                          <span className={cn("font-bold", getTaxConfidenceColor(plan.tax.confidence))}>
                            ${plan.tax.amount}
                          </span>
                        </div>
                        <div>
                          <span className="text-surface-400 block text-xs font-medium mb-1">Delivery</span>
                          <span className="text-surface-800 font-bold">{plan.deliveryDays} days</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-surface-400 text-xs font-medium block">Total</span>
                      <span className="text-3xl font-bold text-surface-800">${plan.total}</span>
                      <ChevronRight className="w-5 h-5 text-surface-300 ml-auto mt-2 group-hover:text-primary-500 transition-colors" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}

            <button
              onClick={handleReset}
              className="mt-6 w-full py-3.5 border border-surface-200 text-surface-500 rounded-xl hover:bg-surface-50 hover:text-surface-700 transition-all font-medium"
            >
              Start Over
            </button>
          </div>
        )}

        {/* Confirmation View - Light theme */}
        {currentView === 'confirmation' && store.draftOrder && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-success-100 mb-4">
                <Package className="w-8 h-8 text-success-600" />
              </div>
              <h2 className="text-2xl font-bold text-surface-800 mb-2">Draft Order Created!</h2>
              <p className="text-surface-500">Review and confirm before proceeding to payment</p>
            </div>

            <div className="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Order Header */}
              <div className="p-6 border-b border-surface-100 bg-surface-50">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-surface-400 text-xs font-medium">Order ID</span>
                    <p className="text-surface-800 font-mono font-semibold">{store.draftOrder.id}</p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-warning-50 border border-warning-200 rounded-lg">
                    <Clock className="w-4 h-4 text-warning-600" />
                    <span className="text-warning-700 text-sm font-medium">
                      Expires: {new Date(store.draftOrder.expiresAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-6 border-b border-surface-100">
                <div className="flex items-center gap-5">
                  <div className="text-5xl">{store.draftOrder.plan.product.image}</div>
                  <div className="flex-1">
                    <h3 className="text-surface-800 font-semibold text-lg">{store.draftOrder.plan.product.title}</h3>
                    <p className="text-surface-500 text-sm">
                      {store.draftOrder.plan.product.brand} · ★ {store.draftOrder.plan.product.rating}
                    </p>
                  </div>
                  <div className="text-surface-800 font-bold text-xl">${store.draftOrder.plan.product.price}</div>
                </div>
              </div>

              {/* Tax Breakdown */}
              <div className="p-6 border-b border-surface-100">
                <h4 className="text-surface-800 font-semibold mb-4 flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Tax & Duty Estimate
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-surface-500">VAT/GST</span>
                    <span className="text-surface-700 font-medium">${store.draftOrder.plan.tax.breakdown.vat}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Import Duty</span>
                    <span className="text-surface-700 font-medium">${store.draftOrder.plan.tax.breakdown.duty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Handling Fee</span>
                    <span className="text-surface-700 font-medium">${store.draftOrder.plan.tax.breakdown.handling}</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t border-surface-100">
                    <span className="text-surface-700 font-medium">Total Tax Estimate</span>
                    <div className="flex items-center gap-2">
                      <span className="text-surface-800 font-bold">${store.draftOrder.plan.tax.amount}</span>
                      <Badge variant={
                        store.draftOrder.plan.tax.confidence === 'high' ? 'success' :
                        store.draftOrder.plan.tax.confidence === 'medium' ? 'warning' : 'danger'
                      }>
                        {store.draftOrder.plan.tax.confidence}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Compliance Risks */}
              {store.draftOrder.plan.product.complianceRisks.length > 0 && (
                <div className="p-6 border-b border-surface-100 bg-warning-50/50">
                  <h4 className="text-surface-800 font-semibold mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-warning-600" />
                    Compliance Information
                  </h4>
                  <div className="space-y-3">
                    {store.draftOrder.plan.product.complianceRisks.map((risk, i) => (
                      <div key={i} className="flex items-start gap-3 p-4 bg-white rounded-xl border border-warning-200">
                        <span className="text-2xl">{getComplianceIcon(risk.type)}</span>
                        <div>
                          <p className="text-warning-700 font-semibold capitalize">{risk.type} Warning</p>
                          <p className="text-surface-600 text-sm">{risk.message}</p>
                          {risk.mitigation && (
                            <p className="text-success-600 text-sm mt-1 font-medium">✓ {risk.mitigation}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Order Summary */}
              <div className="p-6 space-y-3 border-b border-surface-100">
                <div className="flex justify-between text-surface-500">
                  <span>Subtotal</span>
                  <span className="font-medium">${store.draftOrder.plan.product.price}</span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span>Shipping</span>
                  <span className="font-medium">{store.draftOrder.plan.shipping === 0 ? 'FREE' : `$${store.draftOrder.plan.shipping}`}</span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span>Tax & Duty</span>
                  <span className="font-medium">${store.draftOrder.plan.tax.amount}</span>
                </div>
                <div className="h-px bg-surface-200 my-4" />
                <div className="flex justify-between text-xl font-bold text-surface-800">
                  <span>Total</span>
                  <span>${store.draftOrder.plan.total}</span>
                </div>
              </div>

              {/* Confirmation Items */}
              <div className="p-6 border-b border-surface-100">
                <h4 className="text-surface-800 font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary-500" />
                  Required Confirmations
                </h4>
                <div className="space-y-4">
                  {store.draftOrder.confirmationItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={cn(
                        "flex items-start gap-4 p-4 rounded-xl border transition-all",
                        item.checked 
                          ? "bg-success-50 border-success-200" 
                          : "bg-white border-surface-200"
                      )}
                    >
                      <Checkbox
                        id={item.id}
                        checked={item.checked}
                        onCheckedChange={() => store.toggleConfirmation(item.id)}
                      />
                      <div className="flex-1">
                        <label 
                          htmlFor={item.id} 
                          className="text-surface-800 font-medium cursor-pointer flex items-center gap-2"
                        >
                          {item.title}
                          {item.required && <span className="text-danger-500 text-xs font-semibold">*Required</span>}
                        </label>
                        <p className="text-surface-500 text-sm mt-1">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence */}
              <div className="p-4 bg-surface-50">
                <div className="flex items-center gap-2 text-surface-400 text-sm">
                  <Info className="w-4 h-4" />
                  <span>Evidence: <code className="text-primary-600 font-mono">{store.draftOrder.evidenceSnapshotId}</code></span>
                </div>
              </div>
            </div>

            {/* Important Notice */}
            <div className="mt-6 p-5 bg-warning-50 border border-warning-200 rounded-2xl">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-warning-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-warning-600" />
                </div>
                <div>
                  <p className="text-warning-800 font-semibold">Payment Not Captured</p>
                  <p className="text-warning-700 text-sm mt-1">
                    Check all required boxes to proceed to payment.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-4">
              <button
                onClick={handleReset}
                className="flex-1 py-3.5 border border-surface-200 text-surface-500 rounded-xl hover:bg-surface-50 hover:text-surface-700 transition-all font-medium"
              >
                Start New Search
              </button>
              <button
                disabled={!store.canProceedToPayment()}
                className={cn(
                  "flex-1 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all",
                  store.canProceedToPayment()
                    ? "bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-600 hover:to-accent-600 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5"
                    : "bg-surface-100 text-surface-400 cursor-not-allowed"
                )}
              >
                <ShoppingCart className="w-5 h-5" />
                Proceed to Payment
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Light theme */}
      <footer className="fixed bottom-0 left-0 right-0 py-4 border-t border-surface-200 bg-white/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between text-surface-400 text-sm">
          <span className="font-medium">Multi-AI-Agent4OnlineShopping © 2024</span>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary-100 flex items-center justify-center">
                <Zap className="w-3 h-3 text-primary-600" />
              </div>
              <span className="text-surface-500 font-medium">GPT-4o-mini via Poe</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-success-500 animate-pulse" />
              <span className="font-medium">All agents operational</span>
            </span>
          </div>
        </div>
      </footer>
    </main>
  )
}
