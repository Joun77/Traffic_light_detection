"use client"

import { Loader2, X, CloudUpload } from "lucide-react"

interface UploadLoadingModalProps {
  isOpen: boolean
  onCancel: () => void
}

export function UploadLoadingModal({ isOpen, onCancel }: UploadLoadingModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-white/10 p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center gap-8 max-w-md w-full relative overflow-hidden">
        
        {/* Decoration */}
        <div className="absolute -top-10 -right-10 size-40 bg-sky-500/10 blur-3xl rounded-full" />
        
        <div className="relative">
          <div className="size-24 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <CloudUpload className="size-8 text-sky-400 animate-bounce" />
          </div>
        </div>

        <div className="text-center space-y-2 relative z-10">
          <h3 className="text-2xl font-black text-white uppercase tracking-tighter">ກຳລັງອັບໂຫຼດວິດີໂອ...</h3>
          <p className="text-slate-400 text-sm font-medium">
            ລະບົບກຳລັງປະມວນຜົນ ແລະ ແປງໄຟລ໌ວິດີໂອ <br/> 
            ກະລຸນາລໍຖ້າຈົນກວ່າຈະສຳເລັດ
          </p>
        </div>

        <button 
          onClick={onCancel}
          className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-all font-black text-xs uppercase tracking-widest border border-white/5 active:scale-95"
        >
          <X className="size-4" />
          ຍົກເລີກການອັບໂຫຼດ
        </button>
      </div>
    </div>
  )
}
