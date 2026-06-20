"use client"

import { useState, useEffect, useRef } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { StopCircle, RotateCcw, Eye, Activity, ShieldAlert, CheckCircle2, ChevronDown, Camera, Printer, Play, X, ZoomIn, ZoomOut, Maximize2, ScanLine, FileImage } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { ConfirmModal } from "@/components/confirm-modal"
import { PrintPreviewModal, Violation } from "@/components/print-preview-modal"
import { DataTable, DataTableRow, DataTableCell } from "@/components/ui/data-table"
import { translateLightStatus, translateVehicleType, getLightStatusColor } from "@/lib/localization"
import { cn } from "@/lib/utils"

interface CCTV {
  id: number
  camera_id: string
  location_name: string
  rtsp_url?: string
  is_active: boolean
}

export default function MonitorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [cameras, setCameras] = useState<CCTV[]>([])
  const [selectedCamera, setSelectedCamera] = useState<CCTV | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  
  const [sessionViolations, setSessionViolations] = useState<Violation[]>([])
  const [sessionCount, setSessionCount] = useState(0)
  const [lightStatus, setLightStatus] = useState<string>("unknown")
  
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedImageLabel, setSelectedImageLabel] = useState<string>("")
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<"stop" | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Zoom & Panning State
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setMounted(true)
    const init = async () => {
      try {
        const res = await fetch("http://localhost:8000/cameras")
        if (res.ok) {
          const data: CCTV[] = await res.json()
          const activeOnes = data.filter(c => c.is_active)
          setCameras(activeOnes)
          const cameraParam = searchParams.get("camera")
          const target = cameraParam
            ? (activeOnes.find(c => c.id === parseInt(cameraParam)) ?? activeOnes[0])
            : activeOnes[0]
          if (target) handleCameraSelect(target)
        }
      } catch (err) { console.error(err) }
    }
    init()

    const eventSource = new EventSource("http://localhost:8000/events")
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === "new_violation") {
          setSessionViolations(prev => [...prev, payload.data]) // Ascending order 1, 2, 3
          setSessionCount(prev => prev + 1)
        } else if (payload.type === "light_status") {
          setLightStatus(payload.data)
        }
      } catch (e) {}
    }

    return () => {
      eventSource.close()
      fetch("http://localhost:8000/stop-detection", { method: "POST" }).catch(() => {})
    }
  }, [])

  const handleCameraSelect = async (cam: CCTV) => {
    setSelectedCamera(cam)
    setIsDropdownOpen(false)
    setSessionViolations([])
    setSessionCount(0)
    resetZoom()
    
    if (cam.rtsp_url) {
      setIsProcessing(false)
      try {
        await fetch("http://localhost:8000/stop-detection", { method: "POST" })
        const roiRes = await fetch("http://localhost:8000/get-roi")
        const roiConfig = await roiRes.json()
        
        const startRes = await fetch("http://localhost:8000/start-detection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            ...roiConfig, 
            video_path: cam.rtsp_url,
            camera_id: cam.id 
          })
        })

        if (startRes.ok) {
           setTimeout(() => setIsProcessing(true), 1000)
        }
      } catch (e) { console.error(e) }
    }
  }

  const resetZoom = () => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    })
  }

  const handleStop = async () => {
    try {
      await fetch("http://localhost:8000/stop-detection", { method: "POST" })
      setIsProcessing(false)
      router.push("/")
    } catch (error) {}
    setActiveModal(null)
  }

  if (!mounted) return null

  return (
    <DashboardShell title="ລະບົບການກວດຈັບ">
      <div className="flex flex-col gap-6 w-full pb-10">

        {/* --- Header Control --- */}
        <div className="relative z-[1000] flex items-center justify-between bg-slate-900 border border-white/10 p-3 rounded-2xl shadow-xl shrink-0">
          <div className="flex items-center gap-4">
             <div className="relative">
                <button 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-3 px-5 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-white hover:bg-slate-700 transition-all shadow-lg font-bold"
                >
                   <Camera className="size-5 text-sky-400" />
                   <span>{selectedCamera ? selectedCamera.location_name : "ເລືອກກ້ອງວົງຈອນປິດ"}</span>
                   <ChevronDown className={cn("size-4 text-slate-500 transition-transform", isDropdownOpen && "rotate-180")} />
                </button>

                {isDropdownOpen && (
                   <div className="absolute top-full left-0 mt-2 w-72 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-[1010] overflow-hidden animate-in fade-in slide-in-from-top-1">
                      <div className="max-h-60 overflow-y-auto p-2">
                         {cameras.map(cam => (
                            <button 
                              key={cam.id}
                              onClick={() => handleCameraSelect(cam)}
                              className={cn(
                                "w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between group mb-1",
                                selectedCamera?.id === cam.id ? "bg-sky-500 text-white" : "text-slate-300 hover:bg-white/5"
                              )}
                            >
                               <span className="font-bold">{cam.location_name}</span>
                               {selectedCamera?.id === cam.id && <CheckCircle2 className="size-4 text-white" />}
                            </button>
                         ))}
                      </div>
                   </div>
                )}
             </div>
             <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">ລະບົບອອນລາຍ</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={() => router.push("/upload-roi")} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 border border-white/10 text-sky-400 hover:bg-sky-500 hover:text-white transition-all font-bold shadow-lg">
                <RotateCcw className="size-4" />
                <span>ຕັ້ງຄ່າ ROI</span>
             </button>
             <button onClick={() => setActiveModal("stop")} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white transition-all font-bold shadow-lg">
                <StopCircle className="size-4" />
                <span>ຢຸດການເຮັດງານ</span>
             </button>
          </div>
        </div>

        {/* --- Fixed Height Monitor Area (65% of Viewport) --- */}
        <div 
          className="relative z-0 h-[65vh] shrink-0 bg-black rounded-[2.5rem] border-4 border-slate-900 shadow-2xl overflow-hidden flex items-center justify-center group/vid select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
            {isProcessing ? (
              <div className="w-full h-full overflow-hidden flex items-center justify-center pointer-events-none">
                <img 
                  src={`http://localhost:8000/video-feed?t=${selectedCamera?.id}`}
                  alt="AI Feed" 
                  className="w-full h-full object-contain bg-black transition-transform duration-75 ease-out"
                  style={{ 
                    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <div className="size-24 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
                    <Activity className="absolute inset-0 m-auto size-8 text-sky-400 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-black text-white uppercase tracking-[0.3em]">ກຳລັງເລີ່ມຕົ້ນລະບົບ AI...</h3>
              </div>
            )}

            {/* Zoom Controls Overlay */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 p-2 px-4 rounded-2xl opacity-0 group-hover/vid:opacity-100 transition-all shadow-2xl scale-90 group-hover/vid:scale-100 z-10">
               <button 
                onClick={(e) => { e.stopPropagation(); setZoom(prev => Math.max(1, prev - 0.25)); if(zoom <= 1.25) setPosition({x:0,y:0}); }}
                className="p-2 hover:bg-white/10 rounded-xl transition-all text-white pointer-events-auto"
               >
                  <ZoomOut className="size-5" />
               </button>
               <div className="h-4 w-px bg-white/10 mx-1" />
               <span className="text-xs font-black text-white min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
               <div className="h-4 w-px bg-white/10 mx-1" />
               <button 
                onClick={(e) => { e.stopPropagation(); setZoom(prev => Math.min(5, prev + 0.25)); }}
                className="p-2 hover:bg-white/10 rounded-xl transition-all text-white pointer-events-auto"
               >
                  <ZoomIn className="size-5" />
               </button>
               <button 
                onClick={(e) => { e.stopPropagation(); resetZoom(); }}
                className="ml-2 px-3 py-1 bg-sky-500 text-white text-[10px] font-black rounded-lg hover:bg-sky-600 transition-all uppercase pointer-events-auto"
               >
                  Reset
               </button>
            </div>
            
            <div className="absolute top-6 right-6 flex flex-col gap-3 z-10">
               <div className={cn(
                  "px-6 py-3 rounded-2xl border-2 backdrop-blur-xl shadow-2xl flex flex-col items-center min-w-[150px] transition-all duration-500",
                  lightStatus === 'red' ? 'bg-rose-500/20 border-rose-500 text-rose-500' : 
                  lightStatus === 'green' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 
                  'bg-slate-900/40 border-slate-500 text-slate-400'
               )}>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">ສະຖານະໄຟຈລາຈອນ</p>
                  <h4 className="text-2xl font-black">{translateLightStatus(lightStatus)}</h4>
               </div>

               <div className="px-6 py-3 rounded-2xl border-2 border-white/10 bg-slate-900/40 backdrop-blur-xl shadow-2xl flex flex-col items-center min-w-[150px]">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">ການລະເມີດທັງໝົດ</p>
                  <h4 className="text-3xl font-black text-white">{sessionCount}</h4>
               </div>
            </div>
        </div>

        {/* --- Natural Flow Table Section --- */}
        <div className="flex flex-col mt-4">
          <div className="flex items-center justify-between px-4 mb-4">
             <div className="flex items-center gap-3">
                <ShieldAlert className="size-6 text-rose-500" />
                <h4 className="font-black text-white uppercase tracking-tighter text-xl">ລາຍການກວດຈັບຫຼ້າສຸດ</h4>
             </div>
             <div className="px-5 py-1.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-full font-black text-xs tracking-widest uppercase">ຂໍ້ມູນຫຼ້າສຸດ</div>
          </div>

          <DataTable
            headers={["ລຳດັບ", "Vehicle ID", "ປະເພດ", "ເວລາ", "ຮູບຫຼັກຖານ", "ຮູບລົດ", "ປ້າຍທະບຽນ", "ວິດີໂອ", "ຈັດການ"]}
            columnCount={9}
            emptyMessage="ກຳລັງລໍຖ້າການລະເມີດ..."
          >
            {sessionViolations.map((v, i) => {
              const openImg = (path: string | undefined, label: string) => {
                if (!path) return
                setSelectedImage(`http://localhost:8000/${path}`)
                setSelectedImageLabel(label)
              }
              const contextSrc = v.context_image_path || v.image_path
              return (
                <DataTableRow key={v.id}>
                  <DataTableCell className="font-bold text-slate-500 text-lg">#{i + 1}</DataTableCell>
                  <DataTableCell className="font-mono font-black text-white tracking-tighter uppercase text-base">VkH-{v.vehicle_id}</DataTableCell>
                  <DataTableCell>
                    <span className="px-3 py-1 rounded-lg bg-sky-500/10 text-sky-400 font-black text-[10px] uppercase border border-sky-500/20">
                      {translateVehicleType(v.vehicle_type)}
                    </span>
                  </DataTableCell>
                  <DataTableCell className="text-slate-300 font-bold text-sm">
                    {new Date(v.time_stamp).toLocaleTimeString('lo-LA')}
                  </DataTableCell>

                  {/* ຮູບຫຼັກຖານ — context crop (vehicle + traffic light) */}
                  <DataTableCell align="center">
                    <div
                      className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto"
                      onClick={() => openImg(contextSrc, "ຮູບຫຼັກຖານ")}
                    >
                      <img src={`http://localhost:8000/${contextSrc}`} alt="Evidence" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-sky-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize2 className="size-4 text-white drop-shadow-md" />
                      </div>
                    </div>
                  </DataTableCell>

                  {/* ຮູບລົດ — tight vehicle crop */}
                  <DataTableCell align="center">
                    {v.crop_image_path ? (
                      <div
                        className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto"
                        onClick={() => openImg(v.crop_image_path, "ຮູບລົດ")}
                      >
                        <img src={`http://localhost:8000/${v.crop_image_path}`} alt="Vehicle Crop" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        <div className="absolute inset-0 bg-amber-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Maximize2 className="size-4 text-white drop-shadow-md" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-28 h-16 mx-auto rounded-xl border border-white/5 bg-slate-800/50 flex items-center justify-center">
                        <FileImage className="size-5 text-slate-600" />
                      </div>
                    )}
                  </DataTableCell>

                  {/* ປ້າຍທະບຽນ — plate zone 2× upscaled */}
                  <DataTableCell align="center">
                    {v.plate_image_path ? (
                      <div
                        className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto"
                        onClick={() => openImg(v.plate_image_path, "ປ້າຍທະບຽນ")}
                      >
                        <img src={`http://localhost:8000/${v.plate_image_path}`} alt="Plate" className="w-full h-full object-contain bg-black group-hover:scale-110 transition-transform duration-500" />
                        <div className="absolute inset-0 bg-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ScanLine className="size-4 text-white drop-shadow-md" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-28 h-16 mx-auto rounded-xl border border-white/5 bg-slate-800/50 flex items-center justify-center">
                        <ScanLine className="size-5 text-slate-600" />
                      </div>
                    )}
                  </DataTableCell>

                  {/* ວິດີໂອຫຼັກຖານ */}
                  <DataTableCell align="center">
                    <div
                      className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto transition-all active:scale-95"
                      onClick={() => setSelectedVideo(`http://localhost:8000/${v.video_path}`)}
                    >
                      <img src={`http://localhost:8000/${contextSrc}`} alt="Video Cover" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-60" />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 group-hover:scale-110 transition-transform shadow-xl">
                          <Play className="size-4 text-white fill-current" />
                        </div>
                      </div>
                    </div>
                  </DataTableCell>

                  <DataTableCell align="center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => { setSelectedViolation(v); setIsPrintModalOpen(true) }}
                        className="p-3 bg-slate-800 hover:bg-sky-500 text-sky-400 hover:text-white rounded-xl transition-all shadow-lg border border-white/5"
                        title="ພິມລາຍງານ"
                      >
                        <Printer className="size-5" />
                      </button>
                    </div>
                  </DataTableCell>
                </DataTableRow>
              )
            })}
          </DataTable>
        </div>
      </div>


      <PrintPreviewModal 
        violation={selectedViolation} 
        onClose={() => { setIsPrintModalOpen(false); setSelectedViolation(null); }} 
      />

      {/* Evidence Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/95 p-6 backdrop-blur-2xl animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-900/50 text-white">
              <div className="flex items-center gap-4 text-sky-400">
                <div className="p-3 bg-sky-500/10 rounded-2xl"><Eye className="size-6" /></div>
                <h3 className="font-black text-2xl uppercase tracking-tighter text-white">{selectedImageLabel || "ຮູບຫຼັກຖານ"}</h3>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-3 bg-white/5 hover:bg-rose-500/20 rounded-full transition-all text-white/50 hover:text-rose-500"
              >
                <X className="size-6" />
              </button>
            </div>
            <div className="bg-black p-4">
              <img src={selectedImage} alt="Violation Evidence" className="w-full h-auto max-h-[70vh] object-contain rounded-2xl shadow-2xl" />
            </div>
          </div>
        </div>
      )}

      {/* Video Playback Modal */}
      {selectedVideo && (
        <div 
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/98 p-6 backdrop-blur-3xl animate-in fade-in duration-300"
          onClick={() => setSelectedVideo(null)}
        >
          <div className="relative max-w-5xl w-full bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-900/50 text-white">
              <div className="flex items-center gap-4 text-emerald-400">
                 <div className="p-3 bg-emerald-500/10 rounded-2xl"><Play className="size-6 fill-current" /></div>
                 <h3 className="font-black text-2xl uppercase tracking-tighter text-white">Evidence Video Playback</h3>
              </div>
              <button 
                onClick={() => setSelectedVideo(null)}
                className="p-3 bg-white/5 hover:bg-rose-500/20 rounded-full transition-all text-white/50 hover:text-rose-500"
              >
                <X className="size-6" />
              </button>
            </div>
            <div className="bg-black p-4 aspect-video flex items-center justify-center">
               <video 
                  src={selectedVideo} 
                  controls 
                  autoPlay 
                  className="w-full h-full max-h-[70vh] rounded-2xl shadow-2xl"
               />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={activeModal === "stop"} 
        onClose={() => setActiveModal(null)} 
        onConfirm={handleStop} 
        title="ຢຸດການປະມວນຜົນ" 
        description="ທ່ານແນ່ໃຈຫຼືບໍ່ວ່າຕ້ອງການຢຸດການເຮັດງານຂອງ AI?" 
      />
    </DashboardShell>
  )
}
