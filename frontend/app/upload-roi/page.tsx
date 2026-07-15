"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { UploadCloud, Settings2, Save, ArrowLeft, Loader2, Target, CheckCircle2, Image as ImageIcon, RefreshCcw, PlayCircle, Info, Camera, MapPin } from "lucide-react"
import { ROIEditor } from "@/components/roi-editor"
import { cn } from "@/lib/utils"

type Step = "UPLOAD" | "CONFIGURE" | "PREVIEW"

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

export default function UploadRoiPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>("UPLOAD")
  const [mode, setMode] = useState<"CCTV" | "MANUAL">("CCTV")
  const [cameras, setCameras] = useState<CCTV[]>([])
  const [loadingCameras, setLoadingCameras] = useState(false)
  const [selectedCamera, setSelectedCamera] = useState<CCTV | null>(null)
  
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [configPreview, setConfigPreview] = useState<any>(null)
  const [isPortrait, setIsPortrait] = useState(false)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  // 1. Fetch cameras list
  useEffect(() => {
    if (mode === "CCTV") {
      const fetchCameras = async () => {
        setLoadingCameras(true)
        try {
          const res = await fetch("http://localhost:8000/cameras")
          if (res.ok) {
            const data = await res.json()
            const activeCams = data.filter((c: CCTV) => c.is_active)
            setCameras(activeCams)
            
            const camParam = searchParams.get("camera")
            if (camParam) {
              const target = activeCams.find((c: CCTV) => c.id === parseInt(camParam))
              if (target) {
                handleSelectCamera(target)
              }
            }
          }
        } catch (e) {
          console.error("Fetch Cameras Error:", e)
        } finally {
          setLoadingCameras(false)
        }
      }
      fetchCameras()
    }
  }, [mode, searchParams])

  // 2. Fetch current default config on load as fallback (Manual Mode)
  useEffect(() => {
    if (mode === "MANUAL") {
      const checkExistingConfig = async () => {
        try {
          const res = await fetch("http://localhost:8000/get-roi")
          const data = await res.json()
          if (data && (data.roi_y !== null || data.roi_x !== null)) {
            setConfigPreview(data)
            if (data.has_reference) {
              const refUrl = `http://localhost:8000/static-data/roi_reference.jpg?t=${Date.now()}`
              setSourceUrl(refUrl)
              setStep("PREVIEW")
            }
          }
        } catch (e) { console.error("Load Config Error:", e) }
      }
      checkExistingConfig()
    }
  }, [mode])

  // 3. Handle camera selection
  const handleSelectCamera = async (cam: CCTV) => {
    setSelectedCamera(cam)
    setSourceUrl(null)
    setConfigPreview(null)
    
    try {
      const res = await fetch(`http://localhost:8000/get-roi?camera_id=${cam.id}`)
      const data = await res.json()
      if (data && (data.roi_y !== null || data.roi_x !== null || data.stop_line !== null)) {
        setConfigPreview(data)
        if (data.has_reference) {
          const refUrl = `http://localhost:8000/static-data/roi_reference_${cam.id}.jpg?t=${Date.now()}`
          setSourceUrl(refUrl)
          setStep("PREVIEW")
          return
        }
      }
    } catch (e) {
      console.error("Load Camera Config Error:", e)
    }
    
    if (cam.rtsp_url) {
      setSourceUrl(`http://localhost:8000/${cam.rtsp_url}#t=0.1`)
      setStep("CONFIGURE")
    } else {
      setStep("UPLOAD")
    }
  }

  // 4. Draw ROI on preview canvas
  useEffect(() => {
    if (step === "PREVIEW" && configPreview && sourceUrl) {
      const isVideo = sourceUrl.includes(".mp4") || sourceUrl.includes(".mov") || sourceUrl.includes("#t=")
      
      const drawToCanvas = (media: HTMLVideoElement | HTMLImageElement) => {
        const canvas = previewCanvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const mWidth = isVideo ? (media as HTMLVideoElement).videoWidth : (media as HTMLImageElement).naturalWidth
        const mHeight = isVideo ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight

        // Update orientation state
        const newIsPortrait = mHeight > mWidth
        setIsPortrait(prev => prev !== newIsPortrait ? newIsPortrait : prev)

        const displayWidth = newIsPortrait ? 450 : 1000
        const scale = displayWidth / mWidth
        canvas.width = displayWidth
        canvas.height = mHeight * scale

        ctx.drawImage(media, 0, 0, canvas.width, canvas.height)

        const { roi_y, roi_x, traffic_light_box, vehicle_zone, stop_line } = configPreview
        
        if (stop_line && stop_line.length >= 2) {
          ctx.strokeStyle = "#38bdf8"
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.moveTo(stop_line[0][0] * scale, stop_line[0][1] * scale)
          ctx.lineTo(stop_line[1][0] * scale, stop_line[1][1] * scale)
          ctx.stroke()
        } else if (roi_y) {
          ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(0, roi_y * scale); ctx.lineTo(canvas.width, roi_y * scale); ctx.stroke();
        }
        
        if (roi_x) {
          ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(roi_x * scale, 0); ctx.lineTo(roi_x * scale, canvas.height); ctx.stroke();
        }
        if (traffic_light_box) {
          const [x1, y1, x2, y2] = traffic_light_box
          ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 3;
          ctx.strokeRect(x1 * scale, y1 * scale, (x2 - x1) * scale, (y2 - y1) * scale);
        }
        if (vehicle_zone) {
          const [x1, y1, x2, y2] = vehicle_zone
          ctx.strokeStyle = "#10b981"; ctx.lineWidth = 3;
          ctx.strokeRect(x1 * scale, y1 * scale, (x2 - x1) * scale, (y2 - y1) * scale);
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
  }, [step, configPreview, sourceUrl])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setSourceUrl(url + (file.type.startsWith("video") ? "#t=0.1" : ""))
    setStep("CONFIGURE")
  }

  // Camera specific video upload
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const handleCameraVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedCamera) return
    
    setIsUploadingVideo(true)
    const formData = new FormData()
    formData.append("file", file)
    
    try {
      const response = await fetch(`http://localhost:8000/cameras/${selectedCamera.id}/upload-video`, {
        method: "POST",
        body: formData,
      })
      if (!response.ok) throw new Error("Upload failed")
      
      const localUrl = URL.createObjectURL(file)
      setSourceUrl(localUrl + "#t=0.1")
      setStep("CONFIGURE")
    } catch (err) {
      console.error(err)
      alert("ເກີດຂໍ້ຜິດພາດໃນການອັບໂຫຼດ")
    } finally {
      setIsUploadingVideo(false)
    }
  }

  const handleStartConfigureCamera = () => {
    if (!selectedCamera || !selectedCamera.rtsp_url) return
    setSourceUrl(`http://localhost:8000/${selectedCamera.rtsp_url}#t=0.1`)
    setStep("CONFIGURE")
  }

  const handleSaveConfig = async (configData: any, frameBlob: Blob) => {
    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append("file", frameBlob, "roi_reference.jpg")
      
      const refUrl = selectedCamera 
        ? `http://localhost:8000/set-roi-reference?camera_id=${selectedCamera.id}`
        : "http://localhost:8000/set-roi-reference"
        
      await fetch(refUrl, { method: "POST", body: formData })

      const savePayload = {
        ...configData,
        camera_id: selectedCamera ? selectedCamera.id : null
      }

      const response = await fetch("http://localhost:8000/set-roi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savePayload),
      })

      if (response.ok) {
        setConfigPreview(savePayload)
        const newRefUrl = selectedCamera
          ? `http://localhost:8000/static-data/roi_reference_${selectedCamera.id}.jpg?t=${Date.now()}`
          : `http://localhost:8000/static-data/roi_reference.jpg?t=${Date.now()}`
        setSourceUrl(newRefUrl)
        setStep("PREVIEW")
      }
    } catch (error) {
      alert("ເກີດຂໍ້ຜິດພາດໃນການເຊື່ອມຕໍ່ກັບເຊີເວີ")
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetState = () => {
    setSelectedCamera(null)
    setSourceUrl(null)
    setConfigPreview(null)
    setStep("UPLOAD")
  }

  return (
    <DashboardShell title="ຕັ້ງຄ່າພື້ນທີ່ກວດຈັບ (ROI Settings)">
      
      {/* Mode Switcher inside dashboard shell header */}
      {step === "UPLOAD" && !selectedCamera && (
        <div className="flex gap-4 max-w-md mx-auto mb-8 bg-slate-900/50 p-1.5 rounded-2xl border border-white/5">
          <button
            onClick={() => { setMode("CCTV"); handleResetState(); }}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2",
              mode === "CCTV" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "text-slate-400 hover:text-white"
            )}
          >
            <Camera className="size-4" /> ຕັ້ງຄ່າສະເພາະກ້ອງ
          </button>
          <button
            onClick={() => { setMode("MANUAL"); handleResetState(); }}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2",
              mode === "MANUAL" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "text-slate-400 hover:text-white"
            )}
          >
            <ImageIcon className="size-4" /> ອັບໂຫຼດໄຟລ໌ອິດສະຫຼະ
          </button>
        </div>
      )}

      {step === "UPLOAD" && (
        <div className="mx-auto max-w-5xl animate-in fade-in duration-500 pb-10">
          {mode === "MANUAL" ? (
            <div className="max-w-4xl mx-auto py-10">
              <div className="flex flex-col items-center text-center mb-12">
                <div className="bg-panel p-5 rounded-3xl text-sky-400 mb-6 shadow-2xl border border-white/5">
                   <Target className="size-12" />
                </div>
                <h2 className="text-4xl font-black tracking-tight mb-4 text-white uppercase">ເລືອກໄຟລ໌ເພື່ອຕັ້ງຄ່າລະບົບ</h2>
                <p className="text-slate-400 text-lg max-w-xl font-medium">
                  ກະລຸນາອັບໂຫຼດຮູບພາບ ຫຼື ວິດີໂອ ເພື່ອກຳນົດເສັ້ນກວດຈັບ ແລະ ຂອບເຂດໄຟສັນຍານຈາລະຈອນ (Default).
                </p>
              </div>

              <div
                onClick={() => document.getElementById("file-input")?.click()}
                className="group relative flex min-h-[400px] cursor-pointer flex-col items-center justify-center rounded-[4rem] border-4 border-dashed border-white/10 bg-slate-900/40 p-12 text-center transition-all hover:border-sky-500/50 hover:bg-sky-500/5 shadow-2xl overflow-hidden"
              >
                <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-panel text-sky-400 group-hover:scale-110 transition-transform duration-500 shadow-xl border border-white/5">
                  <UploadCloud className="size-10" />
                </div>
                <h3 className="text-2xl font-black text-white uppercase">Click to Upload</h3>
                <input id="file-input" type="file" accept="video/*,image/*" className="hidden" onChange={handleFileChange} />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {!selectedCamera ? (
                <div>
                  <h3 className="text-slate-400 font-black text-xs uppercase tracking-widest mb-4 ml-1 opacity-70">ກະລຸນາເລືອກກ້ອງວົງຈອນປິດ</h3>
                  {loadingCameras ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="size-10 text-sky-500 animate-spin" />
                    </div>
                  ) : cameras.length === 0 ? (
                    <div className="p-10 text-center bg-slate-900/50 rounded-3xl border border-white/5 text-slate-400">
                      ຍັງບໍ່ມີກ້ອງໃນລະບົບ ຫຼື ບໍ່ມີກ້ອງທີ່ເປີດໃຊ້ງານ
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {cameras.map(cam => (
                        <div
                          key={cam.id}
                          onClick={() => handleSelectCamera(cam)}
                          className="group relative bg-slate-900/60 border border-white/5 rounded-3xl p-6 hover:border-sky-500/40 hover:bg-sky-500/5 cursor-pointer transition-all shadow-xl flex flex-col justify-between min-h-[160px]"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="p-3 bg-slate-800 rounded-2xl text-sky-400 group-hover:scale-105 transition-transform duration-300">
                              <Camera className="size-5" />
                            </div>
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border",
                              cam.rtsp_url ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            )}>
                              {cam.rtsp_url ? "ມີວິດີໂອແລ້ວ" : "ຍັງບໍ່ມີວິດີໂอ"}
                            </span>
                          </div>
                          <div className="mt-4">
                            <h4 className="text-white font-black text-lg group-hover:text-sky-400 transition-colors uppercase tracking-tight">{cam.location_name}</h4>
                            <p className="text-[10px] text-slate-500 font-bold mt-1 flex items-center gap-1 uppercase">
                              <MapPin className="size-3 text-rose-500" /> {cam.village}, {cam.district}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-2xl mx-auto bg-slate-900 border border-white/5 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                  <div className="flex items-center gap-4 border-b border-white/5 pb-6 mb-6">
                    <button onClick={handleResetState} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-white">
                      <ArrowLeft className="size-4" />
                    </button>
                    <div>
                      <span className="text-[9px] font-black text-sky-400 uppercase tracking-widest opacity-70">ເລືອກກ້ອງແລ້ວ</span>
                      <h3 className="text-white font-black text-xl uppercase tracking-tight">CCTV-{selectedCamera.camera_id} : {selectedCamera.location_name}</h3>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ລາຍລະອຽດສະຖານທີ່</span>
                      <p className="text-sm font-bold text-slate-300 flex items-center gap-1.5">
                        <MapPin className="size-4 text-rose-500" /> {selectedCamera.village}, {selectedCamera.district}, {selectedCamera.province}
                      </p>
                    </div>

                    {selectedCamera.rtsp_url ? (
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={handleStartConfigureCamera}
                          className="w-full flex items-center justify-center gap-3 py-4 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-sky-500/20 active:scale-95 transition-all"
                        >
                          <Settings2 className="size-4" /> ເລີ່ມຕັ້ງຄ່າພື້ນທີ່ກວດຈັບ (ROI)
                        </button>
                        <div className="relative">
                          <input type="file" id="cam-file" accept="video/*" className="hidden" onChange={handleCameraVideoChange} />
                          <button
                            onClick={() => document.getElementById("cam-file")?.click()}
                            disabled={isUploadingVideo}
                            className="w-full flex items-center justify-center gap-3 py-4 bg-slate-800 text-slate-300 rounded-2xl font-black uppercase tracking-widest text-xs border border-white/5 hover:bg-slate-750 transition-all"
                          >
                            {isUploadingVideo ? (
                              <>
                                <Loader2 className="size-4 animate-spin text-sky-400" /> ກຳລັງອັບໂຫຼດ...
                              </>
                            ) : (
                              <>
                                <UploadCloud className="size-4 text-sky-400" /> ອັບໂຫຼດວິດີໂອໃໝ່ແທນທີ່
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-white/5 rounded-3xl border border-white/5">
                        <p className="text-slate-400 mb-6 text-sm">ກ້ອງນີ້ຍັງບໍ່ມີວິດີໂອອ້າງອິງໃນລະບົບ. ກະລຸນາອັບໂຫຼດວິດີໂອສັ້ນເພື່ອເລີ່ມການຕັ້ງຄ່າ.</p>
                        <input type="file" id="cam-file-init" accept="video/*" className="hidden" onChange={handleCameraVideoChange} />
                        <button
                          onClick={() => document.getElementById("cam-file-init")?.click()}
                          disabled={isUploadingVideo}
                          className="w-full py-4 bg-sky-500 hover:bg-sky-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-sky-500/20 flex items-center justify-center gap-3"
                        >
                          {isUploadingVideo ? <Loader2 className="size-4 animate-spin text-white" /> : <UploadCloud className="size-4" />} ອັບໂຫຼດວິດີໂອກ້ອງ
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === "CONFIGURE" && sourceUrl && (
        <div className="max-w-[1400px] mx-auto animate-in zoom-in-95 fade-in duration-500 pb-10">
          <div className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-4 mb-6 flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-4 ml-4">
              <button onClick={handleResetState} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/50 hover:text-white"><ArrowLeft className="size-5" /></button>
              <div>
                <h3 className="text-white font-black text-lg tracking-tight uppercase">
                  {selectedCamera ? `ກຳນົດພິກັດກ້ອງ CCTV-${selectedCamera.camera_id}` : "ກຳລັງກຳນົດພິກັດ (Setup)"}
                </h3>
                <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em]">
                  {selectedCamera ? `${selectedCamera.location_name} - Setup Mode` : "Manual Coordinate Calibration Mode"}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-slate-950 p-8 rounded-[3.5rem] border border-white/5 shadow-2xl flex items-center justify-center overflow-hidden min-h-[500px]">
            <ROIEditor videoUrl={sourceUrl} cameraId={selectedCamera?.id} onSave={handleSaveConfig} onCancel={handleResetState} />
          </div>
        </div>
      )}

      {step === "PREVIEW" && (
        <div className="max-w-[1400px] mx-auto animate-in slide-in-from-bottom-10 fade-in duration-700 pb-20 text-white">
          <div className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-4 mb-6 flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-4 ml-4">
              <button onClick={handleResetState} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/50 hover:text-white"><ArrowLeft className="size-5" /></button>
              <div>
                <h3 className="text-white font-black text-lg tracking-tight uppercase">
                  {selectedCamera ? `ພິກັດກ້ອງ CCTV-${selectedCamera.camera_id}` : "ພະຍາຍາມສະແດງຜົນພິກັດ ROI"}
                </h3>
                <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em]">
                  {selectedCamera ? `${selectedCamera.location_name} - Preview Mode` : "Global Default ROI Preview"}
                </p>
              </div>
            </div>
          </div>
          <div className={cn("flex gap-10", isPortrait ? "flex-row items-start justify-center" : "flex-col")}>
            <div className={cn("bg-slate-900 border border-white/5 p-4 rounded-[3.5rem] shadow-2xl overflow-hidden bg-black", isPortrait ? "w-[480px] shrink-0" : "w-full max-w-5xl mx-auto")}>
              <div className="relative rounded-[2.5rem] overflow-hidden flex items-center justify-center">
                <canvas ref={previewCanvasRef} className="max-w-full h-auto object-contain rounded-[2rem] shadow-inner" />
              </div>
            </div>
            <div className={cn("flex flex-col gap-6", isPortrait ? "flex-1 max-w-md" : "w-full max-w-5xl mx-auto")}>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-8 flex items-center gap-6 shadow-inner">
                <div className="size-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-xl shrink-0"><CheckCircle2 className="size-8" /></div>
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-1">ບັນທຶກສຳເລັດ!</h2>
                  <p className="text-slate-400 font-bold text-xs leading-relaxed">
                    {selectedCamera ? `ພິກັດເຫຼົ່ານີ້ຈະຖືກໃຊ້ເປັນຄ່າສະເພາະຂອງກ້ອງ CCTV-${selectedCamera.camera_id}` : "ພິກັດເຫຼົ່ານີ້ຈະຖືກໃຊ້ເປັນຄ່າ Default ຂອງລະບົບ."}
                  </p>
                </div>
              </div>
              <div className={cn("grid gap-6", isPortrait ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3")}>
                <div className={cn("bg-slate-900 border border-white/5 p-8 rounded-[2.5rem] shadow-xl", !isPortrait && "lg:col-span-2")}>
                   <h4 className="font-black text-sky-400 uppercase tracking-[0.2em] text-xs mb-6 flex items-center gap-2 opacity-60"><Settings2 className="size-4" /> ລາຍລະອຽດພິກັດ ROI</h4>
                   <div className="grid grid-cols-3 gap-3">
                      <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1.5 text-white">
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">ເສັ້ນນອນ (Y)</span>
                        <span className="font-black text-white text-2xl">
                          {configPreview?.stop_line ? "ກຳນົດແລ້ວ" : (configPreview?.roi_y ?? "-")}
                        </span>
                      </div>
                      <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1.5">
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">ເສັ້ນຕັ້ງ (X)</span>
                        <span className="font-black text-white text-2xl">{configPreview?.roi_x ?? "-"}</span>
                      </div>
                      <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1.5 text-white">
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">ຂອບເຂດໄຟ</span>
                        <span className="font-black text-emerald-400 text-xs uppercase tracking-widest mt-1">
                          {configPreview?.traffic_light_box ? "ກຳນົດແລ້ວ" : "ຍັງບໍ່ກຳນົດ"}
                        </span>
                      </div>
                   </div>
                   <div className="mt-8 flex gap-3">
                      <button onClick={() => setStep("CONFIGURE")} className="flex-1 flex items-center justify-center gap-3 py-4 bg-panel border border-white/5 rounded-2xl font-black text-xs uppercase tracking-widest text-white hover:bg-slate-800 transition-all active:scale-95">
                         <RefreshCcw className="size-4 text-sky-400" /> ແກ້ໄຂໃໝ່
                      </button>
                      <button onClick={handleResetState} className="flex-1 flex items-center justify-center gap-3 py-4 bg-panel border border-white/5 rounded-2xl font-black text-xs uppercase tracking-widest text-white hover:bg-slate-800 transition-all active:scale-95">
                         <ImageIcon className="size-4 text-emerald-400" /> ປ່ຽນແຫຼ່ງຂໍ້ມູນ
                      </button>
                   </div>
                </div>
                <button onClick={() => router.push("/monitor")} className="w-full flex items-center justify-center gap-3 py-6 bg-sky-500 text-white rounded-[2.5rem] font-black uppercase tracking-[0.2em] text-sm shadow-2xl shadow-sky-500/40 hover:scale-105 hover:bg-sky-600 transition-all active:scale-95">
                   <PlayCircle className="size-6" /> ເລີ່ມການກวดຈັບ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSaving && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center">
            <div className="bg-slate-900 border border-white/10 p-12 rounded-[4rem] shadow-2xl flex flex-col items-center gap-6">
               <Loader2 className="size-16 text-sky-400 animate-spin" />
               <p className="text-white font-black text-xl uppercase tracking-[0.2em]">ກຳລັງບັນທຶກ...</p>
            </div>
        </div>
      )}
    </DashboardShell>
  )
}
