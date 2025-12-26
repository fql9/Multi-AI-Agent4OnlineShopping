'use client'

import { useState } from 'react'
import { ShoppingCart, Bot, Package, CheckCircle, Loader2, Send, Sparkles } from 'lucide-react'

// 模拟的 Agent 处理步骤
const DEMO_STEPS = [
  { 
    id: 'intent', 
    name: 'Intent Agent', 
    description: 'Parsing your shopping request...',
    icon: '🎯',
  },
  { 
    id: 'candidate', 
    name: 'Candidate Agent', 
    description: 'Searching for matching products...',
    icon: '🔍',
  },
  { 
    id: 'verifier', 
    name: 'Verifier Agent', 
    description: 'Checking price, compliance & shipping...',
    icon: '✅',
  },
  { 
    id: 'plan', 
    name: 'Plan Agent', 
    description: 'Generating purchase plans...',
    icon: '📋',
  },
  { 
    id: 'execution', 
    name: 'Execution Agent', 
    description: 'Creating draft order...',
    icon: '🛒',
  },
]

// 模拟的产品数据
const DEMO_PRODUCTS = [
  {
    id: 'of_001',
    title: 'Anker MagSafe Wireless Charger 15W',
    price: 35.99,
    image: '📱',
    brand: 'Anker',
    rating: 4.8,
  },
  {
    id: 'of_002',
    title: 'Belkin BoostCharge Pro 3-in-1',
    price: 89.99,
    image: '🔌',
    brand: 'Belkin',
    rating: 4.6,
  },
  {
    id: 'of_003',
    title: 'Apple MagSafe Charger',
    price: 39.00,
    image: '🍎',
    brand: 'Apple',
    rating: 4.5,
  },
]

// 模拟的方案数据
const DEMO_PLANS = [
  {
    name: 'Budget Saver',
    type: 'cheapest',
    product: DEMO_PRODUCTS[0],
    shipping: 5.99,
    tax: 3.36,
    total: 45.34,
    deliveryDays: '7-14',
    emoji: '💰',
    recommended: true,
    reason: 'Best match for your $50 budget with reliable shipping to Germany',
  },
  {
    name: 'Express Delivery',
    type: 'fastest',
    product: DEMO_PRODUCTS[2],
    shipping: 12.99,
    tax: 4.16,
    total: 56.15,
    deliveryDays: '3-5',
    emoji: '⚡',
    recommended: false,
    reason: 'Fastest delivery but slightly over budget',
  },
  {
    name: 'Best Value',
    type: 'best_value',
    product: DEMO_PRODUCTS[1],
    shipping: 0,
    tax: 7.20,
    total: 97.19,
    deliveryDays: '5-7',
    emoji: '⭐',
    recommended: false,
    reason: '3-in-1 charger with free shipping - premium choice',
  },
]

// LLM 推荐信息
const AI_RECOMMENDATION = {
  plan: 'Budget Saver',
  reason: 'Based on your $50 budget and shipping to Germany, this Anker charger offers the best value with fast 15W charging and excellent reviews.',
  model: 'GPT-4o-mini',
  confidence: 0.92,
}

type Step = 'input' | 'processing' | 'plans' | 'confirmation'

export default function Home() {
  const [step, setStep] = useState<Step>('input')
  const [query, setQuery] = useState('')
  const [currentAgentIndex, setCurrentAgentIndex] = useState(0)
  const [selectedPlan, setSelectedPlan] = useState<typeof DEMO_PLANS[0] | null>(null)
  const [parsedMission, setParsedMission] = useState<{
    destination: string
    budget: number
    constraints: string[]
  } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    // 解析意图（简单演示）
    const mission = {
      destination: query.toLowerCase().includes('germany') ? 'DE' : 
                   query.toLowerCase().includes('uk') ? 'GB' : 'US',
      budget: parseFloat(query.match(/\$?(\d+)/)?.[1] || '100'),
      constraints: [] as string[],
    }
    if (query.toLowerCase().includes('iphone')) mission.constraints.push('iPhone compatible')
    if (query.toLowerCase().includes('wireless')) mission.constraints.push('Wireless')
    if (query.toLowerCase().includes('fast')) mission.constraints.push('Fast charging')
    
    setParsedMission(mission)
    setStep('processing')
    setCurrentAgentIndex(0)

    // 模拟 Agent 处理流程
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      setCurrentAgentIndex(i + 1)
    }

    await new Promise(resolve => setTimeout(resolve, 500))
    setStep('plans')
  }

  const handleSelectPlan = (plan: typeof DEMO_PLANS[0]) => {
    setSelectedPlan(plan)
    setStep('confirmation')
  }

  const handleReset = () => {
    setStep('input')
    setQuery('')
    setCurrentAgentIndex(0)
    setSelectedPlan(null)
    setParsedMission(null)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI Shopping Agent</h1>
              <p className="text-xs text-white/60">Shopping like prompting!</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Sparkles className="w-4 h-4" />
            <span>Multi-Agent Demo</span>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Input Step */}
        {step === 'input' && (
          <div className="animate-fade-in">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-white mb-4">
                What would you like to buy?
              </h2>
              <p className="text-white/60 text-lg">
                Describe your shopping needs and let our AI agents find the best options for you.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <div className="relative">
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g., I need a wireless charger for my iPhone 15, budget around $50, shipping to Germany..."
                  className="w-full h-32 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 resize-none"
                />
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="absolute bottom-4 right-4 px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-green-600 hover:to-emerald-700 transition-all flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Find Products
                </button>
              </div>
            </form>

            {/* Example queries */}
            <div className="mt-8">
              <p className="text-white/40 text-sm mb-3">Try these examples:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Wireless charger for iPhone, $50 budget, ship to US',
                  'Power bank 10000mAh, fast charging, under $40',
                  'USB-C hub for MacBook, good brand, ship to Germany',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setQuery(example)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/70 text-sm transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Processing Step */}
        {step === 'processing' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Processing your request...</h2>
              <p className="text-white/60">&quot;{query}&quot;</p>
            </div>

            {/* Parsed Mission */}
            {parsedMission && (
              <div className="mb-8 p-4 bg-white/5 rounded-xl border border-white/10">
                <h3 className="text-white/80 text-sm font-medium mb-2">Parsed Mission</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full">
                    🌍 {parsedMission.destination}
                  </span>
                  <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full">
                    💰 ${parsedMission.budget}
                  </span>
                  {parsedMission.constraints.map((c) => (
                    <span key={c} className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Progress */}
            <div className="space-y-4">
              {DEMO_STEPS.map((agentStep, index) => (
                <div
                  key={agentStep.id}
                  className={`p-4 rounded-xl border transition-all duration-500 ${
                    index < currentAgentIndex
                      ? 'bg-green-500/10 border-green-500/30'
                      : index === currentAgentIndex
                      ? 'bg-white/10 border-white/20'
                      : 'bg-white/5 border-white/10 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl">{agentStep.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{agentStep.name}</h3>
                      <p className="text-white/60 text-sm">{agentStep.description}</p>
                    </div>
                    <div>
                      {index < currentAgentIndex ? (
                        <CheckCircle className="w-6 h-6 text-green-500" />
                      ) : index === currentAgentIndex ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-white/20" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plans Step */}
        {step === 'plans' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h2>
              <p className="text-white/60">We found {DEMO_PLANS.length} options for you</p>
            </div>

            {/* AI Recommendation Card */}
            <div className="mb-6 p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-green-400 font-semibold">AI Recommendation</span>
                    <span className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/60">
                      {AI_RECOMMENDATION.model}
                    </span>
                    <span className="px-2 py-0.5 bg-green-500/20 rounded text-xs text-green-300">
                      {Math.round(AI_RECOMMENDATION.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-white/80 text-sm">{AI_RECOMMENDATION.reason}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {DEMO_PLANS.map((plan) => (
                <div
                  key={plan.name}
                  onClick={() => handleSelectPlan(plan)}
                  className={`p-6 bg-white/5 hover:bg-white/10 border rounded-2xl cursor-pointer transition-all group relative ${
                    plan.recommended 
                      ? 'border-green-500/50 ring-1 ring-green-500/30' 
                      : 'border-white/10 hover:border-green-500/50'
                  }`}
                >
                  {plan.recommended && (
                    <div className="absolute -top-3 left-4 px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full text-xs text-white font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      AI Recommended
                    </div>
                  )}
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{plan.emoji}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          plan.type === 'cheapest' ? 'bg-green-500/20 text-green-300' :
                          plan.type === 'fastest' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-yellow-500/20 text-yellow-300'
                        }`}>
                          {plan.type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-white/80 mb-2">{plan.product.title}</p>
                      <p className="text-white/50 text-sm mb-3">{plan.reason}</p>
                      
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-white/40 block">Product</span>
                          <span className="text-white font-medium">${plan.product.price}</span>
                        </div>
                        <div>
                          <span className="text-white/40 block">Shipping</span>
                          <span className="text-white font-medium">{plan.shipping === 0 ? 'FREE' : `$${plan.shipping}`}</span>
                        </div>
                        <div>
                          <span className="text-white/40 block">Tax</span>
                          <span className="text-white font-medium">${plan.tax}</span>
                        </div>
                        <div>
                          <span className="text-white/40 block">Delivery</span>
                          <span className="text-white font-medium">{plan.deliveryDays} days</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-white/40 text-sm block">Total</span>
                      <span className="text-3xl font-bold text-white">${plan.total}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleReset}
              className="mt-6 w-full py-3 border border-white/20 text-white/60 rounded-xl hover:bg-white/5 transition-colors"
            >
              Start Over
            </button>
          </div>
        )}

        {/* Confirmation Step */}
        {step === 'confirmation' && selectedPlan && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
                <Package className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Draft Order Created!</h2>
              <p className="text-white/60">Review your order before proceeding to payment</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {/* Order Header */}
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white/40 text-sm">Order ID</span>
                    <p className="text-white font-mono">do_{Math.random().toString(36).substr(2, 12)}</p>
                  </div>
                  <div className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-sm">
                    Pending Confirmation
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                  <div className="text-4xl">{selectedPlan.product.image}</div>
                  <div className="flex-1">
                    <h3 className="text-white font-medium">{selectedPlan.product.title}</h3>
                    <p className="text-white/60 text-sm">{selectedPlan.product.brand} · ★ {selectedPlan.product.rating}</p>
                  </div>
                  <div className="text-white font-medium">${selectedPlan.product.price}</div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="p-6 space-y-3">
                <div className="flex justify-between text-white/60">
                  <span>Subtotal</span>
                  <span>${selectedPlan.product.price}</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Shipping ({selectedPlan.deliveryDays} days)</span>
                  <span>{selectedPlan.shipping === 0 ? 'FREE' : `$${selectedPlan.shipping}`}</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Estimated Tax</span>
                  <span>${selectedPlan.tax}</span>
                </div>
                <div className="h-px bg-white/10 my-4" />
                <div className="flex justify-between text-xl font-bold text-white">
                  <span>Total</span>
                  <span>${selectedPlan.total}</span>
                </div>
              </div>

              {/* Evidence */}
              <div className="p-4 bg-white/5 border-t border-white/10">
                <div className="flex items-center gap-2 text-white/40 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>Evidence snapshot saved: ev_{new Date().toISOString().slice(0,10).replace(/-/g, '')}</span>
                </div>
              </div>
            </div>

            {/* Important Notice */}
            <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <p className="text-yellow-200 text-sm">
                ⚠️ <strong>IMPORTANT:</strong> Payment has NOT been captured. 
                This is a draft order that requires your confirmation to proceed.
              </p>
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-4">
              <button
                onClick={handleReset}
                className="flex-1 py-3 border border-white/20 text-white/60 rounded-xl hover:bg-white/5 transition-colors"
              >
                Start New Search
              </button>
              <button
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transition-all flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-5 h-5" />
                Proceed to Payment
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 py-4 border-t border-white/10 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between text-white/40 text-sm">
          <span>Multi-AI-Agent4OnlineShopping © 2024</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-white/10 rounded text-xs">GPT-4o-mini via Poe</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              All agents operational
            </span>
          </div>
        </div>
      </footer>
    </main>
  )
}

