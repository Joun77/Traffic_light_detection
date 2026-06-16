"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { UploadCloud, Settings2, Save, ArrowLeft, Loader2, Target, CheckCircle2, Image as ImageIcon, RefreshCcw, PlayCircle, Info } from "lucide-react"
import { ROIEditor } from "@/components/roi-editor"
import { cn } from "@/lib/utils"

type Step = "UPLOAD" | "CONFIGURE" | "PREVIEW"

export default function UploadRoiPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("UPLOAD")
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [configPreview, setConfigPreview] = useState<any>(null)
  const [isPortrait, setIsPortrait] = useState(false)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  // 1. Fetch current config on load
  useEffect(() => {
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
  }, [])

  // 2. Draw ROI on preview canvas
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

        // Update orientation state ONLY if it actually changed to prevent loop
        const newIsPortrait = mHeight > mWidth
        setIsPortrait(prev => prev !== newIsPortrait ? newIsPortrait : prev)

        const displayWidth = newIsPortrait ? 450 : 1000
        const scale = displayWidth / mWidth
        canvas.width = displayWidth
        canvas.height = mHeight * scale

        ctx.drawImage(media, 0, 0, canvas.width, canvas.height)

        const { roi_y, roi_x, traffic_light_box, vehicle_zone } = configPreview
        if (roi_y) {
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

  const handleSaveConfig = async (configData: any, frameBlob: Blob) => {
    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append("file", frameBlob, "roi_reference.jpg")
      await fetch("http://localhost:8000/set-roi-reference", { method: "POST", body: formData })

      const response = await fetch("http://localhost:8000/set-roi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configData),
      })

      if (response.ok) {
        setConfigPreview(configData)
        setSourceUrl(`http://localhost:8000/static-data/roi_reference.jpg?t=${Date.now()}`)
        setStep("PREVIEW")
      }
    } catch (error) {
      alert("ເກີດຂໍ້ຜິດພາດໃນການເຊື່ອມຕໍ່ກັບເຊີເວີ")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DashboardShell title="ຕັ້ງຄ່າພື້ນທີ່ກວດຈັບ (ROI Settings)">
      
      {step === "UPLOAD" && (
        <div className="mx-auto max-w-4xl py-10 animate-in fade-in duration-500">
          <div className="flex flex-col items-center text-center mb-12">
            <div className="bg-panel p-5 rounded-3xl text-sky-400 mb-6 shadow-2xl border border-white/5">
               <Target className="size-12" />
            </div>
            <h2 className="text-4xl font-black tracking-tight mb-4 text-white uppercase tracking-tighter">ເລືອກໄຟລ໌ເພື່ອຕັ້ງຄ່າລະບົບ</h2>
            <p className="text-slate-400 text-lg max-w-xl font-medium">
              ກະລຸນາອັບໂຫຼດຮູບພາບ ຫຼື ວິດີໂອ ເພື່ອກຳນົດເສັ້ນກວດຈັບ ແລະ ຂອບເຂດໄຟສັນຍານຈາລະຈອນ.
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
      )}

      {step === "CONFIGURE" && sourceUrl && (
        <div className="max-w-[1400px] mx-auto animate-in zoom-in-95 fade-in duration-500 pb-10">
          <div className="bg-slate-900 border border-white/5 rounded-[2.5rem] p-4 mb-6 flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-4 ml-4">
              <button onClick={() => setStep("UPLOAD")} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all text-white/50 hover:text-white"><ArrowLeft className="size-5" /></button>
              <div>
                <h3 className="text-white font-black text-lg tracking-tight uppercase">ກຳລັງກຳນົດພິກັດ (Setup)</h3>
                <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em]">Manual Coordinate Calibration Mode</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-950 p-8 rounded-[3.5rem] border border-white/5 shadow-2xl flex items-center justify-center overflow-hidden min-h-[500px]">
            <ROIEditor videoUrl={sourceUrl} onSave={handleSaveConfig} onCancel={() => setStep("UPLOAD")} />
          </div>
        </div>
      )}

      {step === "PREVIEW" && (
        <div className="max-w-[1400px] mx-auto animate-in slide-in-from-bottom-10 fade-in duration-700 pb-20 text-white">
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
                  <p className="text-slate-400 font-bold text-xs leading-relaxed text-white">ພິກັດເຫຼົ່ານີ້ຈະຖືກໃຊ້ເປັນຄ່າ Default ຂອງລະບົບ.</p>
                </div>
              </div>
              <div className={cn("grid gap-6", isPortrait ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3")}>
                <div className={cn("bg-slate-900 border border-white/5 p-8 rounded-[2.5rem] shadow-xl", !isPortrait && "lg:col-span-2")}>
                   <h4 className="font-black text-sky-400 uppercase tracking-[0.2em] text-[10px] mb-6 flex items-center gap-2 opacity-60"><Settings2 className="size-3" /> ລາຍລະອຽດພິກັດ ROI</h4>
                   <div className="grid grid-cols-3 gap-3">
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1 text-white">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ເສັ້ນນອນ (Y)</span>
                        <span className="font-black text-white text-base">{configPreview?.roi_y}</span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ເສັ້ນຕັ້ງ (X)</span>
                        <span className="font-black text-white text-base">{configPreview?.roi_x}</span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-1 text-white">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">ຂອບເຂດໄຟ</span>
                        <span className="font-black text-emerald-400 text-[9px] uppercase tracking-tighter text-white">ກຳນົດແລ້ວ</span>
                      </div>
                   </div>
                   <div className="mt-8 flex gap-3">
                      <button onClick={() => setStep("CONFIGURE")} className="flex-1 flex items-center justify-center gap-3 py-4 bg-panel border border-white/5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white hover:bg-slate-800 transition-all active:scale-95">
                         <RefreshCcw className="size-4 text-sky-400" /> ແກ້ໄຂໃໝ່
                      </button>
                      <button onClick={() => setStep("UPLOAD")} className="flex-1 flex items-center justify-center gap-3 py-4 bg-panel border border-white/5 rounded-2xl font-black text-[10px] uppercase tracking-widest text-white hover:bg-slate-800 transition-all active:scale-95">
                         <ImageIcon className="size-4 text-emerald-400" /> ປ່ຽນແຫຼ່ງຂໍ້ມູນ
                      </button>
                   </div>
                </div>
                <button onClick={() => router.push("/monitor")} className="w-full flex items-center justify-center gap-3 py-6 bg-sky-500 text-white rounded-[2.5rem] font-black uppercase tracking-[0.2em] text-sm shadow-2xl shadow-sky-500/40 hover:scale-105 hover:bg-sky-600 transition-all active:scale-95">
                   <PlayCircle className="size-6" /> ເລີ່ມການກວດຈັບ
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
