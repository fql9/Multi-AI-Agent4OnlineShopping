'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { 
  ShoppingCart, Bot, Package, CheckCircle, Loader2, Send, 
  Sparkles, AlertTriangle, Info, Shield, Truck, Receipt,
  ChevronRight, Clock, Zap, Terminal, Brain, Wrench,
  ChevronDown, ChevronUp, Activity, Layers,
  LayoutGrid, Table2, ArrowUpDown, Star, DollarSign,
  ExternalLink, Store, ImagePlus, X, RotateCcw, MessageCircle,
  User
} from 'lucide-react'
import Image from 'next/image'
import * as api from '@/lib/api'
import { useShoppingStore, type OrderState, type TaxEstimate, type ComplianceRisk, type ThinkingStep, type ToolCall, type AgentStep, type GuidedChatMessage } from '@/store/shopping'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton, SkeletonCard, SkeletonAgentStep } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// 状态机步骤映射
const STATE_LABELS: Record<OrderState, { label: string; step: number }> = {
  'IDLE': { label: 'Ready', step: 0 },
  'WAITING_USER_INPUT': { label: 'Need Info', step: 0 },
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

// 产品图片组件 - 支持真实图片和 emoji 后备
function ProductImage({ 
  imageUrl, 
  fallbackEmoji, 
  alt, 
  size = 'md',
  className = ''
}: { 
  imageUrl?: string
  fallbackEmoji: string
  alt: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const [imgError, setImgError] = useState(false)
  
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
    xl: 'w-24 h-24'
  }
  
  const emojiSizes = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-5xl',
    xl: 'text-6xl'
  }
  
  if (!imageUrl || imgError) {
    return (
      <div className={cn(
        "flex items-center justify-center rounded-xl bg-surface-100",
        sizeClasses[size],
        className
      )}>
        <span className={emojiSizes[size]}>{fallbackEmoji}</span>
      </div>
    )
  }
  
  return (
    <div className={cn(
      "relative rounded-xl overflow-hidden bg-white border border-surface-200",
      sizeClasses[size],
      className
    )}>
      <Image
        src={imageUrl}
        alt={alt}
        fill
        className="object-cover"
        onError={() => setImgError(true)}
        unoptimized // 允许外部图片
      />
    </div>
  )
}

// 产品链接按钮
function ProductLink({ url, storeName }: { url?: string; storeName?: string }) {
  if (!url) return null
  
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-lg text-xs font-medium transition-colors border border-primary-200"
    >
      <Store className="w-3.5 h-3.5" />
      <span>{storeName || 'View Product'}</span>
      <ExternalLink className="w-3 h-3" />
    </a>
  )
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

function getInitials(name?: string) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || 'U'
}

function UserAvatar({ name, avatarUrl }: { name?: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <div className="relative w-9 h-9 rounded-full overflow-hidden border border-surface-200 bg-white">
        <Image
          src={avatarUrl}
          alt={name ? `${name} avatar` : 'User avatar'}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
    )
  }

  return (
    <div className="w-9 h-9 rounded-full bg-surface-100 border border-surface-200 flex items-center justify-center">
      <span className="text-xs font-semibold text-surface-600">{getInitials(name)}</span>
    </div>
  )
}

type FeaturedProduct = {
  id: string
  title: string
  imageUrl: string
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function DockProductShowcase() {
  const [items, setItems] = useState<FeaturedProduct[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [mouseX, setMouseX] = useState<number | null>(null)
  const [hovering, setHovering] = useState(false)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  // Fetch a small set of real product images from Tool Gateway
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const search = await api.searchOffers({ query: 'jacket', limit: 10 })
        const offerIds = search.ok && search.data?.offer_ids ? search.data.offer_ids.slice(0, 10) : []
        if (!offerIds.length) return

        const collected: FeaturedProduct[] = []
        for (const id of offerIds) {
          try {
            const card = await api.getOfferCard(id)
            const data = card.ok ? card.data : undefined
            const title = data?.titles?.[0]?.text || data?.titles?.[1]?.text || id
            const attrs = data?.attributes as { image_url?: string } | undefined
            const imageUrl = attrs?.image_url
            if (imageUrl) collected.push({ id, title, imageUrl })
          } catch (e) {
          }
          if (collected.length >= 8) break
        }

        if (!cancelled) {
          setItems(collected)
          setActiveIndex(0)
        }
      } catch (e) {
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  // Autoplay focus like a looping slideshow
  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(() => {
      setActiveIndex((i) => (i + 1) % items.length)
    }, 1200)
    return () => clearInterval(t)
  }, [items.length])

  const scales = useMemo(() => {
    if (!items.length) return []
    return items.map((_, idx) => {
      if (!hovering || mouseX === null) {
        return idx === activeIndex ? 1.35 : 1.0
      }
      const el = itemRefs.current[idx]
      if (!el) return 1.0
      const rect = el.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const dist = Math.abs(mouseX - center)
      const influence = clamp(1 - dist / 140, 0, 1)
      return 1 + influence * 0.85
    })
  }, [items, hovering, mouseX, activeIndex])

  const lifts = useMemo(() => {
    if (!items.length) return []
    return items.map((_, idx) => {
      if (!hovering || mouseX === null) {
        return idx === activeIndex ? 6 : 0
      }
      const el = itemRefs.current[idx]
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const dist = Math.abs(mouseX - center)
      const influence = clamp(1 - dist / 140, 0, 1)
      return influence * 12
    })
  }, [items, hovering, mouseX, activeIndex])

  if (!items.length) {
    return (
      <div className="w-[260px] h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 shadow-tech animate-float flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 shimmer" />
          <div className="w-10 h-10 rounded-xl bg-white/20 shimmer" />
          <div className="w-10 h-10 rounded-xl bg-white/20 shimmer" />
          <div className="w-10 h-10 rounded-xl bg-white/20 shimmer" />
        </div>
      </div>
    )
  }

  return (
    <div
      className="w-[260px] h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 shadow-tech animate-float flex items-center justify-center px-4"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false)
        setMouseX(null)
      }}
      onMouseMove={(e) => setMouseX(e.clientX)}
    >
      <div className="flex items-end justify-center gap-3">
        {items.map((p, idx) => {
          const s = scales[idx] ?? 1
          const lift = lifts[idx] ?? 0
          return (
            <button
              key={p.id}
              ref={(el) => {
                itemRefs.current[idx] = el
              }}
              type="button"
              className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/10 border border-white/20 shadow-sm focus:outline-none focus:ring-2 focus:ring-white/50"
              style={{
                transform: `translateY(${-lift}px) scale(${s})`,
                transition: 'transform 120ms ease-out',
              }}
              title={p.title}
            >
              <Image
                src={p.imageUrl}
                alt={p.title}
                fill
                className="object-cover"
                unoptimized
              />
              {/* subtle gloss */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Chat message bubble component
function ChatBubble({ message, isLatest }: { message: GuidedChatMessage; isLatest: boolean }) {
  const isUser = message.role === 'user'
  
  return (
    <div className={cn(
      "flex gap-3 animate-fade-in",
      isUser ? "justify-end" : "justify-start"
    )}>
      {!isUser && (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 shadow-md">
          <Bot className="w-5 h-5 text-white" />
        </div>
      )}
      
      <div className={cn(
        "max-w-[80%] rounded-2xl px-4 py-3",
        isUser 
          ? "bg-primary-500 text-white rounded-br-md" 
          : "bg-white border border-surface-200 text-surface-800 rounded-bl-md shadow-sm"
      )}>
        {/* Display images if any */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-surface-200">
                <Image
                  src={`data:image/jpeg;base64,${img}`}
                  alt={`Uploaded image ${idx + 1}`}
                  fill
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )}
        
        <div className={cn(
          "text-sm leading-relaxed whitespace-pre-wrap",
          message.isStreaming && "after:content-['▊'] after:animate-pulse after:ml-0.5"
        )}>
          {message.content || (message.isStreaming ? '' : '...')}
        </div>
      </div>
      
      {isUser && (
        <div className="w-9 h-9 rounded-xl bg-surface-100 border border-surface-200 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-surface-600" />
        </div>
      )}
    </div>
  )
}

// Image upload preview component
function ImagePreview({ images, onRemove }: { images: string[]; onRemove: (index: number) => void }) {
  if (images.length === 0) return null
  
  return (
    <div className="flex flex-wrap gap-2 p-2 border-b border-surface-100">
      {images.map((img, idx) => (
        <div key={idx} className="relative group">
          <div className="w-16 h-16 rounded-lg overflow-hidden border border-surface-200">
            <Image
              src={`data:image/jpeg;base64,${img}`}
              alt={`Upload ${idx + 1}`}
              width={64}
              height={64}
              className="object-cover w-full h-full"
            />
          </div>
          <button
            onClick={() => onRemove(idx)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

// Agent 步骤详情组件 - Light theme
function AgentStepDetail({ step, isActive }: { step: AgentStep; isActive: boolean }) {
  if (step.status === 'pending') return null
  // 给用户一个干净的界面：不展示 LLM 逐步思考与工具调用细节
  if (!step.output) return null
  
  return (
    <div className="mt-4 animate-fade-in text-sm text-surface-600 whitespace-pre-wrap">
      {step.output}
    </div>
  )
}

// 状态机进度条 - Light theme
function StateMachineProgress({ currentState }: { currentState: OrderState }) {
  const { step } = STATE_LABELS[currentState]
  const progress = (step / 10) * 100
  
  return (
    <Card className="mb-6">
      <CardContent className="p-4">
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
      </CardContent>
    </Card>
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
    <Card className="overflow-hidden">
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
              <ProductImage 
                imageUrl={plan.product.imageUrl}
                fallbackEmoji={plan.emoji}
                alt={plan.product.title}
                size="sm"
              />
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
                  {plan.product.productUrl && (
                    <a
                      href={plan.product.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary-500 hover:text-primary-600"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
            
            {/* Price */}
            <div className="col-span-2 flex items-center justify-center">
              <span className="font-bold text-surface-800">${plan.product.price}</span>
            </div>
            
            {/* Shipping */}
            <div className="col-span-2 flex items-center justify-center">
              <span className={cn(
                "font-semibold",
                plan.shipping === 0 ? "text-success-600" : "text-surface-700"
              )}>
                {plan.shipping === 0 ? 'FREE' : `$${plan.shipping}`}
              </span>
            </div>
            
            {/* Tax */}
            <div className="col-span-1 flex items-center justify-center">
              <span className={cn("font-medium text-sm", getTaxConfidenceColor(plan.tax.confidence))}>
                ${plan.tax.amount}
              </span>
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
    </Card>
  )
}

// 错误提示组件
function ErrorAlert({ error, errorCode, onDismiss }: { error: string; errorCode?: string | null; onDismiss: () => void }) {
  return (
    <Alert variant="danger" onClose={onDismiss} className="mb-6">
      <AlertTitle>Error {errorCode && `(${errorCode})`}</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

// 主页面
export default function Home() {
  const store = useShoppingStore()
  const [currentView, setCurrentView] = useState<'input' | 'processing' | 'plans' | 'confirmation'>('input')
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [followUpQuery, setFollowUpQuery] = useState('')
  
  // Chat state
  const [chatInput, setChatInput] = useState('')
  const [chatImages, setChatImages] = useState<string[]>([])
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 检查连接状态
  useEffect(() => {
    store.checkConnection()
  }, [store])

  // 根据状态切换视图
  useEffect(() => {
    if (store.orderState === 'IDLE') {
      setCurrentView('input')
    } else if (store.orderState === 'WAITING_USER_INPUT') {
      // 保持在 processing 视图，显示内联输入框
      setCurrentView('processing')
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

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [store.guidedChat.messages, store.guidedChat.streamingContent])

  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() && chatImages.length === 0) return
    
    const message = chatInput.trim()
    const images = [...chatImages]
    
    // Clear input immediately
    setChatInput('')
    setChatImages([])
    
    // Send to guided chat
    await store.sendGuidedMessage(message, images)
  }, [chatInput, chatImages, store])

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      if (chatImages.length >= 4) return // Max 4 images
      
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = (event.target?.result as string)?.split(',')[1]
        if (base64) {
          setChatImages((prev) => [...prev, base64].slice(0, 4))
        }
      }
      reader.readAsDataURL(file)
    })
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [chatImages.length])

  const handleConfirmChat = useCallback(() => {
    store.confirmGuidedChat()
    setCurrentView('processing')
    store.startAgentProcess()
  }, [store])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!store.query.trim()) {
      return
    }
    store.setOrderState('MISSION_READY')
    setCurrentView('processing')
    await store.startAgentProcess()
  }, [store])

  // 处理 Agent 追问时的用户回复
  const handleFollowUpSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!followUpQuery.trim()) return
    
    // 将追加输入设置为新的 query
    store.setQuery(followUpQuery)
    setFollowUpQuery('')
    store.setOrderState('MISSION_READY')
    await store.startAgentProcess()
  }, [followUpQuery, store])

  const handleSelectPlan = useCallback((plan: typeof store.plans[0]) => {
    store.selectPlan(plan)
    setCurrentView('confirmation')
  }, [store])

  const handleReset = useCallback(() => {
    store.reset()
    store.resetGuidedChat()
    setChatInput('')
    setChatImages([])
    setCurrentView('input')
    setExpandedStep(null)
  }, [store])

  const toggleStepExpansion = useCallback((index: number) => {
    setExpandedStep(prev => prev === index ? null : index)
  }, [])

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
          <div className="flex items-center gap-3">
            <UserAvatar name={store.user?.name} avatarUrl={store.user?.avatarUrl} />
          </div>
        </div>
      </header>

      <div className="relative max-w-4xl mx-auto px-4 py-8 pb-28">
        {/* Error Alert */}
        {store.error && (
          <ErrorAlert 
            error={store.error} 
            errorCode={store.errorCode}
            onDismiss={() => store.setError(null)}
          />
        )}
        
        {/* State Machine Progress */}
        {currentView !== 'input' && (
          <StateMachineProgress currentState={store.orderState} />
        )}

        {/* Input View - Chat-based Interface */}
        {currentView === 'input' && (
          <div className="animate-fade-in flex flex-col h-[calc(100vh-200px)] max-h-[700px]">
            {/* Header */}
            <div className="text-center mb-6 flex-shrink-0">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-tech">
                  <MessageCircle className="w-7 h-7 text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-surface-800 mb-2">
                Chat with AI Shopping Assistant
              </h2>
              <p className="text-surface-500 text-sm max-w-md mx-auto">
                Tell me what you&apos;re looking for! I&apos;ll ask a few questions to help find the perfect product.
              </p>
              
              {/* Turn counter */}
              <div className="flex items-center justify-center gap-2 mt-3">
                <Badge variant="default" className="text-xs">
                  {store.guidedChat.turnCount} / {store.guidedChat.maxTurns} turns
                </Badge>
                {store.guidedChat.readyToSearch && (
                  <Badge variant="success" className="text-xs animate-pulse">
                    ✓ Ready to search
                  </Badge>
                )}
              </div>
            </div>

            {/* Chat messages area */}
            <Card className="flex-1 flex flex-col overflow-hidden mb-4">
              <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
              >
                {/* Welcome message if no messages */}
                {store.guidedChat.messages.length === 0 && (
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 shadow-md">
                      <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-3 bg-white border border-surface-200 text-surface-800 shadow-sm">
                      <p className="text-sm leading-relaxed">
                        Hi! 👋 I&apos;m your AI shopping assistant. What would you like to buy today?
                        <br /><br />
                        You can describe what you&apos;re looking for, and I&apos;ll help you find the best options. Feel free to share images too!
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Chat messages */}
                {store.guidedChat.messages.map((msg, idx) => (
                  <ChatBubble 
                    key={msg.id} 
                    message={msg} 
                    isLatest={idx === store.guidedChat.messages.length - 1}
                  />
                ))}
                
                {/* Streaming indicator */}
                {store.guidedChat.isStreaming && store.guidedChat.messages.length > 0 && 
                 !store.guidedChat.messages[store.guidedChat.messages.length - 1]?.isStreaming && (
                  <div className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 shadow-md">
                      <Bot className="w-5 h-5 text-white animate-pulse" />
                    </div>
                    <div className="flex items-center gap-1 px-4 py-3 bg-white border border-surface-200 rounded-2xl rounded-bl-md">
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Image preview */}
              <ImagePreview 
                images={chatImages} 
                onRemove={(idx) => setChatImages((prev) => prev.filter((_, i) => i !== idx))}
              />

              {/* Chat input */}
              <form onSubmit={handleChatSubmit} className="p-3 border-t border-surface-100 bg-surface-50">
                <div className="flex items-end gap-2">
                  {/* Image upload button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={chatImages.length >= 4 || store.guidedChat.isStreaming}
                    className={cn(
                      "p-2.5 rounded-xl border transition-colors",
                      chatImages.length >= 4 || store.guidedChat.isStreaming
                        ? "bg-surface-100 border-surface-200 text-surface-400 cursor-not-allowed"
                        : "bg-white border-surface-200 text-surface-600 hover:bg-surface-50 hover:text-primary-600"
                    )}
                  >
                    <ImagePlus className="w-5 h-5" />
                  </button>
                  
                  {/* Text input */}
                  <div className="flex-1 relative">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleChatSubmit(e)
                        }
                      }}
                      placeholder="Type your message... (Shift+Enter for new line)"
                      disabled={store.guidedChat.isStreaming}
                      className="min-h-[44px] max-h-[120px] resize-none pr-12"
                    />
                  </div>
                  
                  {/* Send button */}
                  <Button
                    type="submit"
                    disabled={(!chatInput.trim() && chatImages.length === 0) || store.guidedChat.isStreaming}
                    className="h-11 px-4"
                  >
                    {store.guidedChat.isStreaming ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </div>
              </form>
            </Card>

            {/* Action buttons */}
            <div className="flex items-center justify-between flex-shrink-0">
              <Button
                variant="outline"
                onClick={() => {
                  store.resetGuidedChat()
                  setChatInput('')
                  setChatImages([])
                }}
                disabled={store.guidedChat.messages.length === 0}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Start Over
              </Button>
              
              <div className="flex items-center gap-3">
                {store.guidedChat.extractedMission && (
                  <div className="text-xs text-surface-500 max-w-xs truncate">
                    <span className="font-medium">Ready: </span>
                    {store.guidedChat.extractedMission.search_query || 'Your request'}
                  </div>
                )}
                <Button
                  onClick={handleConfirmChat}
                  disabled={!store.guidedChat.readyToSearch || store.guidedChat.isStreaming}
                  rightIcon={<ChevronRight className="w-4 h-4" />}
                  className={cn(
                    store.guidedChat.readyToSearch && "animate-pulse"
                  )}
                >
                  Find Products
                </Button>
              </div>
            </div>

            {/* Quick start examples */}
            {store.guidedChat.messages.length === 0 && (
              <div className="mt-6 flex-shrink-0">
                <p className="text-surface-500 text-xs mb-2 font-medium">Quick start:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'I want to buy a gift for my mom',
                    'Looking for a laptop bag',
                    'Need a dress for a wedding',
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => {
                        setChatInput(example)
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-surface-50 border border-surface-200 rounded-lg text-surface-600 text-xs transition-all hover:border-primary-300 hover:text-primary-600"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Processing View - Light theme */}
        {currentView === 'processing' && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 mb-4 shadow-tech">
                {store.isStreaming ? (
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                ) : (
                  <Bot className="w-8 h-8 text-white" />
                )}
              </div>
              {/* Extra "system is running" motion: animated progress bar */}
              <div className="max-w-xl mx-auto mb-4">
                <div className="h-2 rounded-full bg-surface-100 border border-surface-200 overflow-hidden">
                  <div className="h-full w-1/2 bg-gradient-to-r from-primary-500 via-accent-500 to-primary-500 animate-gradient-x animate-progress" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-surface-800 mb-2">
                {store.isStreaming ? 'AI Agents are working...' : 'Processing your request...'}
              </h2>
              <p className="text-surface-500 max-w-md mx-auto">&quot;{store.query}&quot;</p>
            </div>

            {/* Agent needs more input - inline input box */}
            {store.orderState === 'WAITING_USER_INPUT' && store.lastAgentMessage && (
              <Card variant="gradient" className="mb-6 ring-2 ring-primary-200">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 shadow-md animate-pulse">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-surface-800 mb-2">🤔 I need a bit more information</h3>
                      <div className="text-surface-600 whitespace-pre-wrap leading-relaxed bg-white/50 rounded-lg p-3 border border-surface-100">
                        {store.lastAgentMessage}
                      </div>
                    </div>
                  </div>
                  <form onSubmit={handleFollowUpSubmit} className="flex gap-3">
                    <input
                      type="text"
                      value={followUpQuery}
                      onChange={(e) => setFollowUpQuery(e.target.value)}
                      placeholder="Type your response here..."
                      className="flex-1 px-4 py-3 rounded-xl border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-800"
                      autoFocus
                    />
                    <Button type="submit" disabled={!followUpQuery.trim()}>
                      <Send className="w-4 h-4 mr-2" />
                      Send
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Parsed Mission - Light theme */}
            {store.mission && (
              <Card className="mb-6">
                <CardContent className="p-5">
                  <h3 className="text-surface-700 text-sm font-semibold mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-primary-100 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-primary-600" />
                    </span>
                    Parsed Mission
                  </h3>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Badge variant="info">🌍 {store.mission.destination_country}</Badge>
                    {store.mission.budget_amount != null && (
                    <Badge variant="success">💰 ${store.mission.budget_amount}</Badge>
                    )}
                    {store.mission.detected_language && (
                      <Badge variant="default">🗣️ {store.mission.detected_language}</Badge>
                    )}
                    {store.mission.hard_constraints.map((c) => (
                      <Badge key={c.value} variant="default">{c.value}</Badge>
                    ))}
                  </div>

                  {/* Purchase Context */}
                  {store.mission.purchase_context && (
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {store.mission.purchase_context.occasion && (
                        <Badge variant="accent">🎯 {store.mission.purchase_context.occasion}</Badge>
                      )}
                      {store.mission.purchase_context.recipient && (
                        <Badge variant="accent">🎁 {store.mission.purchase_context.recipient}</Badge>
                      )}
                      {store.mission.purchase_context.style_preference && (
                        <Badge variant="accent">✨ {store.mission.purchase_context.style_preference}</Badge>
                      )}
                      {store.mission.purchase_context.budget_sensitivity && (
                        <Badge variant="accent">💡 {store.mission.purchase_context.budget_sensitivity}</Badge>
                      )}
                      {(store.mission.purchase_context.special_requirements || []).slice(0, 4).map((r) => (
                        <Badge key={r} variant="default">{r}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Current thinking step - Light theme */}
            {store.currentThinkingStep && (
              <Card variant="gradient" className="mb-6 animate-pulse-slow ring-2 ring-primary-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-md">
                      <Brain className="w-5 h-5 text-white animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs text-primary-500 font-semibold uppercase tracking-wide">Current Thought</span>
                      <p className="text-primary-700 font-medium">{store.currentThinkingStep}</p>
                    </div>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Agent Progress - Light theme */}
            <div className="space-y-4">
              {store.agentSteps.map((step, index) => (
                <Card
                  key={step.id}
                  variant={
                    step.status === 'completed' ? 'success' :
                    step.status === 'running' ? 'gradient' : 'default'
                  }
                  className={cn(
                    "transition-all duration-500 overflow-hidden",
                    step.status === 'running' && "ring-2 ring-primary-300 shadow-lg shadow-primary-100",
                    step.status === 'pending' && "opacity-50"
                  )}
                >
                  {/* Running indicator bar */}
                  {step.status === 'running' && (
                    <div className="h-1 bg-gradient-to-r from-primary-400 via-accent-400 to-primary-400 animate-gradient-x" />
                  )}
                  
                  <CardContent className="p-0">
                    <button
                      onClick={() => step.status !== 'pending' && toggleStepExpansion(index)}
                      className="w-full p-5 flex items-center gap-4"
                      disabled={step.status === 'pending'}
                    >
                      <div className={cn(
                        "text-3xl transition-transform duration-300",
                        step.status === 'running' && "animate-bounce-slow"
                      )}>
                        {step.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <h3 className={cn(
                            "font-semibold",
                            step.status === 'running' ? "text-primary-700" : "text-surface-800"
                          )}>
                            {step.name}
                          </h3>
                          {step.status === 'running' && (
                            <Badge variant="info" className="animate-pulse">Running</Badge>
                          )}
                          {step.status === 'completed' && step.duration && (
                            <span className="text-xs text-surface-400">
                              {(step.duration / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>
                        <p className={cn(
                          "text-sm",
                          step.status === 'running' ? "text-primary-600" : "text-surface-500"
                        )}>
                          {step.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {step.status === 'completed' ? (
                          <div className="w-10 h-10 rounded-xl bg-success-100 flex items-center justify-center shadow-sm">
                            <CheckCircle className="w-6 h-6 text-success-600" />
                          </div>
                        ) : step.status === 'running' ? (
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-md">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-xl border-2 border-surface-200 border-dashed flex items-center justify-center">
                            <span className="text-surface-300 text-sm font-medium">{index + 1}</span>
                          </div>
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
                      <div className="px-5 pb-5 border-t border-surface-100 bg-surface-50/50">
                        <AgentStepDetail step={step} isActive={step.status === 'running'} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Processing status footer */}
            {store.isStreaming && (
              <div className="mt-6 text-center">
                <p className="text-sm text-surface-500 font-medium">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
                    Multi-agent system is analyzing your request...
                  </span>
                </p>
                <p className="text-xs text-surface-400 mt-1">
                  This usually takes 10-30 seconds depending on complexity
                </p>
              </div>
            )}
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
              <Card variant="gradient" className="mb-6">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary-500/20">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-primary-700 font-bold">AI Recommendation</span>
                        <Badge variant="success">
                          {Math.round(store.aiRecommendation.confidence * 100)}% confidence
                        </Badge>
                      </div>
                      <p className="text-surface-600 text-sm">{store.aiRecommendation.reason}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats & View Toggle */}
            <Card className="mb-6">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-7 h-7 rounded-lg bg-success-100 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-success-600" />
                  </div>
                  <span className="text-surface-700 font-semibold">{store.plans.length}</span>
                  <span className="text-surface-400">plans</span>
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
              </CardContent>
            </Card>

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
                  <Card
                    key={plan.name}
                    interactive
                    onClick={() => handleSelectPlan(plan)}
                    className={cn(
                      "p-6 relative",
                      plan.recommended && "ring-2 ring-primary-200"
                    )}
                  >
                    {plan.recommended && (
                      <div className="absolute -top-3 left-4 px-3 py-1.5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full text-xs text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-primary-500/20">
                        <Sparkles className="w-3 h-3" />
                        AI Recommended
                      </div>
                    )}
                    
                    <div className="flex items-start gap-5">
                      <ProductImage 
                        imageUrl={plan.product.imageUrl}
                        fallbackEmoji={plan.emoji}
                        alt={plan.product.title}
                        size="lg"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h3 className="text-xl font-bold text-surface-800">{plan.name}</h3>
                          <Badge variant={
                            plan.type === 'cheapest' ? 'success' :
                            plan.type === 'fastest' ? 'info' : 'warning'
                          }>
                            {plan.type.replace('_', ' ')}
                          </Badge>
                          {plan.product.source === 'xoobay' && (
                            <Badge variant="accent" className="text-[10px]">XOOBAY</Badge>
                          )}
                        </div>
                        <p className="text-surface-700 font-medium mb-1">{plan.product.title}</p>
                        {plan.product.shortDescription && (
                          <p className="text-surface-500 text-xs mb-2">{plan.product.shortDescription}</p>
                        )}
                        <p className="text-surface-500 text-sm mb-3">{plan.reason}</p>

                        {/* AI Recommendation Reason (per plan) */}
                        {(plan.aiRecommendation?.main_reason || (plan.productHighlights && plan.productHighlights.length > 0)) && (
                          <div className="mb-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                            {plan.aiRecommendation?.main_reason && (
                              <div className="flex items-start gap-2">
                                <Bot className="w-4 h-4 text-primary-600 mt-0.5" />
                                <div className="text-sm text-surface-700 leading-relaxed">
                                  <span className="font-semibold text-surface-800">AI 推荐：</span>
                                  {plan.aiRecommendation.main_reason}
                                  {plan.aiRecommendation.seasonal_relevance && (
                                    <div className="mt-1 text-xs text-surface-500">
                                      <span className="font-semibold">季节/节日：</span>{plan.aiRecommendation.seasonal_relevance}
                                    </div>
                                  )}
                                  {plan.aiRecommendation.value_proposition && (
                                    <div className="mt-1 text-xs text-surface-500">
                                      <span className="font-semibold">价值点：</span>{plan.aiRecommendation.value_proposition}
                                    </div>
                                  )}
                                  {plan.aiRecommendation.personalized_tip && (
                                    <div className="mt-1 text-xs text-surface-500">
                                      <span className="font-semibold">小建议：</span>{plan.aiRecommendation.personalized_tip}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {plan.productHighlights && plan.productHighlights.length > 0 && (
                              <div className={cn("mt-2 flex flex-wrap gap-2", !plan.aiRecommendation?.main_reason && "mt-0")}>
                                {plan.productHighlights.slice(0, 6).map((h, idx) => (
                                  <Badge key={`${plan.name}-hl-${idx}`} variant="default">{h}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Product Link */}
                        {plan.product.productUrl && (
                          <div className="mb-3">
                            <ProductLink url={plan.product.productUrl} storeName={plan.product.storeName} />
                          </div>
                        )}
                        
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
                  </Card>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              onClick={handleReset}
              className="mt-6 w-full"
            >
              Start Over
            </Button>
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

            <Card className="overflow-hidden">
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
                  <ProductImage 
                    imageUrl={store.draftOrder.plan.product.imageUrl}
                    fallbackEmoji={store.draftOrder.plan.product.image}
                    alt={store.draftOrder.plan.product.title}
                    size="xl"
                  />
                  <div className="flex-1">
                    <h3 className="text-surface-800 font-semibold text-lg">{store.draftOrder.plan.product.title}</h3>
                    <p className="text-surface-500 text-sm">
                      {store.draftOrder.plan.product.brand} · ★ {store.draftOrder.plan.product.rating}
                    </p>
                    {store.draftOrder.plan.product.shortDescription && (
                      <p className="text-surface-400 text-xs mt-1">{store.draftOrder.plan.product.shortDescription}</p>
                    )}
                    {store.draftOrder.plan.product.productUrl && (
                      <div className="mt-2">
                        <ProductLink 
                          url={store.draftOrder.plan.product.productUrl} 
                          storeName={store.draftOrder.plan.product.storeName} 
                        />
                      </div>
                    )}
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
                    <span className="text-surface-700 font-medium">${store.draftOrder.plan.tax.breakdown.vat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Import Duty</span>
                    <span className="text-surface-700 font-medium">${store.draftOrder.plan.tax.breakdown.duty.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-surface-500">Handling Fee</span>
                    <span className="text-surface-700 font-medium">${store.draftOrder.plan.tax.breakdown.handling.toFixed(2)}</span>
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
                      <Card key={i} variant="warning" className="p-4">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">{getComplianceIcon(risk.type)}</span>
                          <div>
                            <p className="text-warning-700 font-semibold capitalize">{risk.type} Warning</p>
                            <p className="text-surface-600 text-sm">{risk.message}</p>
                            {risk.mitigation && (
                              <p className="text-success-600 text-sm mt-1 font-medium">✓ {risk.mitigation}</p>
                            )}
                          </div>
                        </div>
                      </Card>
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
                    <Card 
                      key={item.id} 
                      variant={item.checked ? 'success' : 'default'}
                      className="p-4"
                    >
                      <div className="flex items-start gap-4">
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
                    </Card>
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
            </Card>

            {/* Important Notice */}
            <Alert variant="warning" className="mt-6">
              <AlertTriangle className="w-5 h-5" />
              <AlertTitle>Payment Not Captured</AlertTitle>
              <AlertDescription>
                Check all required boxes to proceed to payment.
              </AlertDescription>
            </Alert>

            {/* Actions */}
            <div className="mt-6 flex gap-4">
              <Button
                variant="outline"
                onClick={handleReset}
                className="flex-1"
              >
                Start New Search
              </Button>
              <Button
                disabled={!store.canProceedToPayment()}
                className="flex-1"
                leftIcon={<ShoppingCart className="w-5 h-5" />}
              >
                Proceed to Payment
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Light theme */}
      <footer className="fixed bottom-0 left-0 right-0 py-4 border-t border-surface-200 bg-white/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between text-surface-400 text-sm">
          <span className="font-medium">Multi-AI-Agent4OnlineShopping © 2024</span>
          <span className="text-surface-500 font-medium">Powered by Multi-Agent Shopping</span>
        </div>
      </footer>
    </main>
  )
}
