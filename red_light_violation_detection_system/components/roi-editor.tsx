"use client"

import { useRef, useState, useEffect, MouseEvent } from "react"
import { MoveHorizontal, MoveVertical, Lightbulb, BoxSelect, Eraser } from "lucide-react"
import { ConfirmModal } from "./confirm-modal"

type Point = { x: number; y: number }
type Box = { x1: number; y1: number; x2: number; y2: number }

interface ROIEditorProps {
  videoUrl: string
  onSave: (config: any) => void
  onCancel: () => void
}

export function ROIEditor({ videoUrl, onSave, onCancel }: ROIEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [roiY, setRoiY] = useState<number | null>(null)
  const [roiX, setRoiX] = useState<number | null>(null)
  const [tlBox, setTlBox] = useState<Box | null>(null)
  const [vehZone, setVehZone] = useState<Box | null>(null)

  const [activeTool, setActiveTool] = useState<"Y" | "X" | "TL" | "VEH">("Y")
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<Point | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("http://localhost:8000/get-roi")
        const config = await res.json()
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          applyConfig(config)
        } else {
          const video = videoRef.current
          if (video) {
            const onMetadata = () => { applyConfig(config); video.removeEventListener("loadedmetadata", onMetadata); }
            video.addEventListener("loadedmetadata", onMetadata)
          }
        }
      } catch (err) { console.error("Failed to fetch ROI config:", err) }
    }

    const applyConfig = (config: any) => {
      const video = videoRef.current
      if (!video) return
      const sX = video.clientWidth / video.videoWidth
      const sY = video.clientHeight / video.videoHeight
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
    }
    fetchConfig()
  }, [])

  useEffect(() => {
    const handleResize = () => {
      if (videoRef.current && canvasRef.current) {
        canvasRef.current.width = videoRef.current.clientWidth
        canvasRef.current.height = videoRef.current.clientHeight
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return
    const draw = () => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.font = "12px sans-serif"
      if (roiY !== null) {
        ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, roiY); ctx.lineTo(ctx.canvas.width, roiY); ctx.stroke()
        ctx.fillStyle = "#38bdf8"; ctx.fillText("Line Y (Forward)", 10, roiY - 5)
      }
      if (roiX !== null) {
        ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(roiX, 0); ctx.lineTo(roiX, ctx.canvas.height); ctx.stroke()
        ctx.fillStyle = "#7dd3fc"; ctx.fillText("Line X (Left)", roiX + 5, 20)
      }
      if (tlBox) {
        ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.strokeRect(tlBox.x1, tlBox.y1, tlBox.x2 - tlBox.x1, tlBox.y2 - tlBox.y1)
        ctx.fillStyle = "#ef4444"; ctx.fillText("Traffic Light", tlBox.x1, tlBox.y1 - 5)
      }
      if (vehZone) {
        ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2; ctx.strokeRect(vehZone.x1, vehZone.y1, vehZone.x2 - vehZone.x1, vehZone.y2 - vehZone.y1)
        ctx.fillStyle = "#38bdf8"; ctx.fillText("Vehicle Zone", vehZone.x1, vehZone.y1 - 5)
      }
      requestAnimationFrame(draw)
    }
    const animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
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
    const currentBox = { x1: Math.min(startPoint.x, x), y1: Math.min(startPoint.y, y), x2: Math.max(startPoint.x, x), y2: Math.max(startPoint.y, y) }
    if (activeTool === "TL") setTlBox(currentBox)
    if (activeTool === "VEH") setVehZone(currentBox)
  }

  const prepareAndSave = () => {
    if (!videoRef.current) return
    const video = videoRef.current; const sX = video.videoWidth / video.clientWidth; const sY = video.videoHeight / video.clientHeight
    const finalConfig = {
      roi_y: roiY ? Math.round(roiY * sY) : null,
      roi_x: roiX ? Math.round(roiX * sX) : null,
      traffic_light_box: tlBox ? [Math.round(tlBox.x1 * sX), Math.round(tlBox.y1 * sY), Math.round(tlBox.x2 * sX), Math.round(tlBox.y2 * sY)] : null,
      vehicle_zone: vehZone ? [Math.round(vehZone.x1 * sX), Math.round(vehZone.y1 * sY), Math.round(vehZone.x2 * sX), Math.round(vehZone.y2 * sY)] : null,
    }
    onSave(finalConfig); setShowConfirmModal(false)
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border-4 border-sky-400/30 bg-black shadow-2xl mx-auto max-w-4xl">
        <video ref={videoRef} src={videoUrl} className="w-full h-auto block" onLoadedMetadata={() => { if (canvasRef.current && videoRef.current) { canvasRef.current.width = videoRef.current.clientWidth; canvasRef.current.height = videoRef.current.clientHeight; } }} />
        <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDrawing(false)} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 p-4 bg-card/80 rounded-2xl border border-sky-400/20 backdrop-blur-md">
        <button onClick={() => setActiveTool("Y")} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTool === 'Y' ? 'bg-sky-400 text-white shadow-lg shadow-sky-400/20 scale-105' : 'bg-background hover:bg-muted text-muted-foreground'}`}><MoveHorizontal className="size-4" /> ເສັ້ນຈັບ Y</button>
        <button onClick={() => setActiveTool("X")} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTool === 'X' ? 'bg-sky-400 text-white shadow-lg shadow-sky-400/20 scale-105' : 'bg-background hover:bg-muted text-muted-foreground'}`}><MoveVertical className="size-4" /> ເສັ້ນຈັບ X</button>
        <button onClick={() => setActiveTool("TL")} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTool === 'TL' ? 'bg-sky-400 text-white shadow-lg shadow-sky-400/20 scale-105' : 'bg-background hover:bg-muted text-muted-foreground'}`}><Lightbulb className="size-4" /> ຂອບເຂດໄຟຈາລະຈອນ</button>
        <button onClick={() => setActiveTool("VEH")} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTool === 'VEH' ? 'bg-sky-400 text-white shadow-lg shadow-sky-400/20 scale-105' : 'bg-background hover:bg-muted text-muted-foreground'}`}><BoxSelect className="size-4" /> ຂອບເຂດພື້ນທີ່ກວດຈັບລົດ</button>
        <button onClick={() => { setRoiY(null); setRoiX(null); setTlBox(null); setVehZone(null); }} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-500/10 text-rose-500 font-bold hover:bg-rose-500/20 transition-colors"><Eraser className="size-4" /> ຕັ້ງຄ່າໃໝ່ທັງໝົດ</button>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setShowConfirmModal(true)} className="rounded-2xl bg-sky-400 px-16 py-4 text-xl font-black text-white hover:bg-sky-500 transition-all hover:scale-105 shadow-xl shadow-sky-400/30">ບັນທຶກພິກັດ</button>
        <button onClick={onCancel} className="rounded-2xl bg-panel px-16 py-4 text-xl font-black text-panel-foreground hover:bg-panel/80 transition-all">ຍົກເລີກ</button>
      </div>

      <ConfirmModal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} onConfirm={prepareAndSave} title="ຢືນຢັນການບັນທຶກ" description="ທ່ານຕ້ອງການບັນທຶก Video ແລະ ເລີ່ມກວດຈັບເລີຍບໍ່?" subDescription="ລະບົບຈະນຳໃຊ້ຄ່າ ROI ທີ່ທ່ານກຳນົດປັດຈຸບັນເຂົ້າໃນການປະມວນຜົນ." />
    </div>
  )
}
