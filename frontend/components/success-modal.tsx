"use client"

import { CheckCircle2, X } from "lucide-react"

interface SuccessModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description: string
  buttonText?: string
}

export function SuccessModal({
  isOpen,
  onClose,
  title,
  description,
  buttonText = "ຕົກລົງ"
}: SuccessModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      {/* Modal Card */}
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-sky-400/20 bg-card/95 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in duration-300">
        {/* Decorative Top Bar */}
        <div className="h-2 bg-sky-400" />
        
        <div className="flex justify-end p-4">
          <button 
            onClick={onClose}
            className="rounded-full p-1 text-white/40 hover:bg-sky-400/10 hover:text-sky-400 transition-all"
          >
            <X className="size-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="px-8 pb-8 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sky-400/10 text-sky-400 shadow-inner shadow-sky-400/20">
            <CheckCircle2 className="size-12" />
          </div>
          
          <h3 className="mb-2 text-2xl font-black text-foreground">{title}</h3>
          <p className="text-muted-foreground font-medium leading-relaxed">
            {description}
          </p>

          <button 
            onClick={onClose}
            className="mt-8 w-full rounded-2xl bg-sky-400 py-4 text-lg font-bold text-white transition-all hover:bg-sky-500 hover:scale-[1.02] shadow-lg shadow-sky-400/20"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  )
}
