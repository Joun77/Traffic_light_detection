"use client"

import { useRef, useState, useEffect, MouseEvent } from "react"
import { MoveHorizontal, MoveVertical, Lightbulb, BoxSelect, Eraser, Info } from "lucide-react"
import { ConfirmModal } from "./confirm-modal"
import { cn } from "@/lib/utils"

type Point = { x: number; y: number }
type Box = { x1: number; y1: number; x2: number; y2: number }

interface ROIEditorProps {
  videoUrl: string
  onSave: (config: any, frameBlob: Blob) => void
  onCancel: () => void
}

export function ROIEditor({ videoUrl, onSave, onCancel }: ROIEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isVideo = videoUrl.includes("#t=") || videoUrl.includes(".mp4") || videoUrl.includes(".mov")
  const [isPortrait, setIsPortrait] = useState(false)

  const [roiY, setRoiY] = useState<number | null>(null)
  const [roiX, setRoiX] = useState<number | null>(null)
  const [tlBox, setTlBox] = useState<Box | null>(null)
  const [vehZone, setVehZone] = useState<Box | null>(null)

  const [activeTool, setActiveTool] = useState<"Y" | "X" | "TL" | "VEH">("Y")
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // 1. Initial Config Fetch & Apply
  useEffect(() => {
    const fetchAndApply = async () => {
      try {
        const res = await fetch("http://localhost:8000/get-roi")
        const config = await res.json()
        
        const media = isVideo ? videoRef.current : imageRef.current
        if (!media) return

        const handleLoad = () => {
          const mWidth = isVideo ? (media as HTMLVideoElement).videoWidth : (media as HTMLImageElement).naturalWidth
          const mHeight = isVideo ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight
          
          setIsPortrait(mHeight > mWidth)

          const sX = media.clientWidth / mWidth
          const sY = media.clientHeight / mHeight

          if (config.roi_y !== null) setRoiY(config.roi_y * sY)
          if (config.roi_x !== null) setRoiX(config.roi_x * sX)
          if (config.traffic_light_box) {
            const [x1, y1, x2, y2] = config.traffic_light_box
            setTlBox({ x1: x1 * sX, y1: y1 * sY, x2: x2 * sX, y2: y2 * sY })
          }
          if (config.vehicle_zone) {
            const [x1, y1, x2, y2] = config.vehicle_zone
            setVehZone({ x1: x1 * sX, y1: y1 * sY, x2: x2 * sX, y2: y2 * sY })
          }
          
          if (canvasRef.current) {
            canvasRef.current.width = media.clientWidth
            canvasRef.current.height = media.clientHeight
          }
        }

        if (isVideo) {
          if ((media as HTMLVideoElement).readyState >= 2) handleLoad()
          else media.addEventListener('loadeddata', handleLoad, { once: true })
        } else {
          if ((media as HTMLImageElement).complete) handleLoad()
          else media.addEventListener('load', handleLoad, { once: true })
        }
      } catch (err) { console.error(err) }
    }
    fetchAndApply()
  }, [videoUrl, isVideo])

  // 2. Sync Canvas on Resize
  useEffect(() => {
    const sync = () => {
      const media = isVideo ? videoRef.current : imageRef.current
      if (media && canvasRef.current) {
        canvasRef.current.width = media.clientWidth
        canvasRef.current.height = media.clientHeight
      }
    }
    window.addEventListener("resize", sync)
    return () => window.removeEventListener("resize", sync)
  }, [isVideo])

  // 3. Continuous Render
  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return
    const draw = () => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.font = "bold 12px sans-serif"
      
      if (roiY !== null) {
        ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, roiY); ctx.lineTo(ctx.canvas.width, roiY); ctx.stroke()
      }
      if (roiX !== null) {
        ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(roiX, 0); ctx.lineTo(roiX, ctx.canvas.height); ctx.stroke()
      }
      if (tlBox) {
        ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.strokeRect(tlBox.x1, tlBox.y1, tlBox.x2 - tlBox.x1, tlBox.y2 - tlBox.y1)
      }
      if (vehZone) {
        ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2; ctx.strokeRect(vehZone.x1, vehZone.y1, vehZone.x2 - vehZone.x1, vehZone.y2 - vehZone.y1)
      }
      requestAnimationFrame(draw)
    }
    const id = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(id)
  }, [roiY, roiX, tlBox, vehZone])

  const handleMouseDown = (e: MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top
    if (activeTool === "Y") setRoiY(y)
    else if (activeTool === "X") setRoiX(x)
    else { setIsDrawing(true); setStartPoint({ x, y }) }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDrawing || !startPoint || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top
    const box = { x1: Math.min(startPoint.x, x), y1: Math.min(startPoint.y, y), x2: Math.max(startPoint.x, x), y2: Math.max(startPoint.y, y) }
    if (activeTool === "TL") setTlBox(box)
    if (activeTool === "VEH") setVehZone(box)
  }

  const prepareAndSave = () => {
    const media = isVideo ? videoRef.current : imageRef.current
    if (!media) return
    
    const mWidth = isVideo ? (media as HTMLVideoElement).videoWidth : (media as HTMLImageElement).naturalWidth
    const mHeight = isVideo ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight
    
    const sX = mWidth / media.clientWidth
    const sY = mHeight / media.clientHeight
    
    const finalConfig = {
      roi_y: roiY ? Math.round(roiY * sY) : null,
      roi_x: roiX ? Math.round(roiX * sX) : null,
      traffic_light_box: tlBox ? [Math.round(tlBox.x1 * sX), Math.round(tlBox.y1 * sY), Math.round(tlBox.x2 * sX), Math.round(tlBox.y2 * sY)] : null,
      vehicle_zone: vehZone ? [Math.round(vehZone.x1 * sX), Math.round(vehZone.y1 * sY), Math.round(vehZone.x2 * sX), Math.round(vehZone.y2 * sY)] : null,
    }

    const captureCanvas = document.createElement("canvas")
    captureCanvas.width = mWidth; captureCanvas.height = mHeight
    const ctx = captureCanvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(media, 0, 0, mWidth, mHeight)
      captureCanvas.toBlob((blob) => { if (blob) onSave(finalConfig, blob) }, "image/jpeg", 0.9)
    }
    setShowConfirmModal(false)
  }

  return (
    <div className={cn("flex gap-8 w-full items-start justify-center", isPortrait ? "flex-row" : "flex-col items-center")}>
      <div className={cn("relative rounded-[2.5rem] overflow-hidden border-[6px] border-white/5 bg-black shadow-2xl flex items-center justify-center max-h-[60vh]", isPortrait ? "w-[420px] shrink-0" : "w-full max-w-5xl")}>
        {isVideo ? (
          <video ref={videoRef} src={videoUrl} crossOrigin="anonymous" className="w-full h-auto max-h-[60vh] block object-contain" />
        ) : (
          <img ref={imageRef} src={videoUrl} crossOrigin="anonymous" className="w-full h-auto max-h-[60vh] block object-contain" />
        )}
        <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair z-10" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDrawing(false)} />
      </div>

      <div className={cn("flex flex-col gap-4", isPortrait ? "w-64" : "w-full max-w-5xl")}>
        <div className={cn("flex flex-wrap gap-3 p-4 bg-slate-900 border border-white/5 rounded-3xl shadow-xl w-full", isPortrait ? "flex-col" : "justify-center")}>
          <button onClick={() => setActiveTool("Y")} className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all", activeTool === 'Y' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
            <MoveHorizontal className="size-4" /> ເສັ້ນຈັບ Y
          </button>
          <button onClick={() => setActiveTool("X")} className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all", activeTool === 'X' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
            <MoveVertical className="size-4" /> ເສັ້ນຈັບ X
          </button>
          <button onClick={() => setActiveTool("TL")} className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all", activeTool === 'TL' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
            <Lightbulb className="size-4" /> ໄຟຈາລະຈອນ
          </button>
          <button onClick={() => setActiveTool("VEH")} className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all", activeTool === 'VEH' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
            <BoxSelect className="size-4" /> ພື້ນທີ່ກວດຈັບ
          </button>
          <div className={isPortrait ? "h-px w-full bg-white/10 my-2" : "w-px h-8 bg-white/10 mx-2"} />
          <button onClick={() => { setRoiY(null); setRoiX(null); setTlBox(null); setVehZone(null); }} className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-rose-500/10 text-rose-500 font-black text-[11px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">
            <Eraser className="size-4" /> ລ້າງຂໍ້ມູນ
          </button>
        </div>

        <div className={cn("flex gap-4 w-full", isPortrait ? "flex-col" : "max-w-md mx-auto")}>
          <button onClick={() => setShowConfirmModal(true)} className="flex-1 rounded-[1.5rem] bg-sky-500 py-5 text-sm font-black uppercase tracking-[0.2em] text-white hover:bg-sky-600 transition-all shadow-2xl shadow-sky-500/30 active:scale-95">ບັນທຶກພິກັດ</button>
          <button onClick={onCancel} className="flex-1 rounded-[1.5rem] bg-panel py-5 text-sm font-black uppercase tracking-[0.2em] text-panel-foreground hover:bg-slate-800 transition-all border border-white/5">ຍົກເລີກ</button>
        </div>
      </div>

      <ConfirmModal 
        isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} onConfirm={prepareAndSave} 
        title="ຢືນຢັນການບັນທຶກ" description="ທ່ານຕ້ອງການບັນທຶກພິກັດນີ້ ຫຼື ບໍ່?" subDescription="ພິກັດນີ້ຈະຖືກນຳໃຊ້ໃນການກວດຈັບພາຫະນະ." 
      />
    </div>
  )
}
