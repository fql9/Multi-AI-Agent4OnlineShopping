"use client"

import { useEffect, useState } from "react"
import { RefreshCw, Server, Bot, Wrench, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { checkConnectionStatus, type ConnectionStatus as ConnectionStatusType } from "@/lib/api"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface Props {
  className?: string
  showDetails?: boolean
}

export function ConnectionStatus({ className, showDetails = false }: Props) {
  const [status, setStatus] = useState<ConnectionStatusType | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  const checkStatus = async () => {
    setIsChecking(true)
    try {
      const result = await checkConnectionStatus()
      setStatus(result)
    } catch (error) {
      console.error("Failed to check connection status:", error)
      setStatus({
        agent: "disconnected",
        toolGateway: "disconnected",
        lastChecked: new Date(),
      })
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkStatus()
    // 每 30 秒检查一次
    const interval = setInterval(checkStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const isFullyConnected = status?.agent === "connected" && status?.toolGateway === "connected"
  const isPartiallyConnected = status?.agent === "connected" || status?.toolGateway === "connected"

  if (showDetails) {
    return (
      <div className={cn("p-4 rounded-xl bg-white border border-surface-200 shadow-sm", className)}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-surface-700 flex items-center gap-2">
            <Server className="w-4 h-4" />
            后端服务状态
          </h3>
          <button
            onClick={checkStatus}
            disabled={isChecking}
            className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500 hover:text-surface-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isChecking && "animate-spin")} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Agent Service */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-surface-500" />
              <span className="text-sm text-surface-600">Agent API</span>
            </div>
            <StatusIndicator status={status?.agent || "unknown"} />
          </div>

          {/* Tool Gateway */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-surface-500" />
              <span className="text-sm text-surface-600">Tool Gateway</span>
            </div>
            <StatusIndicator status={status?.toolGateway || "unknown"} />
          </div>
        </div>

        {status?.agentVersion && (
          <div className="mt-3 pt-3 border-t border-surface-100">
            <span className="text-xs text-surface-400">
              Agent v{status.agentVersion}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={checkStatus}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
              isFullyConnected
                ? "text-success-700 bg-success-50 border-success-200 hover:bg-success-100"
                : isPartiallyConnected
                ? "text-warning-700 bg-warning-50 border-warning-200 hover:bg-warning-100"
                : "text-danger-700 bg-danger-50 border-danger-200 hover:bg-danger-100",
              className
            )}
          >
            {isChecking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Server className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {isFullyConnected ? "服务正常" : isPartiallyConnected ? "部分连接" : "服务离线"}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="p-3">
          <div className="space-y-2 min-w-[180px]">
            <div className="text-xs font-semibold text-surface-500 mb-2">后端服务状态</div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-sm">Agent API</span>
              </div>
              <StatusBadge status={status?.agent || "unknown"} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Wrench className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-sm">Tool Gateway</span>
              </div>
              <StatusBadge status={status?.toolGateway || "unknown"} />
            </div>
            {status?.agentVersion && (
              <div className="pt-2 mt-2 border-t border-surface-100">
                <span className="text-xs text-surface-400">
                  版本: v{status.agentVersion}
                </span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function StatusIndicator({ status }: { status: "connected" | "disconnected" | "unknown" }) {
  return (
    <div className="flex items-center gap-2">
      <StatusDot status={status} />
      <span
        className={cn(
          "text-xs font-medium",
          status === "connected" && "text-success-600",
          status === "disconnected" && "text-danger-600",
          status === "unknown" && "text-surface-400"
        )}
      >
        {status === "connected" ? "已连接" : status === "disconnected" ? "未连接" : "检测中..."}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: "connected" | "disconnected" | "unknown" }) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
      status === "connected" && "bg-success-100 text-success-700",
      status === "disconnected" && "bg-danger-100 text-danger-700",
      status === "unknown" && "bg-surface-100 text-surface-500"
    )}>
      {status === "connected" ? (
        <CheckCircle className="w-3 h-3" />
      ) : status === "disconnected" ? (
        <XCircle className="w-3 h-3" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin" />
      )}
      <span>{status === "connected" ? "正常" : status === "disconnected" ? "离线" : "..."}</span>
    </div>
  )
}

function StatusDot({ status }: { status: "connected" | "disconnected" | "unknown" }) {
  return (
    <div
      className={cn(
        "w-2 h-2 rounded-full",
        status === "connected" && "bg-success-500 animate-pulse",
        status === "disconnected" && "bg-danger-500",
        status === "unknown" && "bg-surface-300"
      )}
    />
  )
}
