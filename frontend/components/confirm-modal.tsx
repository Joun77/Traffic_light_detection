"use client"

import { X, AlertCircle } from "lucide-react"

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  subDescription?: string
  confirmText?: string
  cancelText?: string
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  subDescription,
  confirmText = "ຕົກລົງ",
  cancelText = "ຍົກເລີກ"
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      {/* Modal Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-sky-400/20 bg-card/95 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sky-400/10 p-5 bg-sky-400/5">
          <div className="flex items-center gap-2 text-sky-400">
            <AlertCircle className="size-6" />
            <h3 className="text-xl font-bold">{title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="rounded-full p-2 text-white/40 hover:bg-sky-400/10 hover:text-sky-400 transition-all"
          >
            <X className="size-6" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-8 text-center">
          <p className="text-lg font-medium text-foreground">{description}</p>
          {subDescription && (
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {subDescription}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 p-5 border-t border-sky-400/10 bg-sky-400/5">
          <button 
            onClick={onConfirm}
            className="flex-1 rounded-2xl bg-sky-400 py-4 text-lg font-bold text-white transition-all hover:bg-sky-500 hover:scale-[1.02] shadow-lg shadow-sky-400/20"
          >
            {confirmText}
          </button>
          <button 
            onClick={onClose}
            className="flex-1 rounded-2xl bg-panel py-4 text-lg font-bold text-panel-foreground transition-all hover:bg-panel/80"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  )
}
