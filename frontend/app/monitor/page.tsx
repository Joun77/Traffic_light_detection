"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { PlayCircle, StopCircle, RotateCcw, LayoutDashboard, AlertCircle, Clock, Car, Eye, Image as ImageIcon, Activity, ShieldAlert, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { ConfirmModal } from "@/components/confirm-modal"

interface Violation {
  id: number
  vehicle_id: number
  vehicle_type: string
  time_stamp: string
  light_status: string
  image_path: string
  video_path: string
}

function TrafficLightIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="8" y="2" width="8" height="20" rx="4" ry="4" fill="currentColor" fillOpacity="0.1" />
      <circle cx="12" cy="7" r="2.5" fill="currentColor" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle cx="12" cy="17" r="2.5" fill="currentColor" />
    </svg>
  )
}

export default function MonitorPage() {
  const router = useRouter()
  const [violations, setViolations] = useState<Violation[]>([])
  const [totalViolations, setTotalViolations] = useState(0)
  const [lightStatus, setLightStatus] = useState<string>("unknown")
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [isBackendConnected, setIsBackendConnected] = useState(true)
  const [activeModal, setActiveModal] = useState<"stop" | "home" | "reset" | null>(null)

  useEffect(() => {
    setMounted(true)
    const fetchInitialData = async () => {
      try {
        const [statsRes, violationsRes] = await Promise.all([
          fetch("http://localhost:8000/violation-stats"),
          fetch("http://localhost:8000/violations?limit=10")
        ])
        if (statsRes.ok) {
          const stats = await statsRes.json()
          setTotalViolations(stats.total_violations)
        }
        if (violationsRes.ok) {
          const data = await violationsRes.json()
          setViolations(data)
        }
        setIsBackendConnected(true)
      } catch (err) {
        console.error("Initial fetch error:", err)
        setIsBackendConnected(false)
      }
    }
    fetchInitialData()

    let eventSource: EventSource | null = null
    let reconnectTimeout: NodeJS.Timeout

    const connectSSE = () => {
      if (eventSource) eventSource.close()
      eventSource = new EventSource("http://localhost:8000/events")
      eventSource.onopen = () => setIsBackendConnected(true)
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === "new_violation") {
            setViolations(prev => [payload.data, ...prev].slice(0, 10))
            setTotalViolations(prev => prev + 1)
          } else if (payload.type === "light_status") {
            setLightStatus(payload.data)
          }
        } catch (e) { console.error("Error parsing SSE data:", e) }
      }
      eventSource.onerror = () => {
        setIsBackendConnected(false)
        if (eventSource) eventSource.close()
        clearTimeout(reconnectTimeout)
        reconnectTimeout = setTimeout(connectSSE, 3000)
      }
    }
    connectSSE()
    return () => {
      if (eventSource) eventSource.close()
      clearTimeout(reconnectTimeout)
    }
  }, [])

  const handleStop = async () => {
    try {
      const response = await fetch("http://localhost:8000/stop-detection", { method: "POST" })
      if (response.ok) router.push("/")
    } catch (error) { alert("ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບ Backend ໄດ້") }
    setActiveModal(null)
  }

  const getLightConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case "red": return { label: "RED", color: "bg-rose-500", border: "border-rose-500", text: "text-rose-500", glow: "shadow-rose-500/50" }
      case "green": return { label: "GREEN", color: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-500", glow: "shadow-emerald-500/50" }
      case "yellow": return { label: "YELLOW", color: "bg-amber-400", border: "border-amber-400", text: "text-amber-400", glow: "shadow-amber-400/50" }
      default: return { label: "CHECKING...", color: "bg-slate-400", border: "border-slate-400", text: "text-slate-400", glow: "shadow-slate-400/50" }
    }
  }

  const lightCfg = getLightConfig(lightStatus)

  return (
    <DashboardShell title="ໜ້າຕິດຕາມການລະເມີດຈາລະຈອນ (ສົດ)">
      <div className="space-y-6">
        
        {/* --- Stats Header --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. System Connectivity */}
          <div className={`group relative overflow-hidden rounded-[2rem] p-6 border-2 transition-all duration-500 ${isBackendConnected ? 'bg-emerald-400/5 border-emerald-400/20' : 'bg-rose-400/5 border-rose-400/20'}`}>
            <div className="flex items-center justify-between relative z-10">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">ສະຖານະການເຊື່ອມຕໍ່</p>
                <h3 className={`text-2xl font-black ${isBackendConnected ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {isBackendConnected ? 'Connected' : 'Disconnected'}
                </h3>
              </div>
              <div className={`p-4 rounded-2xl ${isBackendConnected ? 'bg-emerald-400/10 text-emerald-500 animate-pulse' : 'bg-rose-400/10 text-rose-500'}`}>
                <Activity className="size-8" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold opacity-60">
               {isBackendConnected ? <CheckCircle2 className="size-4" /> : <ShieldAlert className="size-4" />}
               <span>{isBackendConnected ? 'ລະບົບ AI ກຳລັງປະມວນຜົນ' : 'ກະລຸນາກວດສອບການເຊື່ອມຕໍ່...'}</span>
            </div>
          </div>

          {/* 2. Traffic Light Real-time Status */}
          <div className={`group relative overflow-hidden rounded-[2rem] border-2 ${lightCfg.border}/20 bg-card p-6 shadow-xl transition-all duration-500`}>
            <div className="flex items-center justify-between relative z-10">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 text-muted-foreground">ສັນຍານໄຟປັດຈຸບັນ</p>
                <h3 className={`text-2xl font-black ${lightCfg.text}`}>{lightCfg.label}</h3>
              </div>
              <div className={`p-4 rounded-2xl ${lightCfg.color}/10 ${lightCfg.text}`}>
                <TrafficLightIcon className="size-8" />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <div className={`h-3 w-8 rounded-full transition-all duration-300 ${lightStatus.toLowerCase() === 'red' ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.6)] scale-110' : 'bg-slate-200'}`} />
              <div className={`h-3 w-8 rounded-full transition-all duration-300 ${lightStatus.toLowerCase() === 'yellow' ? 'bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)] scale-110' : 'bg-slate-200'}`} />
              <div className={`h-3 w-8 rounded-full transition-all duration-300 ${lightStatus.toLowerCase() === 'green' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)] scale-110' : 'bg-slate-200'}`} />
            </div>
          </div>

          {/* 3. Violation Count */}
          <div className="group relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-rose-500 to-rose-600 p-6 text-white shadow-2xl shadow-rose-500/20">
            <div className="flex items-center justify-between relative z-10">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">ລວມການລະເມີດ</p>
                <h3 className="text-4xl font-black tracking-tighter">{totalViolations} <span className="text-sm font-bold opacity-60 ml-1 tracking-normal">ຄັ້ງ</span></h3>
              </div>
              <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md group-hover:rotate-12 transition-transform duration-500">
                <ShieldAlert className="size-8" />
              </div>
            </div>
          </div>

        </div>

        {/* --- Main Content: Feed & Controls --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Live Video Feed */}
          <div className="lg:col-span-9">
            <div className="relative overflow-hidden rounded-[3rem] border-[6px] border-sky-400/10 bg-black shadow-2xl aspect-video group">
              {mounted ? (
                <img 
                  src="http://localhost:8000/video-feed"
                  alt="AI Monitoring Feed" 
                  className="w-full h-full object-contain"
                  onError={(e) => { e.currentTarget.src = "https://placehold.co/1280x720/000000/38bdf8?text=ລໍຖ້າການເຊື່ອມຕໍ່ສັນຍານສົດ..." }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                  <div className="flex flex-col items-center gap-4">
                    <Activity className="size-12 text-sky-400 animate-spin" />
                    <p className="font-black text-sky-400/60 uppercase tracking-widest">ກຳລັງໂຫຼດຂໍ້ມູນ...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Sidebar */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <button 
              onClick={() => setActiveModal("stop")} 
              className="group flex-1 flex flex-col items-center justify-center gap-3 rounded-[2.5rem] bg-rose-500 text-white transition-all hover:bg-rose-600 shadow-xl shadow-rose-500/20 active:scale-95 p-6"
            >
              <div className="p-4 rounded-2xl bg-white/10 group-hover:scale-110 transition-transform">
                <StopCircle className="size-8" />
              </div>
              <span className="font-black text-lg">ຢຸດການກວດຈັບ</span>
            </button>

            <button 
              onClick={() => setActiveModal("reset")} 
              className="group flex-1 flex flex-col items-center justify-center gap-3 rounded-[2.5rem] bg-white border-2 border-sky-400/20 text-slate-700 transition-all hover:border-sky-400/40 hover:bg-sky-50 shadow-xl shadow-sky-400/5 active:scale-95 p-6"
            >
              <div className="p-4 rounded-2xl bg-sky-400/10 text-sky-400 group-hover:rotate-180 transition-transform duration-700">
                <RotateCcw className="size-8" />
              </div>
              <span className="font-black text-lg text-sky-500">ຕັ້ງຄ່າ ROI ໃໝ່</span>
            </button>

            <button 
              onClick={() => setActiveModal("home")} 
              className="group flex-1 flex flex-col items-center justify-center gap-3 rounded-[2.5rem] bg-sky-400 text-white transition-all hover:bg-sky-500 shadow-xl shadow-rose-500/20 active:scale-95 p-6"
            >
              <div className="p-4 rounded-2xl bg-white/10 group-hover:scale-110 transition-transform">
                <LayoutDashboard className="size-8" />
              </div>
              <span className="font-black text-lg">ໜ້າຫຼັກລະບົບ</span>
            </button>
          </div>
        </div>

        {/* --- Violation Log Table --- */}
        <div className="overflow-hidden rounded-[3rem] bg-card border-2 border-border shadow-2xl">
          <div className="p-8 border-b border-border bg-muted/10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-sky-400/10 p-4 rounded-2xl text-sky-400">
                <Clock className="size-6" />
              </div>
              <div>
                <h4 className="font-black text-2xl tracking-tight">ລາຍການລະเມີດລ່າສຸດ</h4>
                <p className="text-sm text-muted-foreground font-medium">ຂໍ້ມູນການຜ່າໄຟແດງທີ່ກວດພົບແບບສົດໆ</p>
              </div>
            </div>
            <div className="hidden sm:block">
               <span className="text-[10px] bg-sky-400 text-white px-5 py-2 rounded-full font-black tracking-[0.2em] shadow-lg shadow-sky-400/30">REAL-TIME LOG</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/30 text-muted-foreground">
                  <th className="px-8 py-6 font-black text-xs uppercase tracking-[0.2em]">ລຳດັບ</th>
                  <th className="px-8 py-6 font-black text-xs uppercase tracking-[0.2em]">ID</th>
                  <th className="px-8 py-6 font-black text-xs uppercase tracking-[0.2em]">ປະເພດພາຫະນະ</th>
                  <th className="px-8 py-6 font-black text-xs uppercase tracking-[0.2em]">ວັນທີ ແລະ ເວລາ</th>
                  <th className="px-8 py-6 font-black text-xs uppercase tracking-[0.2em]">LIGHT STATUS</th>
                  <th className="px-8 py-6 font-black text-xs uppercase tracking-[0.2em] text-center">ຫຼັກຖານ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {violations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-32 text-muted-foreground">
                      <div className="flex flex-col items-center gap-4 opacity-40">
                        <ShieldAlert className="size-16" />
                        <p className="font-black text-xl italic">ຍັງບໍ່ມີຂໍ້ມູນການລະເມີດໃນຂະນະນີ້...</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  violations.map((v, idx) => (
                    <tr key={v.id} className="group hover:bg-sky-400/[0.02] transition-all">
                      <td className="px-8 py-5 font-bold text-sky-400 text-lg">#{idx + 1}</td>
                      <td className="px-8 py-5 font-black text-slate-700">ID-{v.vehicle_id}</td>
                      <td className="px-8 py-5">
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-400/5 text-sky-500 font-black text-xs uppercase border border-sky-400/10">
                          <Car className="size-3" /> {v.vehicle_type}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-muted-foreground font-bold text-sm">
                        {new Date(v.time_stamp).toLocaleString('lo-LA', { 
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit' 
                        })}
                      </td>
                      <td className="px-8 py-5">
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 text-rose-500 font-black text-[10px] border border-rose-500/20">
                          <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                          RED LIGHT
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <button 
                          onClick={() => setSelectedImage("http://localhost:8000/" + v.image_path)}
                          className="p-4 rounded-2xl bg-white border-2 border-sky-400/10 text-sky-400 shadow-sm hover:bg-sky-400 hover:text-white hover:border-sky-400 transition-all transform active:scale-90 group-hover:shadow-sky-400/20 group-hover:shadow-xl"
                        >
                          <Eye className="size-6" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- Evidence Image Modal --- */}
      {selectedImage && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-lg animate-in fade-in duration-300" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-6xl w-full bg-white rounded-[3.5rem] overflow-hidden shadow-2xl border-4 border-white/20" onClick={e => e.stopPropagation()}>
            <div className="p-8 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
               <div className="flex items-center gap-4 text-sky-500">
                  <div className="p-3 rounded-2xl bg-sky-400/10"><ImageIcon className="size-8" /></div>
                  <h3 className="font-black text-2xl uppercase tracking-tight">ຫຼັກຖານການລະເມີດຈາລະຈອນ</h3>
               </div>
               <button 
                 onClick={() => setSelectedImage(null)} 
                 className="px-8 py-3 rounded-2xl bg-rose-500 text-white font-black hover:bg-rose-600 transition-all active:scale-95 shadow-lg shadow-rose-500/20"
               >
                 ປິດໜ້າຕ່າງ
               </button>
            </div>
            <div className="p-2 bg-black flex items-center justify-center">
               <img src={selectedImage} alt="Violation Proof" className="w-full h-auto max-h-[75vh] object-contain rounded-2xl" />
            </div>
          </div>
        </div>
      )}

      {/* --- Confirmation Dialogs --- */}
      <ConfirmModal 
        isOpen={activeModal === "stop"} 
        onClose={() => setActiveModal(null)} 
        onConfirm={handleStop} 
        title="ຢຸດການປະມວນຜົນ" 
        description="ທ່ານແນ່ໃຈຫຼືບໍ່ວ່າຕ້ອງການຢຸດການເຮັດງານຂອງ AI?" 
        subDescription="ລະບົບຈະຢຸດການກວດຈັບວິດີໂອປັດຈຸບັນ ແລະ ປິດຂະບວນການທັງໝົດ." 
      />
      <ConfirmModal 
        isOpen={activeModal === "home"} 
        onClose={() => setActiveModal(null)} 
        onConfirm={() => router.push("/")} 
        title="ກັບຄືນໜ້າຫຼັກ" 
        description="ທ່ານຕ້ອງການກັບຄືນໄປໜ້າຫຼັກ ຫຼື ບໍ່?" 
      />
      <ConfirmModal 
        isOpen={activeModal === "reset"} 
        onClose={() => setActiveModal(null)} 
        onConfirm={() => router.push("/upload-roi")} 
        title="ຕັ້ງຄ່າພິກັດໃໝ່" 
        description="ທ່ານຕ້ອງການໄປໜ້າຕັ້ງຄ່າ ROI ໃໝ່ ຫຼື ບໍ່?" 
        subDescription="ທ່ານຈະສາມາດອັບໂຫຼດວິດີໂອໃໝ່ ແລະ ປັບແຕ່ງເສັ້ນ ROI ໄດ້ຕາມຕ້ອງການ." 
      />
    </DashboardShell>
  )
}
