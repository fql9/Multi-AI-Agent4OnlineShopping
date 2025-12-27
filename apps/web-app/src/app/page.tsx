'use client'

import { useEffect, useState, useRef } from 'react'
import { 
  ShoppingCart, Bot, Package, CheckCircle, Loader2, Send, 
  Sparkles, AlertTriangle, Info, Shield, Truck, Receipt,
  ChevronRight, Clock, Zap, Terminal, Brain, Wrench,
  ChevronDown, ChevronUp, Code, Activity
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

// 思考类型图标和颜色
const thinkingTypeConfig = {
  thinking: { icon: Brain, color: 'text-sky-400', bg: 'bg-sky-500/10', label: 'Thinking' },
  decision: { icon: Sparkles, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Decision' },
  action: { icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Action' },
  result: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Result' },
}

// 税费置信度颜色
function getTaxConfidenceColor(confidence: TaxEstimate['confidence']) {
  switch (confidence) {
    case 'high': return 'text-emerald-400'
    case 'medium': return 'text-amber-400'
    case 'low': return 'text-red-400'
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

// 思考步骤组件
function ThinkingStepItem({ step, isLatest }: { step: ThinkingStep; isLatest: boolean }) {
  const config = thinkingTypeConfig[step.type]
  const Icon = config.icon
  
  return (
    <div className={cn(
      "flex items-start gap-3 py-2 px-3 rounded-lg transition-all duration-300",
      isLatest && "animate-slide-in",
      config.bg
    )}>
      <div className={cn("mt-0.5", config.color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <span className={cn("text-sm", config.color)}>{step.text}</span>
      </div>
      <Badge variant="default" className="text-xs opacity-60">
        {config.label}
      </Badge>
    </div>
  )
}

// 工具调用组件
function ToolCallItem({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className={cn(
          "w-6 h-6 rounded flex items-center justify-center",
          tool.status === 'success' ? "bg-emerald-500/20" : 
          tool.status === 'running' ? "bg-sky-500/20" : "bg-slate-700"
        )}>
          {tool.status === 'running' ? (
            <Loader2 className="w-3 h-3 text-sky-400 animate-spin" />
          ) : tool.status === 'success' ? (
            <CheckCircle className="w-3 h-3 text-emerald-400" />
          ) : (
            <Terminal className="w-3 h-3 text-slate-400" />
          )}
        </div>
        <code className="text-sm text-emerald-400 font-mono flex-1 text-left truncate">
          {tool.name}
        </code>
        {tool.duration > 0 && (
          <span className="text-xs text-slate-500">{tool.duration}ms</span>
        )}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {expanded && (
        <div className="border-t border-slate-700 p-3 space-y-3 animate-expand">
          <div>
            <span className="text-xs text-slate-500 block mb-1">Input:</span>
            <pre className="text-xs text-slate-300 bg-slate-800 p-2 rounded overflow-x-auto font-mono">
              {tool.input}
            </pre>
          </div>
          {tool.output && (
            <div>
              <span className="text-xs text-slate-500 block mb-1">Output:</span>
              <pre className="text-xs text-emerald-300 bg-slate-800 p-2 rounded overflow-x-auto font-mono">
                {tool.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Agent 步骤详情组件
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
          <div className="flex items-center gap-2 text-sm text-slate-400">
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
          <div className="flex items-center gap-2 text-sm text-slate-400">
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
        <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-700/50">
          {step.tokenUsed && (
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              ~{step.tokenUsed} tokens
            </span>
          )}
          {step.duration && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {(step.duration / 1000).toFixed(1)}s
            </span>
          )}
          <span className="flex items-center gap-1">
            <Terminal className="w-3 h-3" />
            {step.toolCalls.length} tool calls
          </span>
        </div>
      )}
    </div>
  )
}

// 状态机进度条
function StateMachineProgress({ currentState }: { currentState: OrderState }) {
  const { step } = STATE_LABELS[currentState]
  const progress = (step / 10) * 100
  
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">Order State Machine</span>
        <Badge variant={step >= 8 ? 'success' : 'default'}>
          {STATE_LABELS[currentState].label}
        </Badge>
      </div>
      <Progress value={progress} />
      <div className="flex justify-between mt-1 text-xs text-slate-500">
        <span>IDLE</span>
        <span>DRAFT_ORDER</span>
        <span>PAID</span>
      </div>
    </div>
  )
}

// 实时统计面板
function LiveStats({ tokens, toolCalls, isProcessing }: { tokens: number; toolCalls: number; isProcessing: boolean }) {
  return (
    <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700 mb-6">
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-2 h-2 rounded-full",
          isProcessing ? "bg-emerald-500 animate-pulse" : "bg-slate-500"
        )} />
        <span className="text-sm text-slate-400">
          {isProcessing ? 'Processing...' : 'Idle'}
        </span>
      </div>
      <div className="h-4 w-px bg-slate-700" />
      <div className="flex items-center gap-2 text-sm">
        <Activity className="w-4 h-4 text-sky-400" />
        <span className="text-slate-300">{tokens}</span>
        <span className="text-slate-500">tokens</span>
      </div>
      <div className="h-4 w-px bg-slate-700" />
      <div className="flex items-center gap-2 text-sm">
        <Terminal className="w-4 h-4 text-emerald-400" />
        <span className="text-slate-300">{toolCalls}</span>
        <span className="text-slate-500">tool calls</span>
      </div>
    </div>
  )
}

export default function Home() {
  const store = useShoppingStore()
  const [currentView, setCurrentView] = useState<'input' | 'processing' | 'plans' | 'confirmation'>('input')
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  // 根据状态切换视图
  useEffect(() => {
    if (store.orderState === 'IDLE') {
      setCurrentView('input')
    } else if (store.orderState === 'DRAFT_ORDER_CREATED' || store.orderState === 'WAIT_USER_PAYMENT_CONFIRMATION') {
      setCurrentView('confirmation')
    } else if (store.plans.length > 0 && store.orderState === 'TOTAL_COMPUTED') {
      setCurrentView('plans')
    } else {
      // 其他状态（MISSION_READY, CANDIDATES_READY, VERIFIED_TOPN_READY 等）
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
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Geometric pattern background */}
      <div className="fixed inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Header */}
      <header className="relative border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI Shopping Agent</h1>
              <p className="text-xs text-slate-500">Shopping like prompting!</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg text-sm">
              <Code className="w-4 h-4 text-slate-400" />
              <span className="text-emerald-400 font-mono">GPT-4o-mini</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Multi-Agent</span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative max-w-4xl mx-auto px-4 py-8 pb-24">
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

        {/* Input View */}
        {currentView === 'input' && (
          <div className="animate-fade-in">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-white mb-4">
                What would you like to buy?
              </h2>
              <p className="text-slate-400 text-lg">
                Describe your shopping needs and watch our AI agents work in real-time.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <div className="relative">
                <textarea
                  value={store.query}
                  onChange={(e) => store.setQuery(e.target.value)}
                  placeholder="e.g., I need a wireless charger for my iPhone 15, budget around $50, shipping to Germany..."
                  className="w-full h-32 px-6 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none"
                />
                <button
                  type="submit"
                  disabled={!store.query.trim()}
                  className="absolute bottom-4 right-4 px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                  Find Products
                </button>
              </div>
            </form>

            {/* Example queries */}
            <div className="mt-8">
              <p className="text-slate-500 text-sm mb-3">Try these examples:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Wireless charger for iPhone, $50 budget, ship to Germany',
                  'Power bank 10000mAh, fast charging, under $40',
                  'USB-C hub for MacBook, good brand, ship to UK',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => store.setQuery(example)}
                    className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 rounded-lg text-slate-300 text-sm transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Processing View */}
        {currentView === 'processing' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Processing your request...</h2>
              <p className="text-slate-400">&quot;{store.query}&quot;</p>
            </div>

            {/* Parsed Mission */}
            {store.mission && (
              <div className="mb-6 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <h3 className="text-slate-300 text-sm font-medium mb-2">Parsed Mission</h3>
                <div className="flex flex-wrap gap-3 text-sm">
                  <Badge variant="info">🌍 {store.mission.destination_country}</Badge>
                  <Badge variant="success">💰 ${store.mission.budget_amount}</Badge>
                  {store.mission.hard_constraints.map((c) => (
                    <Badge key={c.value} variant="default">{c.value}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Current thinking step */}
            {store.currentThinkingStep && (
              <div className="mb-6 p-4 bg-sky-500/10 border border-sky-500/30 rounded-xl animate-pulse-slow">
                <div className="flex items-center gap-3">
                  <Brain className="w-5 h-5 text-sky-400 animate-bounce-slow" />
                  <span className="text-sky-300">{store.currentThinkingStep}</span>
                </div>
              </div>
            )}

            {/* Agent Progress */}
            <div className="space-y-4">
              {store.agentSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-xl border transition-all duration-500 overflow-hidden",
                    step.status === 'completed' && "bg-emerald-500/5 border-emerald-500/30",
                    step.status === 'running' && "bg-slate-800 border-sky-500/50 ring-1 ring-sky-500/20",
                    step.status === 'pending' && "bg-slate-800/30 border-slate-700/50 opacity-50"
                  )}
                >
                  <button
                    onClick={() => step.status !== 'pending' && toggleStepExpansion(index)}
                    className="w-full p-4 flex items-center gap-4"
                    disabled={step.status === 'pending'}
                  >
                    <div className="text-2xl">{step.icon}</div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-medium">{step.name}</h3>
                        {step.status === 'completed' && step.tokenUsed && (
                          <span className="text-xs text-slate-500">~{step.tokenUsed} tokens</span>
                        )}
                      </div>
                      <p className="text-slate-400 text-sm">{step.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {step.status === 'completed' ? (
                        <CheckCircle className="w-6 h-6 text-emerald-500" />
                      ) : step.status === 'running' ? (
                        <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-slate-600" />
                      )}
                      {step.status !== 'pending' && (
                        expandedStep === index ? (
                          <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        )
                      )}
                    </div>
                  </button>
                  
                  {/* Expanded details */}
                  {expandedStep === index && (
                    <div className="px-4 pb-4">
                      <AgentStepDetail step={step} isActive={step.status === 'running'} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plans View */}
        {currentView === 'plans' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h2>
              <p className="text-slate-400">We found {store.plans.length} options for you</p>
            </div>

            {/* AI Recommendation Card */}
            {store.aiRecommendation && (
              <div className="mb-6 p-4 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-emerald-400 font-semibold">AI Recommendation</span>
                      <Badge variant="default">{store.aiRecommendation.model}</Badge>
                      <Badge variant="success">
                        {Math.round(store.aiRecommendation.confidence * 100)}% confidence
                      </Badge>
                    </div>
                    <p className="text-slate-300 text-sm">{store.aiRecommendation.reason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Summary stats */}
            <div className="mb-6 p-3 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <span className="text-slate-300">{store.totalTokens}</span>
                <span className="text-slate-500">tokens used</span>
              </div>
              <div className="h-4 w-px bg-slate-700" />
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-300">{store.totalToolCalls}</span>
                <span className="text-slate-500">tool calls</span>
              </div>
            </div>

            <div className="grid gap-4">
              {store.plans.map((plan) => (
                <div
                  key={plan.name}
                  onClick={() => handleSelectPlan(plan)}
                  className={cn(
                    "p-6 bg-slate-800/50 hover:bg-slate-800 border rounded-2xl cursor-pointer transition-all group relative",
                    plan.recommended 
                      ? "border-emerald-500/50 ring-1 ring-emerald-500/30" 
                      : "border-slate-700 hover:border-emerald-500/50"
                  )}
                >
                  {plan.recommended && (
                    <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full text-xs text-white font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      AI Recommended
                    </div>
                  )}
                  
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{plan.emoji}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                        <Badge variant={
                          plan.type === 'cheapest' ? 'success' :
                          plan.type === 'fastest' ? 'info' : 'warning'
                        }>
                          {plan.type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-slate-300 mb-2">{plan.product.title}</p>
                      <p className="text-slate-500 text-sm mb-3">{plan.reason}</p>
                      
                      {/* Tax Confidence */}
                      <div className="flex items-center gap-4 mb-3">
                        <div className="flex items-center gap-1.5">
                          <Receipt className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-400">Tax:</span>
                          <span className={cn("text-sm font-medium", getTaxConfidenceColor(plan.tax.confidence))}>
                            ${plan.tax.amount} ({plan.tax.confidence})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-400">{plan.deliveryDays} days</span>
                        </div>
                      </div>

                      {/* Compliance Risks */}
                      {plan.product.complianceRisks.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {plan.product.complianceRisks.map((risk, i) => (
                            <div key={i} className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
                              <span>{getComplianceIcon(risk.type)}</span>
                              <span className="text-amber-400">{risk.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-4 gap-4 text-sm mt-4 pt-4 border-t border-slate-700">
                        <div>
                          <span className="text-slate-500 block">Product</span>
                          <span className="text-white font-medium">${plan.product.price}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Shipping</span>
                          <span className="text-white font-medium">{plan.shipping === 0 ? 'FREE' : `$${plan.shipping}`}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Tax Est.</span>
                          <span className={cn("font-medium", getTaxConfidenceColor(plan.tax.confidence))}>
                            ${plan.tax.amount}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Delivery</span>
                          <span className="text-white font-medium">{plan.deliveryDays} days</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 text-sm block">Total</span>
                      <span className="text-3xl font-bold text-white">${plan.total}</span>
                      <ChevronRight className="w-5 h-5 text-slate-400 ml-auto mt-2 group-hover:text-emerald-400 transition-colors" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleReset}
              className="mt-6 w-full py-3 border border-slate-700 text-slate-400 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Start Over
            </button>
          </div>
        )}

        {/* Confirmation View */}
        {currentView === 'confirmation' && store.draftOrder && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 mb-4">
                <Package className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Draft Order Created!</h2>
              <p className="text-slate-400">Review and confirm before proceeding to payment</p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
              {/* Order Header */}
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 text-sm">Order ID</span>
                    <p className="text-white font-mono">{store.draftOrder.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-400 text-sm">
                      Expires: {new Date(store.draftOrder.expiresAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center gap-4">
                  <div className="text-4xl">{store.draftOrder.plan.product.image}</div>
                  <div className="flex-1">
                    <h3 className="text-white font-medium">{store.draftOrder.plan.product.title}</h3>
                    <p className="text-slate-400 text-sm">
                      {store.draftOrder.plan.product.brand} · ★ {store.draftOrder.plan.product.rating}
                    </p>
                  </div>
                  <div className="text-white font-medium">${store.draftOrder.plan.product.price}</div>
                </div>
              </div>

              {/* Tax Breakdown */}
              <div className="p-6 border-b border-slate-700">
                <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Tax & Duty Estimate
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">VAT/GST</span>
                    <span className="text-white">${store.draftOrder.plan.tax.breakdown.vat}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Import Duty</span>
                    <span className="text-white">${store.draftOrder.plan.tax.breakdown.duty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Handling Fee</span>
                    <span className="text-white">${store.draftOrder.plan.tax.breakdown.handling}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-700">
                    <span className="text-slate-300">Total Tax Estimate</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">${store.draftOrder.plan.tax.amount}</span>
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
                <div className="p-6 border-b border-slate-700 bg-amber-500/5">
                  <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    Compliance Information
                  </h4>
                  <div className="space-y-3">
                    {store.draftOrder.plan.product.complianceRisks.map((risk, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
                        <span className="text-2xl">{getComplianceIcon(risk.type)}</span>
                        <div>
                          <p className="text-amber-400 font-medium capitalize">{risk.type} Warning</p>
                          <p className="text-slate-300 text-sm">{risk.message}</p>
                          {risk.mitigation && (
                            <p className="text-emerald-400 text-sm mt-1">✓ {risk.mitigation}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Order Summary */}
              <div className="p-6 space-y-3 border-b border-slate-700">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>${store.draftOrder.plan.product.price}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Shipping</span>
                  <span>{store.draftOrder.plan.shipping === 0 ? 'FREE' : `$${store.draftOrder.plan.shipping}`}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tax & Duty</span>
                  <span>${store.draftOrder.plan.tax.amount}</span>
                </div>
                <div className="h-px bg-slate-700 my-4" />
                <div className="flex justify-between text-xl font-bold text-white">
                  <span>Total</span>
                  <span>${store.draftOrder.plan.total}</span>
                </div>
              </div>

              {/* Confirmation Items */}
              <div className="p-6 border-b border-slate-700">
                <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Required Confirmations
                </h4>
                <div className="space-y-4">
                  {store.draftOrder.confirmationItems.map((item) => (
                    <div 
                      key={item.id} 
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-lg border transition-colors",
                        item.checked 
                          ? "bg-emerald-500/10 border-emerald-500/30" 
                          : "bg-slate-800/50 border-slate-700"
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
                          className="text-white font-medium cursor-pointer flex items-center gap-2"
                        >
                          {item.title}
                          {item.required && <span className="text-red-400 text-xs">*Required</span>}
                        </label>
                        <p className="text-slate-400 text-sm mt-1">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence */}
              <div className="p-4 bg-slate-900/50">
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Info className="w-4 h-4" />
                  <span>Evidence: <code className="text-emerald-400">{store.draftOrder.evidenceSnapshotId}</code></span>
                </div>
              </div>
            </div>

            {/* Important Notice */}
            <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-200 font-medium">Payment Not Captured</p>
                  <p className="text-amber-200/70 text-sm mt-1">
                    Check all required boxes to proceed to payment.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-4">
              <button
                onClick={handleReset}
                className="flex-1 py-3 border border-slate-700 text-slate-400 rounded-xl hover:bg-slate-800 transition-colors"
              >
                Start New Search
              </button>
              <button
                disabled={!store.canProceedToPayment()}
                className={cn(
                  "flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all",
                  store.canProceedToPayment()
                    ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/20"
                    : "bg-slate-700 text-slate-400 cursor-not-allowed"
                )}
              >
                <ShoppingCart className="w-5 h-5" />
                Proceed to Payment
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 py-4 border-t border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between text-slate-500 text-sm">
          <span>Multi-AI-Agent4OnlineShopping © 2024</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400">GPT-4o-mini via Poe</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              All agents operational
            </span>
          </div>
        </div>
      </footer>
    </main>
  )
}
