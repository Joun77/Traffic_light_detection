"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { 
  Camera, 
  MapPin, 
  Target, 
  ArrowLeft, 
  Video, 
  Calendar, 
  Clock, 
  Printer, 
  Trash2, 
  Play, 
  X, 
  Maximize2, 
  ScanLine, 
  FileImage, 
  Eye,
  Activity,
  AlertCircle
} from "lucide-react"
import { DataTable, DataTableRow, DataTableCell } from "@/components/ui/data-table"
import { translateLightStatus, translateVehicleType, getLightStatusColor } from "@/lib/localization"
import { ConfirmModal } from "@/components/confirm-modal"
import { Toast, ToastType } from "@/components/ui/toast"
import { PrintPreviewModal, Violation } from "@/components/print-preview-modal"
import { cn } from "@/lib/utils"

interface CCTV {
  id: number
  camera_id: string
  location_name: string
  village: string
  district: string
  province: string
  is_active: boolean
  rtsp_url?: string
}

export default function CameraDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [camera, setCamera] = useState<CCTV | null>(null)
  const [roiConfig, setRoiConfig] = useState<any>(null)
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Media preview states
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedImageLabel, setSelectedImageLabel] = useState<string>("")
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
  const [previewViolation, setPreviewViolation] = useState<Violation | null>(null)
  const [isPlayingStream, setIsPlayingStream] = useState(false)

  // Feedback states
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const showToast = (message: string, type: ToastType = "success") => {
    setToast({ message, type })
  }

  const fetchCameraData = async () => {
    setLoading(true)
    try {
      // 1. Fetch camera details
      const camRes = await fetch(`http://localhost:8000/cameras/${id}`)
      if (!camRes.ok) throw new Error("Camera not found")
      const camData: CCTV = await camRes.json()
      setCamera(camData)

      // 2. Fetch ROI Config
      const roiRes = await fetch(`http://localhost:8000/get-roi?camera_id=${id}`)
      if (roiRes.ok) {
        const roiData = await roiRes.json()
        setRoiConfig(roiData)
        if (roiData.has_reference) {
          setSourceUrl(`http://localhost:8000/static-data/roi_reference_${id}.jpg?t=${Date.now()}`)
        }
      }

      // 3. Fetch specific camera violations
      const vioRes = await fetch(`http://localhost:8000/violations?camera_id=${id}&limit=50`)
      if (vioRes.ok) {
        const vioData = await vioRes.json()
        if (Array.isArray(vioData)) {
          setViolations(vioData)
        }
      }
    } catch (error) {
      console.error("Error loading camera detail:", error)
      showToast("ບໍ່ສາມາດໂຫຼດຂໍ້ມູນກ້ອງໄດ້", "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) fetchCameraData()
  }, [id])

  // Draw ROI on Canvas
  useEffect(() => {
    if (roiConfig && sourceUrl && canvasRef.current) {
      const isVideo = sourceUrl.includes(".mp4") || sourceUrl.includes(".mov") || sourceUrl.includes("#t=")
      
      const drawToCanvas = (media: HTMLVideoElement | HTMLImageElement) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const mWidth = isVideo ? (media as HTMLVideoElement).videoWidth : (media as HTMLImageElement).naturalWidth
        const mHeight = isVideo ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight

        const displayWidth = Math.min(800, window.innerWidth - 60)
        const scale = displayWidth / (mWidth || 1)
        canvas.width = displayWidth
        canvas.height = (mHeight || 1) * scale

        ctx.drawImage(media, 0, 0, canvas.width, canvas.height)

        const { roi_y, roi_x, traffic_light_box, vehicle_zone, stop_line } = roiConfig
        
        // Draw Stop Line
        if (stop_line && stop_line.length >= 2) {
          ctx.strokeStyle = "#38bdf8"
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(stop_line[0][0] * scale, stop_line[0][1] * scale)
          ctx.lineTo(stop_line[1][0] * scale, stop_line[1][1] * scale)
          ctx.stroke()
          
          ctx.fillStyle = "#38bdf8"
          ctx.font = "bold 12px sans-serif"
          ctx.fillText("STOP LINE", stop_line[0][0] * scale + 5, stop_line[0][1] * scale - 5)
        } else if (roi_y) {
          ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(0, roi_y * scale); ctx.lineTo(canvas.width, roi_y * scale); ctx.stroke();
        }
        
        // Draw Traffic Light box
        if (traffic_light_box) {
          const [x1, y1, x2, y2] = traffic_light_box
          ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 3;
          ctx.strokeRect(x1 * scale, y1 * scale, (x2 - x1) * scale, (y2 - y1) * scale);
          
          ctx.fillStyle = "#ef4444"
          ctx.font = "bold 11px sans-serif"
          ctx.fillText("TRAFFIC SIGNAL", x1 * scale, y1 * scale - 4)
        }

        // Draw Vehicle Detection Zone
        if (vehicle_zone) {
          const [x1, y1, x2, y2] = vehicle_zone
          ctx.strokeStyle = "#10b981"; ctx.lineWidth = 3;
          ctx.strokeRect(x1 * scale, y1 * scale, (x2 - x1) * scale, (y2 - y1) * scale);
          
          ctx.fillStyle = "#10b981"
          ctx.font = "bold 11px sans-serif"
          ctx.fillText("DETECTION ZONE", x1 * scale, y1 * scale - 4)
        }
      }

      if (isVideo) {
        const video = document.createElement("video")
        video.src = sourceUrl; video.crossOrigin = "anonymous"; video.currentTime = 0.1
        video.onloadeddata = () => { setTimeout(() => drawToCanvas(video), 300) }
      } else {
        const img = new Image(); img.src = sourceUrl; img.crossOrigin = "anonymous"; img.onload = () => drawToCanvas(img)
      }
    }
  }, [roiConfig, sourceUrl])

  const confirmDelete = async () => {
    if (deleteId === null) return
    try {
      const response = await fetch(`http://localhost:8000/violations/${deleteId}`, { method: "DELETE" })
      if (response.ok) {
        setViolations(prev => prev.filter(v => v.id !== deleteId))
        showToast("ລຶບຂໍ້ມູນສຳເລັດແລ້ວ")
      } else {
        showToast("ເກີດຂໍ້ຜິດພາດໃນການລຶບ", "error")
      }
    } catch {
      showToast("ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບເຊີເວີ", "error")
    } finally {
      setDeleteId(null)
    }
  }

  const handleToggleStatus = async () => {
    if (!camera) return
    const nextStatus = !camera.is_active
    try {
      const response = await fetch(`http://localhost:8000/cameras/${camera.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextStatus }),
      })
      if (response.ok) {
        setCamera(prev => prev ? { ...prev, is_active: nextStatus } : null)
        showToast("ອັບເຕດສະຖານະກ້ອງສຳເລັດ", "success")
      }
    } catch {
      showToast("ເກີດຂໍ້ຜິດພາດໃນການອັບເຕດ", "error")
    }
  }

  if (loading && !camera) {
    return (
      <DashboardShell title="ລາຍລະອຽດກ້ອງ">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <div className="size-12 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
        </div>
      </DashboardShell>
    )
  }

  if (!camera) {
    return (
      <DashboardShell title="ບໍ່ພົບຂໍ້ມູນກ້ອງ">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <AlertCircle className="size-16 text-rose-500" />
          <h2 className="text-xl font-black text-white">ບໍ່ພົບຂໍ້ມູນກ້ອງ CCTV ທີ່ທ່ານຮ້ອງຂໍ</h2>
          <button onClick={() => router.push("/cameras")} className="mt-4 flex items-center gap-2 px-6 py-3 bg-panel border border-white/10 rounded-2xl font-black text-xs text-sky-400 hover:bg-slate-800 transition-all">
            <ArrowLeft className="size-4" /> ກັບຄືນໄປໜ້າຈັດການກ້ອງ
          </button>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title={`ກ້ອງ CCTV: ${camera.location_name}`}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      <ConfirmModal 
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="ຢືນຢັນການລຶບ"
        description="ທ່ານຕ້ອງການລຶບຂໍ້ມູນການລະເມີດນີ້ແທ້ຫຼືບໍ່?"
      />

      {/* Back Button */}
      <button 
        onClick={() => router.push("/cameras")} 
        className="flex items-center gap-2 mb-6 px-4 py-2 bg-slate-900 border border-white/10 text-slate-400 hover:text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors"
      >
        <ArrowLeft className="size-4" /> ກັບຄືນ
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-start">
        {/* Camera Info Card */}
        <div className="lg:col-span-1 bg-card rounded-[2.5rem] p-8 border border-border shadow-lg flex flex-col gap-6">
          <div className="flex items-center gap-4 border-b border-border pb-4">
            <div className="bg-sky-500/10 p-4 rounded-[1.5rem] text-sky-400">
              <Camera className="size-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">CCTV Device</span>
              <h2 className="text-xl font-black text-white tracking-tight uppercase">CCTV-{camera.camera_id}</h2>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">ສະຖານທີ່ຕິດຕັ້ງ</span>
              <span className="font-bold text-white text-lg mt-0.5">{camera.location_name}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">ທີ່ຢູ່</span>
              <span className="font-medium text-slate-300 text-sm mt-0.5 flex items-center gap-1">
                <MapPin className="size-3.5 text-rose-500 shrink-0" />
                {camera.village}, {camera.district}, {camera.province}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
              <span className="text-sm font-black uppercase text-slate-400 tracking-wider">ສະຖານະການໃຊ້ງານ</span>
              <button 
                onClick={handleToggleStatus}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${camera.is_active ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${camera.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-border mt-auto">
            <button 
              onClick={() => router.push(`/upload-roi?camera=${camera.id}`)}
              className="flex items-center justify-center gap-2 w-full py-4 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
            >
              <Target className="size-4" /> ຕັ້ງຄ່າ ROI
            </button>
            {camera.rtsp_url && (
              <button 
                onClick={() => router.push(`/monitor?camera=${camera.id}`)}
                className="flex items-center justify-center gap-2 w-full py-4 bg-slate-900 border border-white/5 hover:bg-slate-800 text-emerald-400 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
              >
                <Activity className="size-4" /> ເລີ່ມການກວດຈັບສົດ
              </button>
            )}
          </div>
        </div>

        {/* Video / ROI Configuration Canvas Preview */}
        <div className="lg:col-span-2 bg-card rounded-[2.5rem] p-8 border border-border shadow-lg flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <Video className="size-5 text-sky-400" />
              <h3 className="text-lg font-black text-white uppercase tracking-tight">ພື້ນທີ່ກວດຈັບ ແລະ ວິດີໂອອ້າງອີງ</h3>
            </div>
            {camera.rtsp_url && (
              <button
                onClick={() => setIsPlayingStream(!isPlayingStream)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 border border-white/5 text-sky-400 hover:text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
              >
                <Play className="size-3 fill-current" /> {isPlayingStream ? "ເບິ່ງຂອບເຂດ ROI" : "ຫຼິ້ນວິດີໂອ"}
              </button>
            )}
          </div>

          <div className="bg-black aspect-video rounded-3xl overflow-hidden flex items-center justify-center relative border border-white/5">
            {isPlayingStream && camera.rtsp_url ? (
              <video 
                src={`http://localhost:8000/${camera.rtsp_url}`} 
                controls 
                autoPlay 
                className="w-full h-full object-contain"
              />
            ) : (
              sourceUrl ? (
                <canvas ref={canvasRef} className="max-w-full max-h-[50vh] object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-4 text-center p-8">
                  <div className="bg-slate-900 p-5 rounded-full text-slate-500 border border-white/5"><Target className="size-8" /></div>
                  <div>
                    <h4 className="text-white font-black text-base">ຍັງບໍ່ທັນໄດ້ຕັ້ງຄ່າພື້ນທີ່ກວດຈັບ (ROI)</h4>
                    <p className="text-slate-500 text-xs mt-1 max-w-sm leading-relaxed">ກະລຸນາອັບໂຫຼດວິດີໂອ ແລະ ກຳນົດເສັ້ນຕັດຜ່ານ/ເຂດສັນຍານໄຟຈາລະຈອນ ເພື່ອເລີ່ມຕົ້ນລະບົບ AI</p>
                  </div>
                  <button 
                    onClick={() => router.push(`/upload-roi?camera=${camera.id}`)}
                    className="mt-2 flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-black text-xs uppercase tracking-widest"
                  >
                    ກຳນົດຂອບເຂດ ROI ດຽວນີ້
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Camera Specific Violations Table */}
      <section className="bg-card rounded-[2.5rem] p-8 border border-border shadow-lg">
        <div className="flex items-center gap-3 border-b border-border pb-4 mb-6">
          <Activity className="size-5 text-rose-500" />
          <h3 className="text-lg font-black text-white uppercase tracking-tight">ປະຫວັດການລະເມີດຫຼ້າສຸດ (ກ້ອງນີ້)</h3>
        </div>

        <DataTable
          headers={["ລຳດັບ", "ໄອດີລົດ", "ປະເພດ", "ວັນທີ ແລະ ເວລາ", "ສະຖານະໄຟ", "ຮູບຫຼັກຖານ", "ຮູບລົດ", "ປ້າຍທະບຽນ", "ວິດີໂອ", "ຈັດການ"]}
          loading={loading}
          columnCount={10}
        >
          {violations.map((v, index) => {
            const openImg = (path: string | undefined, label: string) => {
              if (!path) return
              setSelectedImage(`http://localhost:8000/${path}`)
              setSelectedImageLabel(label)
            }
            const contextSrc = v.context_image_path || v.image_path
            return (
              <DataTableRow key={v.id}>
                <DataTableCell className="font-bold text-slate-500">#{index + 1}</DataTableCell>
                <DataTableCell className="font-mono font-black text-white tracking-tighter uppercase text-base">VkH-{v.vehicle_id}</DataTableCell>
                <DataTableCell>
                  <span className="px-3 py-1 rounded-lg bg-sky-500/10 text-sky-400 font-black text-[10px] uppercase border border-sky-500/20">
                    {translateVehicleType(v.vehicle_type)}
                  </span>
                </DataTableCell>
                <DataTableCell>
                  <div className="flex flex-col gap-0.5">
                    <span suppressHydrationWarning className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase opacity-70"><Calendar className="size-3 text-sky-500" /> {new Date(v.time_stamp).toLocaleDateString('lo-LA')}</span>
                    <span suppressHydrationWarning className="flex items-center justify-center gap-1.5 text-xs font-black text-white"><Clock className="size-3 text-sky-500" /> {new Date(v.time_stamp).toLocaleTimeString('lo-LA')}</span>
                  </div>
                </DataTableCell>
                <DataTableCell>
                  <span className={cn("inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-black text-[10px] border uppercase shadow-sm", getLightStatusColor(v.light_status))}>
                    <div className={cn("size-1.5 rounded-full animate-pulse", v.light_status.toLowerCase() === 'red' ? 'bg-rose-500' : v.light_status.toLowerCase() === 'green' ? 'bg-emerald-500' : 'bg-slate-400')} />
                    {translateLightStatus(v.light_status)}
                  </span>
                </DataTableCell>
                <DataTableCell align="center">
                  <div className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto" onClick={() => openImg(contextSrc, "ຮູບຫຼັກຖານ")}>
                    <img src={`http://localhost:8000/${contextSrc}`} alt="Evidence" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-sky-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 className="size-4 text-white drop-shadow-md" />
                    </div>
                  </div>
                </DataTableCell>
                <DataTableCell align="center">
                  {v.crop_image_path ? (
                    <div className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto" onClick={() => openImg(v.crop_image_path, "ຮູບລົດ")}>
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
                <DataTableCell align="center">
                  {v.plate_image_path ? (
                    <div className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto" onClick={() => openImg(v.plate_image_path, "ປ້າຍທະບຽນ")}>
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
                <DataTableCell align="center">
                  <div className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto transition-all active:scale-95" onClick={() => setSelectedVideo(`http://localhost:8000/${v.video_path}`)}>
                    <img src={`http://localhost:8000/${contextSrc}`} alt="Video Cover" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-60" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 group-hover:scale-110 transition-transform">
                        <Play className="size-4 text-white fill-current" />
                      </div>
                    </div>
                  </div>
                </DataTableCell>
                <DataTableCell align="center">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setPreviewViolation(v)} className="p-2.5 rounded-xl bg-slate-900 text-sky-400 border border-white/5 shadow-lg hover:bg-slate-800 transition-all transform active:scale-90" title="ພິມລາຍງານ">
                      <Printer className="size-4" />
                    </button>
                    <button onClick={() => setDeleteId(v.id)} className="p-2.5 rounded-xl bg-slate-900 text-rose-500 border border-white/5 shadow-lg hover:bg-slate-800 transition-all transform active:scale-90" title="ລຶບລາຍການ">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </DataTableCell>
              </DataTableRow>
            )
          })}
        </DataTable>
      </section>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/95 p-6 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-slate-900/50">
              <div className="flex items-center gap-4 text-sky-400">
                 <div className="p-3 bg-sky-500/10 rounded-2xl"><Eye className="size-6" /></div>
                 <h3 className="font-black text-2xl uppercase tracking-tighter text-white">{selectedImageLabel || "ຮູບຫຼັກຖານ"}</h3>
              </div>
              <button 
                onClick={() => setSelectedImage(null)}
                className="p-3 bg-white/5 hover:bg-rose-500/20 rounded-full transition-colors text-white/55 hover:text-rose-500"
              >
                <X className="size-6" />
              </button>
            </div>
            <div className="bg-black p-4 text-center">
               <img src={selectedImage} alt="Violation Full Evidence" className="w-full h-auto max-h-[75vh] object-contain rounded-2xl shadow-2xl" />
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
                className="p-3 bg-white/5 hover:bg-rose-500/20 rounded-full transition-colors text-white/55 hover:text-rose-500"
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

      {/* Reusable Print Preview Modal */}
      <PrintPreviewModal 
        violation={previewViolation} 
        onClose={() => setPreviewViolation(null)} 
      />
    </DashboardShell>
  )
}
