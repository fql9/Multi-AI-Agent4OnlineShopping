'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ShoppingCart,
  CheckCircle,
  Loader2,
  Send,
  Sparkles,
  AlertTriangle,
  Info,
  Shield,
  Receipt,
  Search,
  ChevronRight,
  Clock,
  LayoutGrid,
  Table2,
  ArrowUpDown,
  Star,
  ExternalLink,
  Store,
  ImagePlus,
  X,
  RotateCcw,
  MessageCircle,
  User,
} from 'lucide-react'
import Image from 'next/image'
import { useShoppingStore, type TaxEstimate, type ComplianceRisk, type GuidedChatMessage } from '@/store/shopping'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function getTaxConfidenceColor(confidence: TaxEstimate['confidence']) {
  switch (confidence) {
    case 'high': return 'text-success-600'
    case 'medium': return 'text-warning-600'
    case 'low': return 'text-danger-600'
  }
}

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

function ProductImage({
  imageUrl,
  fallbackEmoji,
  alt,
  size = 'md',
  className = '',
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
    xl: 'w-24 h-24',
  }

  const emojiSizes = {
    sm: 'text-2xl',
    md: 'text-4xl',
    lg: 'text-5xl',
    xl: 'text-6xl',
  }

  if (!imageUrl || imgError) {
    return (
      <div className={cn('flex items-center justify-center rounded-xl bg-surface-100', sizeClasses[size], className)}>
        <span className={emojiSizes[size]}>{fallbackEmoji}</span>
      </div>
    )
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-white border border-surface-200', sizeClasses[size], className)}>
      <Image
        src={imageUrl}
        alt={alt}
        fill
        className="object-cover"
        onError={() => setImgError(true)}
        unoptimized
      />
    </div>
  )
}

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

function ChatBubble({ message }: { message: GuidedChatMessage }) {
  const isUser = message.role === 'user'
  if (!isUser) {
    // AI 消息 - 无边框，融入背景
    return (
      <div className="animate-fade-in text-sm text-[#2d3436] whitespace-pre-wrap leading-relaxed">
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#e0e0de]">
                <Image src={`data:image/jpeg;base64,${img}`} alt={`Uploaded image ${idx + 1}`} fill className="object-cover" />
              </div>
            ))}
          </div>
        )}
        {message.content || (message.isStreaming ? '' : '...')}
      </div>
    )
  }
  // 用户消息 - 浅灰色背景
  return (
    <div className="flex gap-3 animate-fade-in justify-end">
      <div
        className={cn(
          'max-w-[80%]',
          'rounded-2xl rounded-br-md px-4 py-3 bg-[#f5f5f3] text-[#2d3436] border border-[#e0e0de]',
        )}
      >
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((img, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#e0e0de]">
                <Image src={`data:image/jpeg;base64,${img}`} alt={`Uploaded image ${idx + 1}`} fill className="object-cover" />
              </div>
            ))}
          </div>
        )}

        <div
          className={cn(
            'text-sm leading-relaxed whitespace-pre-wrap',
            message.isStreaming && "after:content-['▊'] after:animate-pulse after:ml-0.5",
          )}
        >
          {message.content || (message.isStreaming ? '' : '...')}
        </div>
      </div>

      <div className="w-9 h-9 rounded-xl bg-[#f5f5f3] border border-[#e0e0de] flex items-center justify-center flex-shrink-0">
        <User className="w-5 h-5 text-[#6b6c6c]" />
      </div>
    </div>
  )
}

function ImagePreview({ images, onRemove }: { images: string[]; onRemove: (index: number) => void }) {
  if (images.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 p-2 border-t border-surface-100 bg-white">
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
            type="button"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

function extractQueryFromInput(input?: string) {
  if (!input) return ''
  try {
    const parsed = JSON.parse(input) as { query?: string; params?: { query?: string } }
    if (parsed.query) return String(parsed.query)
    if (parsed.params?.query) return String(parsed.params.query)
  } catch {}
  const match = input.match(/"query"\s*:\s*"([^"]+)"/)
  return match?.[1] || input
}

function truncateText(value: string, max = 64) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

type Plan = ReturnType<typeof useShoppingStore.getState>['plans'][0]
function ComparisonTable({ plans, onSelectPlan }: { plans: Plan[]; onSelectPlan: (plan: Plan) => void }) {
  const [sortKey, setSortKey] = useState<'total' | 'price' | 'shipping' | 'delivery'>('total')
  const [sortAsc, setSortAsc] = useState(true)

  const sortedPlans = [...plans].sort((a, b) => {
    let aVal: number
    let bVal: number
    switch (sortKey) {
      case 'total': aVal = a.total; bVal = b.total; break
      case 'price': aVal = a.product.price; bVal = b.product.price; break
      case 'shipping': aVal = a.shipping; bVal = b.shipping; break
      case 'delivery':
        aVal = parseInt(a.deliveryDays.split('-')[0])
        bVal = parseInt(b.deliveryDays.split('-')[0])
        break
      default:
        aVal = a.total
        bVal = b.total
    }
    return sortAsc ? aVal - bVal : bVal - aVal
  })

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: typeof sortKey }) => (
    <button
      onClick={() => handleSort(sortKeyName)}
      className={cn(
        'flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide transition-colors',
        sortKey === sortKeyName ? 'text-primary-600' : 'text-surface-500 hover:text-surface-700',
      )}
      type="button"
    >
      {label}
      <ArrowUpDown className={cn('w-3.5 h-3.5', sortKey === sortKeyName && 'text-primary-500')} />
    </button>
  )

  return (
    <Card className="overflow-hidden">
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

      <div className="divide-y divide-surface-100">
        {sortedPlans.map((plan, idx) => (
          <div
            key={plan.name + idx}
            onClick={() => onSelectPlan(plan)}
            className={cn(
              'grid grid-cols-12 gap-4 p-4 cursor-pointer transition-all hover:bg-primary-50/50 group',
              plan.recommended && 'bg-primary-50/30',
            )}
          >
            <div className="col-span-4 flex items-center gap-3">
              <ProductImage imageUrl={plan.product.imageUrl} fallbackEmoji={plan.emoji} alt={plan.product.title} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-surface-800 truncate">{plan.name}</span>
                  {plan.recommended && <Star className="w-4 h-4 text-warning-500 fill-warning-500 flex-shrink-0" />}
                </div>
                <p className="text-sm text-surface-500 truncate">{plan.product.title}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge
                    variant={plan.type === 'cheapest' ? 'success' : plan.type === 'fastest' ? 'info' : 'warning'}
                    className="text-[10px]"
                  >
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

            <div className="col-span-2 flex items-center justify-center">
              <span className="font-bold text-surface-800">${plan.product.price}</span>
            </div>

            <div className="col-span-2 flex items-center justify-center">
              <span className={cn('font-semibold', plan.shipping === 0 ? 'text-success-600' : 'text-surface-700')}>
                {plan.shipping === 0 ? 'FREE' : `$${plan.shipping}`}
              </span>
            </div>

            <div className="col-span-1 flex items-center justify-center">
              <span className={cn('font-medium text-sm', getTaxConfidenceColor(plan.tax.confidence))}>${plan.tax.amount}</span>
            </div>

            <div className="col-span-1 flex items-center justify-center">
              <div className="text-center">
                <span className="font-medium text-surface-700 text-sm">{plan.deliveryDays}</span>
                <span className="text-xs text-surface-400 block">days</span>
              </div>
            </div>

            <div className="col-span-2 flex items-center justify-center gap-2">
              <span className="font-bold text-lg text-surface-800">${plan.total}</span>
              <ChevronRight className="w-4 h-4 text-surface-300 group-hover:text-primary-500 transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ErrorAlert({ error, errorCode, onDismiss }: { error: string; errorCode?: string | null; onDismiss: () => void }) {
  if (errorCode === 'NO_PRODUCTS_FOUND') {
    return (
      <Card className="mb-6 border-2 border-warning-300 bg-gradient-to-br from-warning-50 to-orange-50 shadow-lg animate-fade-in">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-warning-100 flex items-center justify-center flex-shrink-0">
              <span className="text-3xl">🔍</span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-warning-800 mb-2">未找到符合条件的商品</h3>
              <p className="text-warning-700 mb-4">抱歉，我们没有找到匹配您需求的商品。请尝试以下建议：</p>
              <ul className="space-y-2 text-sm text-warning-600 mb-4">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-warning-200 flex items-center justify-center text-xs font-bold">1</span>
                  使用更通用的搜索词（如「夹克」而非特定品牌型号）
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-warning-200 flex items-center justify-center text-xs font-bold">2</span>
                  调整预算范围（扩大价格区间）
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-warning-200 flex items-center justify-center text-xs font-bold">3</span>
                  更换目的地国家（部分商品可能有地区限制）
                </li>
              </ul>
              <Button onClick={onDismiss} variant="outline" className="border-warning-400 text-warning-700 hover:bg-warning-100">
                <RotateCcw className="w-4 h-4 mr-2" />
                重新开始搜索
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Alert variant="danger" onClose={onDismiss} className="mb-6">
      <AlertTitle>Error {errorCode && `(${errorCode})`}</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )
}

export default function Home() {
  const store = useShoppingStore()

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const [followUpQuery, setFollowUpQuery] = useState('')
  
  // 使用 store 中的 chatMode
  const chatMode = store.chatMode
  const setChatMode = store.setChatMode

  const [chatInput, setChatInput] = useState('')
  const [chatImages, setChatImages] = useState<string[]>([])
  const [thinkingCollapsed, setThinkingCollapsed] = useState(false)
  const userToggledThinking = useRef(false) // Track if user manually toggled
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)

  const intentStep = store.agentSteps.find((step) => step.id === 'intent')
  const candidateStep = store.agentSteps.find((step) => step.id === 'candidate')
  const verifierStep = store.agentSteps.find((step) => step.id === 'verifier')
  const intentThoughts = intentStep?.thinkingSteps?.slice(-3) ?? []
  const candidateToolCalls = candidateStep?.toolCalls ?? []
  const verifierToolCalls = verifierStep?.toolCalls ?? []

  const hasPlans = store.plans.length > 0 && store.orderState === 'TOTAL_COMPUTED'
  const isConfirmation =
    (store.orderState === 'DRAFT_ORDER_CREATED' || store.orderState === 'WAIT_USER_PAYMENT_CONFIRMATION') &&
    !!store.draftOrder
  const isProcessing = store.orderState !== 'IDLE' && !hasPlans && !isConfirmation
  const isLanding = store.orderState === 'IDLE' && store.guidedChat.messages.length === 0
  const showConfirmToSearch = chatMode === 'multi' && store.guidedChat.readyToSearch && store.orderState === 'IDLE'

  useEffect(() => {
    // NOTE: avoid depending on entire zustand store object (changes often)
    useShoppingStore.getState().checkConnection()
  }, [])

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [store.guidedChat.messages, store.guidedChat.streamingContent, hasPlans, isProcessing, isConfirmation])

  // Auto-expand when processing starts, auto-collapse when plans are ready
  // But respect user's manual toggle choice
  useEffect(() => {
    if (isProcessing && thinkingCollapsed && !userToggledThinking.current) {
      // Expand when processing starts (unless user manually collapsed)
      setThinkingCollapsed(false)
    } else if (hasPlans && !thinkingCollapsed && !userToggledThinking.current) {
      // Collapse when plans are ready (unless user manually expanded)
      setThinkingCollapsed(true)
    }
  }, [isProcessing, hasPlans, thinkingCollapsed])

  // Reset manual toggle flag when starting a new process
  useEffect(() => {
    if (store.orderState === 'IDLE') {
      userToggledThinking.current = false
    }
  }, [store.orderState])

  const handleChatSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (store.orderState !== 'IDLE') return
      if (!chatInput.trim() && chatImages.length === 0) return

      const message = chatInput.trim()
      const images = [...chatImages]
      setChatInput('')
      setChatImages([])
      if (chatMode === 'single') {
        // 一句话模式：先显示用户消息，再启动 agent
        store.addUserMessage(message, images)
        store.setQuery(message)
        store.setOrderState('MISSION_READY')
        await store.startAgentProcess()
        return
      }
      await store.sendGuidedMessage(message, images)
    },
    [chatInput, chatImages, chatMode, store],
  )

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (store.orderState !== 'IDLE') return
      const files = e.target.files
      if (!files) return

      Array.from(files).forEach((file) => {
        if (!file.type.startsWith('image/')) return
        if (chatImages.length >= 4) return

        const reader = new FileReader()
        reader.onload = (event) => {
          const base64 = (event.target?.result as string)?.split(',')[1]
          if (base64) {
            setChatImages((prev) => [...prev, base64].slice(0, 4))
          }
        }
        reader.readAsDataURL(file)
      })

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [chatImages.length, store.orderState],
  )

  const handleConfirmChat = useCallback(() => {
    store.confirmGuidedChat()
    store.startAgentProcess()
  }, [store])

  const handleFollowUpSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!followUpQuery.trim()) return
      store.setQuery(followUpQuery)
      setFollowUpQuery('')
      store.setOrderState('MISSION_READY')
      await store.startAgentProcess()
    },
    [followUpQuery, store],
  )

  const handleSelectPlan = useCallback(
    (plan: typeof store.plans[0]) => {
      store.selectPlan(plan)
    },
    [store],
  )

  const handleReset = useCallback(() => {
    store.reset()
    store.resetGuidedChat()
    setChatInput('')
    setChatImages([])
    setFollowUpQuery('')
    setViewMode('cards')
  }, [store])

  return (
    <main className="min-h-screen bg-[#f8f8f6]">
      <div className={cn(
        "relative mx-auto px-4",
        isLanding ? "max-w-3xl py-0" : "max-w-4xl py-6 pb-32"
      )}>
        {store.error && (
          <ErrorAlert
            error={store.error}
            errorCode={store.errorCode}
            onDismiss={() => store.setError(null)}
          />
        )}

        <div className="space-y-4">
          {isLanding ? (
            <div className="min-h-screen flex flex-col items-center justify-center gap-8">
              {/* Logo and Title - Perplexity Style */}
              <div className="flex items-center gap-2">
                <span className="text-4xl md:text-5xl font-light text-[#2d3436] tracking-tight">AI Shopping</span>
                <span className="text-4xl md:text-5xl font-medium text-[#20b8cd] tracking-tight">Agent</span>
              </div>

              {/* Main Input Box - Perplexity Style */}
              <form onSubmit={handleChatSubmit} className="w-full">
                <div className="rounded-2xl border border-[#e0e0de] bg-white shadow-sm overflow-hidden">
                  {/* Text Input */}
                  <div className="px-4 pt-4 pb-2">
                    <Textarea
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleChatSubmit(e)
                        }
                      }}
                      placeholder="询问任何事。输入 @ 以提及和 / 以使用快捷方式。"
                      disabled={store.guidedChat.isStreaming || store.orderState !== 'IDLE'}
                      className="min-h-[60px] resize-none text-base bg-transparent border-0 focus-visible:ring-0 px-0 text-[#2d3436] placeholder:text-[#9a9a98]"
                    />
                  </div>

                  {/* Uploaded Images Preview */}
                  {chatImages.length > 0 && (
                    <div className="px-4 pb-2 flex flex-wrap gap-2">
                      {chatImages.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#e0e0de] bg-[#f5f5f3]">
                            <Image src={`data:image/jpeg;base64,${img}`} alt={`Upload ${idx + 1}`} fill className="object-cover" />
                          </div>
                          <button
                            onClick={() => setChatImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            type="button"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bottom Bar with Mode Icons and Action Icons */}
                  <div className="flex items-center justify-between px-3 py-3">
                    {/* Left: Mode Selection Icons */}
                    <TooltipProvider>
                      <div className="flex items-center rounded-xl bg-[#f5f5f3] p-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setChatMode('multi')}
                              className={cn(
                                'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                                chatMode === 'multi'
                                  ? 'bg-white text-[#20b8cd] shadow-sm'
                                  : 'text-[#6b6c6c] hover:text-[#2d3436]',
                              )}
                            >
                              <MessageCircle className="w-5 h-5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            多轮对话：通过追问澄清需求
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setChatMode('single')}
                              className={cn(
                                'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                                chatMode === 'single'
                                  ? 'bg-white text-[#20b8cd] shadow-sm'
                                  : 'text-[#6b6c6c] hover:text-[#2d3436]',
                              )}
                            >
                              <Sparkles className="w-5 h-5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            一句话模式：直接启动意图推理
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>

                    {/* Right: Utility Icons */}
                    <TooltipProvider>
                      <div className="flex items-center gap-1">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={chatImages.length >= 4 || store.guidedChat.isStreaming || store.orderState !== 'IDLE'}
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#6b6c6c] hover:bg-[#f5f5f3] hover:text-[#2d3436] transition-colors disabled:opacity-50"
                            >
                              <ImagePlus className="w-5 h-5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            上传图片 (最多4张)
                          </TooltipContent>
                        </Tooltip>

                        <button
                          type="submit"
                          disabled={store.orderState !== 'IDLE' || (!chatInput.trim() && chatImages.length === 0) || store.guidedChat.isStreaming}
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#20b8cd] text-white hover:bg-[#1aa3b6] transition-colors disabled:opacity-50"
                        >
                          {store.guidedChat.isStreaming ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Send className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </TooltipProvider>
                  </div>
                </div>
              </form>

              {/* Quick Start Buttons - Shopping Related */}
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { icon: <ShoppingCart className="w-4 h-4" />, label: '帮我比价', query: '帮我找最便宜的iPhone 15' },
                  { icon: <Search className="w-4 h-4" />, label: '找同款', query: '帮我找这张图片的同款商品' },
                  { icon: <Star className="w-4 h-4" />, label: '礼物推荐', query: '送给妈妈的生日礼物推荐' },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setChatInput(item.query)
                      chatInputRef.current?.focus()
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#e0e0de] bg-white text-[#5a5a58] hover:bg-[#f5f5f3] hover:text-[#2d3436] hover:border-[#d0d0ce] transition-colors text-sm shadow-sm"
                    type="button"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div ref={chatContainerRef} className="pb-40 space-y-4">
                {store.guidedChat.messages.length === 0 && !isProcessing && (
                  <div className="text-sm text-[#6b6c6c] leading-relaxed">
                    Hi! I&apos;m your AI shopping assistant. What would you like to buy today? Feel free to share images too!
                  </div>
                )}

                {store.guidedChat.messages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}

                {store.guidedChat.isStreaming &&
                  store.guidedChat.messages.length > 0 &&
                  !store.guidedChat.messages[store.guidedChat.messages.length - 1]?.isStreaming && (
                    <div className="text-xs text-[#9a9a98]">AI is typing…</div>
                  )}

                {showConfirmToSearch && (
                  <div className="mt-3 flex flex-col items-center gap-2 text-center">
                    <span className="text-sm text-[#5a5a58]">I can proceed to find plans based on your chat.</span>
                    <Button
                      onClick={handleConfirmChat}
                      disabled={store.guidedChat.isStreaming}
                      rightIcon={<ChevronRight className="w-4 h-4" />}
                      className="mx-auto"
                    >
                      Confirm and continue
                    </Button>
                  </div>
                )}

            {(isProcessing || hasPlans) && (
              <div className="mt-4">
                {/* Perplexity-style Collapsible Progress Header */}
                <button
                  type="button"
                  onClick={() => {
                    userToggledThinking.current = true
                    setThinkingCollapsed(!thinkingCollapsed)
                  }}
                  className={cn(
                    "flex items-center gap-2 text-sm transition-colors mb-4 px-2 py-1 -ml-2 rounded-lg",
                    thinkingCollapsed 
                      ? "text-[#5a5a58] hover:text-[#2d3436] hover:bg-[#f5f5f3]" 
                      : "text-[#2d3436] hover:bg-[#f5f5f3]"
                  )}
                >
                  <ChevronRight className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    thinkingCollapsed ? "rotate-0" : "rotate-90"
                  )} />
                  <span className="font-medium">
                    {isProcessing ? '思考中' : '已完成'} {(() => {
                      // 优先根据 agentSteps 的 completed 状态计算完成步骤数
                      const completedSteps = store.agentSteps.filter(s => s.status === 'completed').length
                      if (completedSteps > 0) return completedSteps
                      // 如果没有完成的步骤，fallback 到旧逻辑
                      return Math.max(1, intentThoughts.length + candidateToolCalls.length + (verifierToolCalls.length > 0 ? 1 : 0))
                    })()} 步
                  </span>
                  {isProcessing && (
                    <Loader2 className="w-3.5 h-3.5 text-[#20b8cd] animate-spin ml-1" />
                  )}
                  {hasPlans && !isProcessing && (
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-1" />
                  )}
                </button>

                {/* Timeline Container - Collapsible */}
                {!thinkingCollapsed && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Step 1: Intent Analysis */}
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#5a5a58]" />
                        <div className="w-0.5 flex-1 bg-[#e0e0de] mt-2" />
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-sm text-[#2d3436] leading-relaxed">
                          我将分析您的需求并搜索「{store.query || '商品'}」相关信息。
                        </p>
                        {intentThoughts.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {intentThoughts.slice(0, 3).map((thought) => (
                              <p key={thought.id} className="text-xs text-[#6b6c6c]">
                                - {thought.text}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Searching */}
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#5a5a58]" />
                        <div className="w-0.5 flex-1 bg-[#e0e0de] mt-2" />
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-sm text-[#2d3436] mb-3">正在搜索商品信息和价格数据。</p>
                        <p className="text-xs text-[#9a9a98] mb-2">搜索中</p>
                        <div className="flex flex-wrap gap-2">
                          {candidateToolCalls.length > 0 ? (
                            candidateToolCalls.map((tool) => {
                              const query = extractQueryFromInput(tool.input)
                              return (
                                <div
                                  key={tool.id}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-[#e0e0de] text-sm text-[#2d3436]"
                                >
                                  <Search className="w-4 h-4 text-[#9a9a98]" />
                                  <span>{truncateText(query || tool.input, 40)}</span>
                                </div>
                              )
                            })
                          ) : (
                            <>
                              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-[#e0e0de] text-sm text-[#2d3436]">
                                <Search className="w-4 h-4 text-[#9a9a98]" />
                                <span>{store.query || '商品搜索'}</span>
                              </div>
                              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-[#e0e0de] text-sm text-[#2d3436]">
                                <Search className="w-4 h-4 text-[#9a9a98]" />
                                <span>价格对比分析</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Reviewing Sources - Real Verifier Data */}
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          verifierToolCalls.length > 0 || candidateToolCalls.length > 0 ? "bg-[#5a5a58]" : "bg-[#e0e0de]"
                        )} />
                        <div className="w-0.5 flex-1 bg-[#e0e0de] mt-2" />
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-xs text-[#9a9a98] mb-3">正在审核来源</p>
                        <div className="space-y-2">
                          {verifierToolCalls.length > 0 ? (
                            verifierToolCalls.map((tool) => (
                              <div
                                key={tool.id}
                                className="flex items-center gap-3 py-1.5"
                              >
                                <Shield className="w-4 h-4 text-[#9a9a98]" />
                                <span className="flex-1 text-sm text-[#2d3436]">
                                  {truncateText(tool.name || tool.input || 'Verifying source', 50)}
                                </span>
                                <span className="text-xs text-[#9a9a98]">
                                  {tool.status === 'success' ? 'verified' : 'verifying'}
                                </span>
                              </div>
                            ))
                          ) : (
                            <>
                              <div className="flex items-center gap-3 py-1.5">
                                <ExternalLink className="w-4 h-4 text-[#9a9a98]" />
                                <span className="flex-1 text-sm text-[#2d3436]">商品详情页数据</span>
                                <span className="text-xs text-[#9a9a98]">xoobay.com</span>
                              </div>
                              <div className="flex items-center gap-3 py-1.5">
                                <Store className="w-4 h-4 text-[#9a9a98]" />
                                <span className="flex-1 text-sm text-[#2d3436]">店铺信誉与评分</span>
                                <span className="text-xs text-[#9a9a98]">store.xoobay.com</span>
                              </div>
                              <div className="flex items-center gap-3 py-1.5">
                                <Receipt className="w-4 h-4 text-[#9a9a98]" />
                                <span className="flex-1 text-sm text-[#2d3436]">价格与运费信息</span>
                                <span className="text-xs text-[#9a9a98]">price.xoobay.com</span>
                              </div>
                              <div className="flex items-center gap-3 py-1.5">
                                <Clock className="w-4 h-4 text-[#9a9a98]" />
                                <span className="flex-1 text-sm text-[#2d3436]">库存与发货时效</span>
                                <span className="text-xs text-[#9a9a98]">logistics.xoobay.com</span>
                              </div>
                              <div className="flex items-center gap-3 py-1.5">
                                <Star className="w-4 h-4 text-[#9a9a98]" />
                                <span className="flex-1 text-sm text-[#2d3436]">用户评价分析</span>
                                <span className="text-xs text-[#9a9a98]">reviews.xoobay.com</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Step 4: Generating Plans */}
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          hasPlans ? "bg-[#5a5a58]" : store.isStreaming ? "bg-[#20b8cd] animate-pulse" : "bg-[#e0e0de]"
                        )} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-[#2d3436]">
                          {hasPlans ? '已生成购物方案' : store.isStreaming ? '正在生成购物方案...' : '等待生成方案'}
                        </p>
                        {store.isStreaming && !hasPlans && (
                          <div className="mt-2 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-[#20b8cd] animate-spin" />
                            <span className="text-xs text-[#9a9a98]">AI 正在分析最优选择</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {store.orderState === 'WAITING_USER_INPUT' && store.lastAgentMessage && (
                  <div className="mt-3">
                    <div className="text-sm text-surface-700 whitespace-pre-wrap leading-relaxed bg-surface-50 rounded-lg p-3 border border-surface-200">
                      {store.lastAgentMessage}
                    </div>
                    <form onSubmit={handleFollowUpSubmit} className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={followUpQuery}
                        onChange={(e) => setFollowUpQuery(e.target.value)}
                        placeholder="Type your response here..."
                        className="flex-1 px-4 py-3 rounded-xl border border-surface-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-800"
                      />
                      <Button type="submit" disabled={!followUpQuery.trim()}>
                        <Send className="w-4 h-4 mr-2" />
                        Send
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {hasPlans && (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-semibold">Choose a plan</div>
                    <div className="text-xs text-surface-500">We found {store.plans.length} options</div>
                  </div>
                  <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-xl">
                    <button
                      onClick={() => setViewMode('cards')}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                        viewMode === 'cards' ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-500 hover:text-surface-700',
                      )}
                      type="button"
                    >
                      <LayoutGrid className="w-4 h-4" />
                      <span className="hidden sm:inline">Cards</span>
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                        viewMode === 'table' ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-500 hover:text-surface-700',
                      )}
                      type="button"
                    >
                      <Table2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Compare</span>
                    </button>
                  </div>
                </div>

                {store.aiRecommendation && (
                  <div className="mb-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-primary-600" />
                      <span className="text-sm font-semibold text-primary-700">AI Recommendation</span>
                      <Badge variant="success" className="text-xs">
                        {Math.round(store.aiRecommendation.confidence * 100)}%
                      </Badge>
                    </div>
                    <div className="text-sm text-surface-600">{store.aiRecommendation.reason}</div>
                  </div>
                )}

                {viewMode === 'table' ? (
                  <ComparisonTable plans={store.plans} onSelectPlan={handleSelectPlan} />
                ) : (
                  <div className="grid gap-3">
                    {store.plans.map((plan) => (
                      <Card
                        key={plan.name}
                        interactive
                        onClick={() => handleSelectPlan(plan)}
                        className={cn('p-4 relative', plan.recommended && 'ring-2 ring-primary-200')}
                      >
                        {plan.recommended && (
                          <div className="absolute -top-3 left-4 px-3 py-1.5 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full text-xs text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-primary-500/20">
                            <Sparkles className="w-3 h-3" />
                            AI Recommended
                          </div>
                        )}

                        <div className="flex items-start gap-4">
                          <ProductImage
                            imageUrl={plan.product.imageUrl}
                            fallbackEmoji={plan.emoji}
                            alt={plan.product.title}
                            size="lg"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="font-semibold text-surface-800 truncate">{plan.name}</div>
                              <Badge variant={plan.type === 'cheapest' ? 'success' : plan.type === 'fastest' ? 'info' : 'warning'} className="text-[10px]">
                                {plan.type.replace('_', ' ')}
                              </Badge>
                              {plan.recommended && <Star className="w-4 h-4 text-warning-500 fill-warning-500" />}
                            </div>
                            <div className="text-xs text-surface-500 truncate">{plan.product.title}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-surface-600">
                              <span className="font-semibold text-surface-800">${plan.total}</span>
                              <span className={cn('font-semibold', plan.shipping === 0 ? 'text-success-600' : 'text-surface-700')}>
                                {plan.shipping === 0 ? 'FREE shipping' : `$${plan.shipping} shipping`}
                              </span>
                              <span className={cn('font-semibold', getTaxConfidenceColor(plan.tax.confidence))}>${plan.tax.amount} tax</span>
                              <span className="text-surface-500">{plan.deliveryDays}</span>
                            </div>
                            {plan.product.productUrl && (
                              <div className="mt-2">
                                <ProductLink url={plan.product.productUrl} storeName={plan.product.storeName} />
                              </div>
                            )}
                            {plan.product.complianceRisks.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {plan.product.complianceRisks.slice(0, 4).map((risk, i) => (
                                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warning-50 border border-warning-200 rounded-lg text-[11px]">
                                    <span>{getComplianceIcon(risk.type)}</span>
                                    <span className="text-warning-700 font-medium">{risk.message}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="w-5 h-5 text-surface-300 mt-1" />
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <Button variant="outline" onClick={handleReset} className="w-full">
                    Start Over
                  </Button>
                </div>
              </div>
            )}

            {isConfirmation && store.draftOrder && (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-sm font-semibold">Draft order</div>
                  <Badge variant="info" className="text-xs">
                    Created
                  </Badge>
                </div>

                <Card className="overflow-hidden">
                    <div className="p-4 border-b border-surface-100 bg-surface-50">
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

                    <div className="p-4 border-b border-surface-100">
                      <div className="flex items-center gap-4">
                        <ProductImage
                          imageUrl={store.draftOrder.plan.product.imageUrl}
                          fallbackEmoji={store.draftOrder.plan.product.image}
                          alt={store.draftOrder.plan.product.title}
                          size="xl"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-surface-800 font-semibold text-base truncate">{store.draftOrder.plan.product.title}</h3>
                          <p className="text-surface-500 text-sm">
                            {store.draftOrder.plan.product.brand} · ★ {store.draftOrder.plan.product.rating}
                          </p>
                          {store.draftOrder.plan.product.shortDescription && (
                            <p className="text-surface-400 text-xs mt-1">{store.draftOrder.plan.product.shortDescription}</p>
                          )}
                          {store.draftOrder.plan.product.productUrl && (
                            <div className="mt-2">
                              <ProductLink url={store.draftOrder.plan.product.productUrl} storeName={store.draftOrder.plan.product.storeName} />
                            </div>
                          )}
                        </div>
                        <div className="text-surface-800 font-bold text-lg">${store.draftOrder.plan.product.price}</div>
                      </div>
                    </div>

                    <div className="p-4 border-b border-surface-100">
                      <h4 className="text-surface-800 font-semibold mb-3 flex items-center gap-2 text-sm">
                        <Receipt className="w-4 h-4" />
                        Tax & Duty Estimate
                      </h4>
                      <div className="space-y-2 text-sm">
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
                        <div className="flex justify-between pt-2 border-t border-surface-100">
                          <span className="text-surface-700 font-medium">Total Tax</span>
                          <div className="flex items-center gap-2">
                            <span className="text-surface-800 font-bold">${store.draftOrder.plan.tax.amount}</span>
                            <Badge
                              variant={
                                store.draftOrder.plan.tax.confidence === 'high'
                                  ? 'success'
                                  : store.draftOrder.plan.tax.confidence === 'medium'
                                    ? 'warning'
                                    : 'danger'
                              }
                            >
                              {store.draftOrder.plan.tax.confidence}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {store.draftOrder.plan.product.complianceRisks.length > 0 && (
                      <div className="p-4 border-b border-surface-100 bg-warning-50/50">
                        <h4 className="text-surface-800 font-semibold mb-3 flex items-center gap-2 text-sm">
                          <Shield className="w-4 h-4 text-warning-600" />
                          Compliance Information
                        </h4>
                        <div className="space-y-2">
                          {store.draftOrder.plan.product.complianceRisks.map((risk, i) => (
                            <div key={i} className="flex items-start gap-2 p-3 rounded-xl border border-warning-200 bg-white">
                              <span className="text-xl">{getComplianceIcon(risk.type)}</span>
                              <div>
                                <p className="text-warning-700 font-semibold capitalize text-sm">{risk.type}</p>
                                <p className="text-surface-600 text-sm">{risk.message}</p>
                                {risk.mitigation && <p className="text-success-600 text-sm mt-1 font-medium">✓ {risk.mitigation}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-4 space-y-2 border-b border-surface-100">
                      <div className="flex justify-between text-surface-500 text-sm">
                        <span>Subtotal</span>
                        <span className="font-medium">${store.draftOrder.plan.product.price}</span>
                      </div>
                      <div className="flex justify-between text-surface-500 text-sm">
                        <span>Shipping</span>
                        <span className="font-medium">
                          {store.draftOrder.plan.shipping === 0 ? 'FREE' : `$${store.draftOrder.plan.shipping}`}
                        </span>
                      </div>
                      <div className="flex justify-between text-surface-500 text-sm">
                        <span>Tax & Duty</span>
                        <span className="font-medium">${store.draftOrder.plan.tax.amount}</span>
                      </div>
                      <div className="h-px bg-surface-200 my-3" />
                      <div className="flex justify-between text-lg font-bold text-surface-800">
                        <span>Total</span>
                        <span>${store.draftOrder.plan.total}</span>
                      </div>
                    </div>

                    <div className="p-4 border-b border-surface-100">
                      <h4 className="text-surface-800 font-semibold mb-3 flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-primary-500" />
                        Required Confirmations
                      </h4>
                      <div className="space-y-3">
                        {store.draftOrder.confirmationItems.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              'p-3 rounded-xl border',
                              item.checked ? 'border-success-200 bg-success-50/40' : 'border-surface-200 bg-white',
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox id={item.id} checked={item.checked} onCheckedChange={() => store.toggleConfirmation(item.id)} />
                              <div className="flex-1">
                                <label htmlFor={item.id} className="text-surface-800 font-medium cursor-pointer flex items-center gap-2">
                                  {item.title}
                                  {item.required && <span className="text-danger-500 text-xs font-semibold">*Required</span>}
                                </label>
                                <p className="text-surface-500 text-sm mt-1">{item.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 bg-surface-50">
                      <div className="flex items-center gap-2 text-surface-400 text-sm">
                        <Info className="w-4 h-4" />
                        <span>
                          Evidence: <code className="text-primary-600 font-mono">{store.draftOrder.evidenceSnapshotId}</code>
                        </span>
                      </div>
                    </div>
                  </Card>

                <Alert variant="warning" className="mt-4">
                    <AlertTriangle className="w-5 h-5" />
                    <AlertTitle>Payment Not Captured</AlertTitle>
                    <AlertDescription>Check all required boxes to proceed to payment.</AlertDescription>
                </Alert>

                <div className="mt-4 flex gap-3">
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    Start New Search
                  </Button>
                  <Button disabled={!store.canProceedToPayment()} className="flex-1" leftIcon={<ShoppingCart className="w-5 h-5" />}>
                    Proceed to Payment
                  </Button>
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>

      {/* Fixed Bottom Input Bar - Chat View Only */}
      {!isLanding && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#f8f8f6]/95 backdrop-blur-xl border-t border-[#e0e0de]">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <ImagePreview images={chatImages} onRemove={(idx) => setChatImages((prev) => prev.filter((_, i) => i !== idx))} />

            <form onSubmit={handleChatSubmit} className="w-full">
              <div className="rounded-2xl border border-[#e0e0de] bg-white shadow-sm overflow-hidden">
                <div className="flex items-end gap-2 p-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />

                  <div className="flex-1 min-w-0">
                    <Textarea
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleChatSubmit(e)
                        }
                      }}
                      placeholder={store.orderState === 'IDLE' ? '输入您的问题...' : '处理中，请等待完成后继续'}
                      disabled={store.guidedChat.isStreaming || store.orderState !== 'IDLE'}
                      className="min-h-[44px] max-h-[120px] resize-none text-sm bg-transparent border-0 focus-visible:ring-0 px-0"
                    />
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={chatImages.length >= 4 || store.guidedChat.isStreaming || store.orderState !== 'IDLE'}
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#6b6c6c] hover:bg-[#f5f5f3] hover:text-[#2d3436] transition-colors disabled:opacity-50"
                          >
                            <ImagePlus className="w-5 h-5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">上传图片</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <button
                      type="submit"
                      disabled={store.orderState !== 'IDLE' || (!chatInput.trim() && chatImages.length === 0) || store.guidedChat.isStreaming}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#20b8cd] text-white hover:bg-[#1aa3b6] transition-colors disabled:opacity-50"
                    >
                      {store.guidedChat.isStreaming ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer - Landing Page Only */}
      {isLanding && (
        <footer className="fixed bottom-0 left-0 right-0 py-4 border-t border-[#e0e0de] bg-[#f8f8f6]/90 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between text-sm text-[#9a9a98]">
            <span className="font-medium">Multi-AI-Agent4OnlineShopping © 2024</span>
            <span className="font-medium text-[#6b6c6c]">Powered by Multi-Agent Shopping</span>
          </div>
        </footer>
      )}
    </main>
  )
}
