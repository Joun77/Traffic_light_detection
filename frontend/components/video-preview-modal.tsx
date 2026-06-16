"use client"

import { useRef, useState } from "react"
import { X, Play, Pause, RotateCcw, FastForward, Rewind, Save, Trash2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface VideoPreviewModalProps {
  isOpen: boolean
  videoUrl: string | null
  onClose: () => void
  onSave: () => void
  onCancel: () => void
}

export function VideoPreviewModal({ isOpen, videoUrl, onClose, onSave, onCancel }: VideoPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  if (!isOpen || !videoUrl) return null

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause()
      else videoRef.current.play()
      setIsPlaying(!isPlaying)
    }
  }

  const seek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds
    }
  }

  const handleReset = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/95 p-6 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative max-w-5xl w-full bg-panel rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center gap-4 text-sky-400">
            <div className="p-3 bg-sky-500/10 rounded-2xl"><Play className="size-6 fill-current" /></div>
            <div>
              <h3 className="font-black text-2xl uppercase tracking-tighter text-white">Video Preview</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">ກວດສອບຄວາມຖືກຕ້ອງກ່ອນບັນທຶກ</p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
          >
            <X className="size-6" />
          </button>
        </div>

        {/* Video Area */}
        <div className="bg-black aspect-video relative flex items-center justify-center group">
          <video 
            ref={videoRef} 
            src={videoUrl} 
            className="w-full h-full max-h-[60vh] object-contain"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          
          {/* Custom Overlay Controls */}
          <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col gap-4">
            <div className="flex items-center justify-center gap-6">
              <button onClick={() => seek(-10)} className="p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all active:scale-90">
                <Rewind className="size-6" />
              </button>
              
              <button onClick={togglePlay} className="p-6 bg-sky-500 hover:bg-sky-600 rounded-full text-white shadow-2xl shadow-sky-500/40 transition-all active:scale-90">
                {isPlaying ? <Pause className="size-8 fill-current" /> : <Play className="size-8 fill-current" />}
              </button>

              <button onClick={() => seek(10)} className="p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all active:scale-90">
                <FastForward className="size-6" />
              </button>

              <button onClick={handleReset} className="p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all active:scale-90">
                <RotateCcw className="size-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-8 bg-slate-900/80 border-t border-white/5 flex gap-4">
          <button 
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-3 py-5 rounded-[1.5rem] bg-panel border border-white/5 text-slate-400 font-black uppercase tracking-widest text-sm hover:bg-slate-800 transition-all active:scale-95"
          >
            <Trash2 className="size-5 text-rose-500" />
            ຍົກເລີກການອັບໂຫຼດ
          </button>
          
          <button 
            onClick={onSave}
            className="flex-[1.5] flex items-center justify-center gap-3 py-5 rounded-[1.5rem] bg-sky-500 text-white font-black uppercase tracking-widest text-sm shadow-2xl shadow-sky-500/40 hover:bg-sky-600 transition-all active:scale-95"
          >
            <Save className="size-5" />
            ຢືນຢັນ ແລະ ບັນທຶກ
          </button>
        </div>
      </div>
    </div>
  )
}
