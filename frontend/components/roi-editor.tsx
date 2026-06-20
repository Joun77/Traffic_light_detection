"use client"

import { useRef, useState, useEffect, MouseEvent } from "react"
import { MoveHorizontal, MoveVertical, Lightbulb, BoxSelect, Eraser, PenTool, Trash2 } from "lucide-react"
import { ConfirmModal } from "./confirm-modal"
import { cn } from "@/lib/utils"

type Point = { x: number; y: number }
type Line  = { x1: number; y1: number; x2: number; y2: number }
type Box   = { x1: number; y1: number; x2: number; y2: number }
type Tool  = "Y" | "X" | "TL" | "VEH" | "LANE"

const LANE_COLORS = ["#b432ff", "#32b4ff", "#32ffb4", "#ffb432"]
const CLOSE_SNAP  = 15   // px — distance to first point to auto-close polygon

interface ROIEditorProps {
  videoUrl: string
  onSave: (config: any, frameBlob: Blob) => void
  onCancel: () => void
}

export function ROIEditor({ videoUrl, onSave, onCancel }: ROIEditorProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const imageRef  = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isVideo = videoUrl.includes("#t=") || videoUrl.includes(".mp4") || videoUrl.includes(".mov")
  const [isPortrait, setIsPortrait] = useState(false)

  // 2-point lines
  const [roiYLine,  setRoiYLine]  = useState<Line | null>(null)
  const [roiXLine,  setRoiXLine]  = useState<Line | null>(null)
  const [tlBox,     setTlBox]     = useState<Box  | null>(null)
  const [vehZone,   setVehZone]   = useState<Box  | null>(null)

  // Lane polygons
  const [lanePolygons,     setLanePolygons]     = useState<Point[][]>([])
  const [currentLanePts,   setCurrentLanePts]   = useState<Point[]>([])

  // 2-click / polygon drawing state
  const [pendingPoint, setPendingPoint] = useState<Point | null>(null)
  const [mousePos,     setMousePos]     = useState<Point | null>(null)

  const [activeTool,       setActiveTool]       = useState<Tool>("Y")
  const [isDrawing,        setIsDrawing]        = useState(false)
  const [startPoint,       setStartPoint]       = useState<Point | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // ── 1. Load existing config ───────────────────────────────────────────────
  useEffect(() => {
    const fetchAndApply = async () => {
      try {
        const res    = await fetch("http://localhost:8000/get-roi")
        const config = await res.json()
        const media  = isVideo ? videoRef.current : imageRef.current
        if (!media) return

        const handleLoad = () => {
          const mW = isVideo ? (media as HTMLVideoElement).videoWidth  : (media as HTMLImageElement).naturalWidth
          const mH = isVideo ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight
          setIsPortrait(mH > mW)
          const sX = media.clientWidth  / mW
          const sY = media.clientHeight / mH

          if (config.stop_line) {
            const [[x1, y1], [x2, y2]] = config.stop_line
            setRoiYLine({ x1: x1*sX, y1: y1*sY, x2: x2*sX, y2: y2*sY })
          } else if (config.roi_y != null) {
            setRoiYLine({ x1: 0, y1: config.roi_y*sY, x2: media.clientWidth, y2: config.roi_y*sY })
          }

          if (config.roi_x_line) {
            const [[x1, y1], [x2, y2]] = config.roi_x_line
            setRoiXLine({ x1: x1*sX, y1: y1*sY, x2: x2*sX, y2: y2*sY })
          } else if (config.roi_x != null) {
            setRoiXLine({ x1: config.roi_x*sX, y1: 0, x2: config.roi_x*sX, y2: media.clientHeight })
          }

          if (config.traffic_light_box) {
            const [x1, y1, x2, y2] = config.traffic_light_box
            setTlBox({ x1: x1*sX, y1: y1*sY, x2: x2*sX, y2: y2*sY })
          }
          if (config.vehicle_zone) {
            const [x1, y1, x2, y2] = config.vehicle_zone
            setVehZone({ x1: x1*sX, y1: y1*sY, x2: x2*sX, y2: y2*sY })
          }
          if (config.lane_polygons) {
            const scaled: Point[][] = config.lane_polygons.map((poly: number[][]) =>
              poly.map(([px, py]) => ({ x: px*sX, y: py*sY }))
            )
            setLanePolygons(scaled)
          }

          if (canvasRef.current) {
            canvasRef.current.width  = media.clientWidth
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

  // ── 2. Sync canvas on resize ──────────────────────────────────────────────
  useEffect(() => {
    const sync = () => {
      const media = isVideo ? videoRef.current : imageRef.current
      if (media && canvasRef.current) {
        canvasRef.current.width  = media.clientWidth
        canvasRef.current.height = media.clientHeight
      }
    }
    window.addEventListener("resize", sync)
    return () => window.removeEventListener("resize", sync)
  }, [isVideo])

  // ── 3. Canvas render loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext("2d")
    if (!ctx) return

    const drawDot = (x: number, y: number, color: string, r = 6) => {
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke()
    }

    const drawLine2pt = (line: Line, color: string) => {
      ctx.strokeStyle = color; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(line.x1, line.y1); ctx.lineTo(line.x2, line.y2); ctx.stroke()
      drawDot(line.x1, line.y1, color)
      drawDot(line.x2, line.y2, color)
    }

    const drawPolygon = (pts: Point[], color: string, label: string) => {
      if (pts.length < 2) return
      // Fill
      ctx.fillStyle = color + "28"
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath(); ctx.fill()
      // Border
      ctx.strokeStyle = color; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath(); ctx.stroke()
      // Dots
      pts.forEach(p => drawDot(p.x, p.y, color, 5))
      // Label at centroid
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
      ctx.font = "bold 13px sans-serif"
      ctx.fillStyle = "#000"
      ctx.fillText(label, cx - 22 + 1, cy + 1)
      ctx.fillStyle = color
      ctx.fillText(label, cx - 22, cy)
    }

    const draw = () => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

      // Completed Y / X lines
      if (roiYLine) drawLine2pt(roiYLine, "#38bdf8")
      if (roiXLine) drawLine2pt(roiXLine, "#7dd3fc")

      // Boxes
      if (tlBox) {
        ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2
        ctx.strokeRect(tlBox.x1, tlBox.y1, tlBox.x2 - tlBox.x1, tlBox.y2 - tlBox.y1)
      }
      if (vehZone) {
        ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2
        ctx.strokeRect(vehZone.x1, vehZone.y1, vehZone.x2 - vehZone.x1, vehZone.y2 - vehZone.y1)
      }

      // Completed lane polygons
      lanePolygons.forEach((pts, i) => {
        drawPolygon(pts, LANE_COLORS[i % LANE_COLORS.length], `LANE ${i + 1}`)
      })

      // Current lane being drawn
      if (activeTool === "LANE" && currentLanePts.length > 0) {
        const color = LANE_COLORS[lanePolygons.length % LANE_COLORS.length]
        // Drawn segments
        ctx.strokeStyle = color; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(currentLanePts[0].x, currentLanePts[0].y)
        currentLanePts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
        ctx.stroke()
        // Dots — first point larger to show snap target
        currentLanePts.forEach((p, i) => drawDot(p.x, p.y, color, i === 0 ? 9 : 5))
        // Snap indicator on first point when mouse is close
        if (currentLanePts.length >= 3 && mousePos) {
          const fp = currentLanePts[0]
          const dist = Math.hypot(mousePos.x - fp.x, mousePos.y - fp.y)
          if (dist < CLOSE_SNAP * 2) {
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 3
            ctx.beginPath(); ctx.arc(fp.x, fp.y, 13, 0, Math.PI * 2); ctx.stroke()
          }
        }
        // Dashed preview line to mouse
        if (mousePos) {
          const last = currentLanePts[currentLanePts.length - 1]
          ctx.strokeStyle = color; ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke()
          ctx.setLineDash([])
          drawDot(mousePos.x, mousePos.y, color, 4)
        }
      }

      // Pending first-point for Y/X tools
      if (pendingPoint && (activeTool === "Y" || activeTool === "X")) {
        const color = activeTool === "Y" ? "#38bdf8" : "#7dd3fc"
        drawDot(pendingPoint.x, pendingPoint.y, color, 8)
        if (mousePos) {
          ctx.strokeStyle = color; ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.beginPath(); ctx.moveTo(pendingPoint.x, pendingPoint.y); ctx.lineTo(mousePos.x, mousePos.y); ctx.stroke()
          ctx.setLineDash([])
          drawDot(mousePos.x, mousePos.y, color, 4)
        }
      }

      requestAnimationFrame(draw)
    }

    const id = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(id)
  }, [roiYLine, roiXLine, tlBox, vehZone, lanePolygons, currentLanePts, pendingPoint, mousePos, activeTool])

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const handleMouseDown = (e: MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (activeTool === "LANE") {
      // Check snap-to-close (click near first point)
      if (currentLanePts.length >= 3) {
        const fp = currentLanePts[0]
        if (Math.hypot(x - fp.x, y - fp.y) < CLOSE_SNAP) {
          closeLane(); return
        }
      }
      setCurrentLanePts(prev => [...prev, { x, y }])
      return
    }

    if (activeTool === "Y" || activeTool === "X") {
      if (!pendingPoint) {
        setPendingPoint({ x, y })
      } else {
        const line: Line = { x1: pendingPoint.x, y1: pendingPoint.y, x2: x, y2: y }
        if (activeTool === "Y") setRoiYLine(line)
        else setRoiXLine(line)
        setPendingPoint(null); setMousePos(null)
      }
      return
    }

    setIsDrawing(true); setStartPoint({ x, y })
  }

  const handleMouseMove = (e: MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setMousePos({ x, y })

    if (!isDrawing || !startPoint) return
    const box: Box = { x1: Math.min(startPoint.x, x), y1: Math.min(startPoint.y, y), x2: Math.max(startPoint.x, x), y2: Math.max(startPoint.y, y) }
    if (activeTool === "TL") setTlBox(box)
    if (activeTool === "VEH") setVehZone(box)
  }

  const closeLane = () => {
    if (currentLanePts.length < 3) return
    setLanePolygons(prev => [...prev, currentLanePts])
    setCurrentLanePts([])
  }

  const cancelLane = () => setCurrentLanePts([])

  const deleteLastLane = () => setLanePolygons(prev => prev.slice(0, -1))

  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool)
    setPendingPoint(null)
    setMousePos(null)
    setCurrentLanePts([])
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const prepareAndSave = () => {
    const media = isVideo ? videoRef.current : imageRef.current
    if (!media) return
    const mW = isVideo ? (media as HTMLVideoElement).videoWidth  : (media as HTMLImageElement).naturalWidth
    const mH = isVideo ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight
    const sX = mW / media.clientWidth
    const sY = mH / media.clientHeight

    const finalConfig: any = {
      roi_y: null, roi_x: null,
      stop_line: roiYLine ? [
        [Math.round(roiYLine.x1 * sX), Math.round(roiYLine.y1 * sY)],
        [Math.round(roiYLine.x2 * sX), Math.round(roiYLine.y2 * sY)],
      ] : null,
      roi_x_line: roiXLine ? [
        [Math.round(roiXLine.x1 * sX), Math.round(roiXLine.y1 * sY)],
        [Math.round(roiXLine.x2 * sX), Math.round(roiXLine.y2 * sY)],
      ] : null,
      lane_polygons: lanePolygons.length > 0
        ? lanePolygons.map(pts => pts.map(p => [Math.round(p.x * sX), Math.round(p.y * sY)]))
        : null,
      traffic_light_box: tlBox
        ? [Math.round(tlBox.x1*sX), Math.round(tlBox.y1*sY), Math.round(tlBox.x2*sX), Math.round(tlBox.y2*sY)]
        : null,
      vehicle_zone: vehZone
        ? [Math.round(vehZone.x1*sX), Math.round(vehZone.y1*sY), Math.round(vehZone.x2*sX), Math.round(vehZone.y2*sY)]
        : null,
    }

    const cap = document.createElement("canvas")
    cap.width = mW; cap.height = mH
    const ctx = cap.getContext("2d")
    if (ctx) {
      ctx.drawImage(media, 0, 0, mW, mH)
      cap.toBlob((blob) => { if (blob) onSave(finalConfig, blob) }, "image/jpeg", 0.9)
    }
    setShowConfirmModal(false)
  }

  const laneColor = LANE_COLORS[lanePolygons.length % LANE_COLORS.length]

  return (
    <div className={cn("flex gap-8 w-full items-start justify-center", isPortrait ? "flex-row" : "flex-col items-center")}>
      <div className={cn("relative rounded-[2.5rem] overflow-hidden border-[6px] border-white/5 bg-black shadow-2xl flex items-center justify-center max-h-[60vh]", isPortrait ? "w-[420px] shrink-0" : "w-full max-w-5xl")}>
        {isVideo ? (
          <video ref={videoRef} src={videoUrl} crossOrigin="anonymous" className="w-full h-auto max-h-[60vh] block object-contain" />
        ) : (
          <img ref={imageRef} src={videoUrl} crossOrigin="anonymous" className="w-full h-auto max-h-[60vh] block object-contain" />
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair z-10"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setIsDrawing(false)}
          onMouseLeave={() => setMousePos(null)}
        />
      </div>

      <div className={cn("flex flex-col gap-3", isPortrait ? "w-64" : "w-full max-w-5xl")}>

        {/* Status: Y/X pending point */}
        {pendingPoint && (activeTool === "Y" || activeTool === "X") && (
          <div className="flex items-center gap-2 px-4 py-2 bg-sky-500/10 border border-sky-500/30 rounded-2xl text-sky-400 text-xs font-bold">
            <div className="size-2 rounded-full bg-sky-400 animate-pulse" />
            ຈຸດທຳອິດຖືກກຳນົດແລ້ວ — ຄລິກຈຸດທີ 2 ເພື່ອສຳເລັດເສັ້ນ
          </div>
        )}

        {/* Status: Lane drawing */}
        {activeTool === "LANE" && currentLanePts.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border text-xs font-bold"
               style={{ backgroundColor: laneColor + "18", borderColor: laneColor + "55", color: laneColor }}>
            <div className="size-2 rounded-full animate-pulse" style={{ backgroundColor: laneColor }} />
            <span className="flex-1">
              {currentLanePts.length < 3
                ? `ກຳລັງວາດ LANE ${lanePolygons.length + 1} — ຄລິກວາງຈຸດ (ຕ້ອງການຢ່າງໜ້ອຍ 3 ຈຸດ)`
                : `LANE ${lanePolygons.length + 1} — ${currentLanePts.length} ຈຸດ | ຄລິກຈຸດເລີ່ມ ຫຼື ກົດ ສຳເລັດ`}
            </span>
            {currentLanePts.length >= 3 && (
              <button onClick={closeLane}
                className="px-3 py-1 rounded-xl font-black text-[10px] uppercase tracking-widest text-white"
                style={{ backgroundColor: laneColor }}>
                ສຳເລັດ
              </button>
            )}
            <button onClick={cancelLane}
              className="px-3 py-1 rounded-xl font-black text-[10px] uppercase tracking-widest bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all">
              ຍົກເລີກ
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className={cn("flex flex-wrap gap-3 p-4 bg-slate-900 border border-white/5 rounded-3xl shadow-xl w-full", isPortrait ? "flex-col" : "justify-center")}>
          <button onClick={() => handleToolChange("Y")} className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all", activeTool === 'Y' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
            <MoveHorizontal className="size-4" /> ເສັ້ນຈັບ Y
          </button>
          <button onClick={() => handleToolChange("X")} className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all", activeTool === 'X' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
            <MoveVertical className="size-4" /> ເສັ້ນຈັບ X
          </button>
          <button onClick={() => handleToolChange("TL")} className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all", activeTool === 'TL' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
            <Lightbulb className="size-4" /> ໄຟຈາລະຈອນ
          </button>
          <button onClick={() => handleToolChange("VEH")} className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all", activeTool === 'VEH' ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
            <BoxSelect className="size-4" /> ພື້ນທີ່ກວດຈັບ
          </button>

          {/* Lane tool with color indicator */}
          <button onClick={() => handleToolChange("LANE")}
            className={cn("flex items-center gap-3 px-6 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all",
              activeTool === 'LANE' ? 'text-white shadow-lg scale-105' : 'bg-white/5 text-slate-400 hover:bg-white/10'
            )}
            style={activeTool === 'LANE' ? { backgroundColor: laneColor, boxShadow: `0 8px 20px ${laneColor}44` } : {}}>
            <PenTool className="size-4" />
            ວາດເລນ
            {lanePolygons.length > 0 && (
              <span className={cn("px-2 py-0.5 rounded-full text-[9px]", activeTool === 'LANE' ? "bg-white/20" : "bg-white/10 text-white")}>
                {lanePolygons.length}
              </span>
            )}
          </button>

          <div className={isPortrait ? "h-px w-full bg-white/10 my-2" : "w-px h-8 bg-white/10 mx-2"} />

          {/* Delete last lane */}
          {lanePolygons.length > 0 && (
            <button onClick={deleteLastLane}
              className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-amber-500/10 text-amber-400 font-black text-[11px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all">
              <Trash2 className="size-4" /> ລຶບເລນ {lanePolygons.length}
            </button>
          )}

          <button
            onClick={() => { setRoiYLine(null); setRoiXLine(null); setTlBox(null); setVehZone(null); setLanePolygons([]); setCurrentLanePts([]); setPendingPoint(null) }}
            className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-rose-500/10 text-rose-500 font-black text-[11px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">
            <Eraser className="size-4" /> ລ້າງທັງໝົດ
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
