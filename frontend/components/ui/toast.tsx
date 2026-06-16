"use client"

import { useEffect } from "react"
import { CheckCircle2, AlertCircle, X, Info, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export type ToastType = "success" | "error" | "info" | "warning"

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose: () => void
}

export function Toast({ message, type = "success", duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  const icons = {
    success: <CheckCircle2 className="size-5" />,
    error: <AlertCircle className="size-5" />,
    info: <Info className="size-5" />,
    warning: <AlertTriangle className="size-5" />,
  }

  const styles = {
    success: "bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/40",
    error: "bg-rose-500 border-rose-400 text-white shadow-rose-500/40",
    info: "bg-sky-500 border-sky-400 text-white shadow-sky-500/40",
    warning: "bg-amber-500 border-amber-400 text-white shadow-amber-500/40",
  }

  return (
    <div className={cn(
      "fixed top-10 right-10 z-[300] flex items-center gap-3 px-8 py-4 rounded-2xl shadow-2xl border-2 animate-in slide-in-from-right-10 fade-in zoom-in-95 duration-300",
      styles[type]
    )}>
      <div className="bg-white/20 p-1.5 rounded-xl">
        {icons[type]}
      </div>
      <span className="font-black text-sm uppercase tracking-widest whitespace-nowrap">{message}</span>
      <button 
        onClick={onClose} 
        className="ml-4 p-1 hover:bg-white/20 rounded-lg transition-all opacity-50 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
