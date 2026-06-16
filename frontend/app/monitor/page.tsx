"use client"

import { useState, useEffect, useRef } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { StopCircle, RotateCcw, Clock, Car, Eye, Activity, ShieldAlert, CheckCircle2, ChevronDown, Camera, Printer, Play, X } from "lucide-react"
import { useRouter } from "next/navigation"
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
  const [mounted, setMounted] = useState(false)
  const [cameras, setCameras] = useState<CCTV[]>([])
  const [selectedCamera, setSelectedCamera] = useState<CCTV | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  
  const [sessionViolations, setSessionViolations] = useState<Violation[]>([])
  const [sessionCount, setSessionCount] = useState(0)
  const [lightStatus, setLightStatus] = useState<string>("unknown")
  
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null)
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<"stop" | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    setMounted(true)
    const init = async () => {
      try {
        const res = await fetch("http://localhost:8000/cameras")
        if (res.ok) {
          const data: CCTV[] = await res.json()
          const activeOnes = data.filter(c => c.is_active)
          setCameras(activeOnes)
          if (activeOnes.length > 0) handleCameraSelect(activeOnes[0])
        }
      } catch (err) { console.error(err) }
    }
    init()

    const eventSource = new EventSource("http://localhost:8000/events")
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === "new_violation") {
          setSessionViolations(prev => [payload.data, ...prev])
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
    
    if (cam.rtsp_url) {
      setIsProcessing(false)
      try {
        await fetch("http://localhost:8000/stop-detection", { method: "POST" })
        const roiRes = await fetch("http://localhost:8000/get-roi")
        const roiConfig = await roiRes.json()
        
        const startRes = await fetch("http://localhost:8000/start-detection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...roiConfig, video_path: cam.rtsp_url })
        })

        if (startRes.ok) {
           setTimeout(() => setIsProcessing(true), 1000)
        }
      } catch (e) { console.error(e) }
    }
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
    <DashboardShell title="ຕິດຕາມສົດ (Live Monitor)">
      <div className="flex flex-col gap-4 h-[calc(100vh-140px)] overflow-hidden">
        
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
                <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">ລະບົບກຳລັງເຮັດວຽກ</p>
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

        {/* --- Large Video Feed --- */}
        <div className="relative z-0 flex-1 bg-black rounded-[2.5rem] border-4 border-slate-900 shadow-2xl overflow-hidden flex items-center justify-center">
            {isProcessing ? (
              <img 
                src={`http://localhost:8000/video-feed?t=${selectedCamera?.id}`}
                alt="AI Feed" 
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <div className="size-24 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
                    <Activity className="absolute inset-0 m-auto size-8 text-sky-400 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-black text-white uppercase tracking-[0.3em]">ກຳລັງເລີ່ມຕົ້ນລະບົບ AI...</h3>
              </div>
            )}
            
            <div className="absolute top-8 right-8 flex flex-col gap-4">
               <div className={cn(
                  "px-8 py-4 rounded-3xl border-2 backdrop-blur-xl shadow-2xl flex flex-col items-center min-w-[180px] transition-all duration-500",
                  lightStatus === 'red' ? 'bg-rose-500/20 border-rose-500 text-rose-500' : 
                  lightStatus === 'green' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 
                  'bg-slate-900/40 border-slate-500 text-slate-400'
               )}>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">ສະຖານະໄຟຈລາຈອນ</p>
                  <h4 className="text-3xl font-black">{translateLightStatus(lightStatus)}</h4>
               </div>
               
               <div className="px-8 py-4 rounded-3xl border-2 border-white/10 bg-slate-900/40 backdrop-blur-xl shadow-2xl flex flex-col items-center min-w-[180px]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">ການລະເມີດທັງໝົດ</p>
                  <h4 className="text-4xl font-black text-white">{sessionCount}</h4>
               </div>
            </div>
        </div>

        {/* --- Bottom Table (Standardized) --- */}
        <div className="h-[220px] flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 mb-2">
             <div className="flex items-center gap-3">
                <ShieldAlert className="size-5 text-rose-500" />
                <h4 className="font-black text-white uppercase tracking-wider text-sm">ລາຍການກວດຈັບຫຼ້າສຸດ</h4>
             </div>
             <div className="px-4 py-1 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-full font-black text-[10px] tracking-widest uppercase">ຂໍ້ມູນ Real Time</div>
          </div>

          <DataTable 
            headers={["ລຳດັບ", "Vehicle ID", "ປະເພດພາຫະນະ", "ເວລາ", "ຈັດການ"]}
            columnCount={5}
            emptyMessage="ກຳລັງລໍຖ້າການລະເມີດ..."
          >
            {sessionViolations.map((v, i) => (
              <DataTableRow key={v.id}>
                <DataTableCell className="font-bold text-slate-500">#{sessionViolations.length - i}</DataTableCell>
                <DataTableCell className="font-mono font-black text-white tracking-tighter uppercase">VkH-{v.vehicle_id}</DataTableCell>
                <DataTableCell>
                   <span className="px-3 py-1 rounded-lg bg-sky-500/10 text-sky-400 font-black text-[10px] uppercase border border-sky-500/20">
                      {translateVehicleType(v.vehicle_type)}
                   </span>
                </DataTableCell>
                <DataTableCell className="text-slate-400 font-medium text-xs">
                  {new Date(v.time_stamp).toLocaleTimeString('lo-LA')}
                </DataTableCell>
                <DataTableCell align="center">
                   <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => { setSelectedViolation(v); setIsPrintModalOpen(true); }}
                        className="p-2 bg-slate-800 hover:bg-sky-500 text-sky-400 hover:text-white rounded-lg transition-all"
                        title="ພິມລາຍງານ"
                      >
                         <Printer className="size-4" />
                      </button>
                   </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        </div>
      </div>

      <PrintPreviewModal 
        violation={selectedViolation} 
        onClose={() => { setIsPrintModalOpen(false); setSelectedViolation(null); }} 
      />

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
