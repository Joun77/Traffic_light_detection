"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { RealTimeClock } from "@/components/real-time-clock"
import {
  Calendar,
  AlarmClock,
  BookOpen,
  BarChart3,
  Video,
  Car,
  CalendarDays,
  Clock,
  ChevronDown,
  Maximize2,
  Play,
  X,
  Eye,
  Activity,
  ShieldAlert,
  Printer
} from "lucide-react"
import { cn } from "@/lib/utils"
import { translateLightStatus, translateVehicleType, getLightStatusColor } from "@/lib/localization"
import { DataTable, DataTableRow, DataTableCell } from "@/components/ui/data-table"
import { PrintPreviewModal, Violation as ViolationType } from "@/components/print-preview-modal"

interface CCTV {
  id: number
  is_active: boolean
}

interface SummaryData {
  total_violations: number
  by_type: { vehicle_type: string; count: number }[]
  daily_stats: { date: string; count: number }[]
}

interface Violation {
  id: number
  vehicle_id: number
  vehicle_type: string
  time_stamp: string
  image_path: string
  video_path: string
  light_status: string
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card p-5 text-card-foreground shadow-sm border border-border ${className}`}>
      {children}
    </div>
  )
}

export default function HomePage() {
  const [summaryAll, setSummaryAll] = useState<SummaryData | null>(null)
  const [summaryToday, setSummaryToday] = useState<SummaryData | null>(null)
  const [recentViolations, setViolations] = useState<Violation[]>([])
  const [cameras, setCameras] = useState<CCTV[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
  const [previewViolation, setPreviewViolation] = useState<ViolationType | null>(null)

  // Period Filter State
  const [period, setPeriod] = useState<7 | 30>(7)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [sumAllRes, sumDayRes, recentRes, camRes] = await Promise.all([
        fetch("http://localhost:8000/violation-summary?period=all"),
        fetch("http://localhost:8000/violation-summary?period=day"),
        fetch("http://localhost:8000/violations?limit=10"),
        fetch("http://localhost:8000/cameras")
      ])
      if (sumAllRes.ok) setSummaryAll(await sumAllRes.json())
      if (sumDayRes.ok) setSummaryToday(await sumDayRes.json())
      
      if (recentRes.ok) {
        const data = await recentRes.json()
        if (Array.isArray(data)) {
          setViolations(data)
        } else {
          console.error("Home: API returned non-array data:", data)
          setViolations([])
        }
      }

      if (camRes.ok) setCameras(await camRes.json())
    } catch (err) {
      console.error("Dashboard fetch error:", err)
      setViolations([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const activeCamerasCount = cameras.filter(c => c.is_active).length

  const statusRows = [
    { label: "ລາຍການລົດລ່ວງໄຟແດງໂດຍລວມທັງໝົດ", value: summaryAll?.total_violations || 0, color: "bg-rose-500 text-white" },
    { label: "ລາຍການລົດລ່ວงໄຟແດງພາຍໃນມື້ນີ້", value: summaryToday?.total_violations || 0, color: "bg-emerald-500 text-white" },
  ]

  return (
    <DashboardShell title="ພາບລວມທັງໝົດ">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status list card */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 bg-panel/50">
            <h2 className="text-lg font-black tracking-tight text-white uppercase tracking-tighter">ສະຫຼຸບ ແລະ ລາຍງານ</h2>
            <div className="relative">
               <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="flex items-center gap-1 text-xs font-black text-sky-400 bg-sky-500/10 px-3 py-1.5 rounded-lg border border-sky-500/20 uppercase tracking-widest"
               >
                  <span>{period === 7 ? "7 ມື້ຫຼ້າສຸດ" : "30 ມື้ຫຼ້າສຸດ"}</span>
                  <ChevronDown className={cn("size-3 transition-transform", isFilterOpen && "rotate-180")} />
               </button>
               {isFilterOpen && (
                 <div className="absolute top-full right-0 mt-1 w-32 bg-slate-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    <button onClick={() => { setPeriod(7); setIsFilterOpen(false); }} className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-white/5 text-slate-300">7 ມື້ຫຼ້າສຸດ</button>
                    <button onClick={() => { setPeriod(30); setIsFilterOpen(false); }} className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-white/5 text-slate-300">30 ມື້ຫຼ້າສຸດ</button>
                 </div>
               )}
            </div>
          </div>
          <ul>
            {statusRows.map((row, i) => (
              <li
                key={row.label}
                className={`flex items-center justify-between px-5 py-5 ${
                  i !== statusRows.length - 1 ? "border-b border-white/5" : ""
                }`}
              >
                <span className="text-sm font-bold text-slate-300">{row.label}</span>
                <span className={`min-w-16 rounded-xl px-4 py-1.5 text-center text-sm font-black shadow-lg ${row.color}`}>
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Right column */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2 text-slate-400">
              <Calendar className="size-6 text-sky-400" aria-hidden="true" />
              <span className="text-[10px] font-black uppercase tracking-widest">ວັນທີ/ເດືອນ/ປີ</span>
            </div>
            <p className="mt-6 text-3xl font-black text-white tracking-tighter">
              <RealTimeClock type="date" />
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-slate-400">
              <AlarmClock className="size-6 text-sky-400" aria-hidden="true" />
              <span className="text-[10px] font-black uppercase tracking-widest">ເວລາ</span>
            </div>
            <p className="mt-6 text-3xl font-black text-white tracking-tighter">
              <RealTimeClock type="time" />
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-slate-400">
              <BookOpen className="size-6 text-sky-400" aria-hidden="true" />
              <span className="text-[10px] font-black uppercase tracking-widest">ຈຸດຕິດຕັ້ງກ້ອງ</span>
            </div>
            <p className="mt-4 flex items-center gap-2 text-3xl font-black text-white tracking-tighter">
              {cameras.length} <Video className="size-6 text-slate-500" aria-hidden="true" />
            </p>
            <div className="mt-4 space-y-1 text-sm border-t border-white/5 pt-4">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">ກຳລັງເຮັດວຽກ</span>
                <span className="font-black text-emerald-400">{activeCamerasCount} ກ້ອງ</span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-slate-400">
              <BarChart3 className="size-6 text-sky-400" aria-hidden="true" />
              <span className="text-[10px] font-black uppercase tracking-widest">{period} ມື້ຫຼ້າສຸດ</span>
            </div>
            <p className="mt-4 flex items-center gap-2 text-3xl font-black text-white tracking-tighter">
              { (summaryAll?.daily_stats || []).slice(-period).reduce((acc, curr) => acc + curr.count, 0) || 0} <Car className="size-6 text-slate-500" aria-hidden="true" />
            </p>
            <div className="mt-4 flex justify-between text-sm border-t border-white/5 pt-4">
              <span className="text-slate-400 font-bold">ສະເລ່ย/ວັນ</span>
              <span className="font-black text-white">
                {Math.round(((summaryAll?.daily_stats || []).slice(-period).reduce((acc, curr) => acc + curr.count, 0) || 0) / period)}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* Records table */}
      <section className="mt-12">
        <div className="flex items-center justify-between px-4 mb-4">
          <div className="flex items-center gap-3">
             <ShieldAlert className="size-6 text-sky-400" />
             <h2 className="text-xl font-black text-white uppercase tracking-tighter">ຂໍ້ມູນຂອງລົດລ່ວງໄຟແດງ (ຫຼ້າສຸດ)</h2>
          </div>
          <a href="/data" className="px-5 py-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-sky-500 hover:text-white transition-all shadow-lg shadow-sky-500/5">ເບິ່ງທັງໝົດ</a>
        </div>
        
        <DataTable 
          headers={["ລຳດັບ", "ໄອດີ", "ປະເພດລົດ", "ວັນທີ/ເວລາ", "ສະຖານະ", "ຮູບພາບຫຼັກຖານ", "ວິດີໂອຫຼັກຖານ", "ຈັດການ"]}
          loading={loading}
          columnCount={8}
        >
          {recentViolations.map((v, i) => (
            <DataTableRow key={v.id}>
              <DataTableCell className="font-bold text-slate-500">#{i + 1}</DataTableCell>
              <DataTableCell className="font-mono font-black text-white tracking-tighter uppercase text-base">VkH-{v.vehicle_id}</DataTableCell>
              <DataTableCell>
                  <span className="px-3 py-1 rounded-lg bg-sky-500/10 text-sky-400 font-black text-[10px] uppercase border border-sky-500/20">
                    {translateVehicleType(v.vehicle_type)}
                  </span>
              </DataTableCell>
              <DataTableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase opacity-70"><CalendarDays className="size-3 text-sky-500" /> {new Date(v.time_stamp).toLocaleDateString('lo-LA')}</span>
                  <span className="flex items-center justify-center gap-1.5 text-xs font-black text-white"><Clock className="size-3 text-sky-500" /> {new Date(v.time_stamp).toLocaleTimeString('lo-LA')}</span>
                </div>
              </DataTableCell>
              <DataTableCell>
                <span className={cn("inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-black text-[10px] border uppercase shadow-sm", getLightStatusColor(v.light_status))}>
                  <div className={cn("size-1.5 rounded-full animate-pulse", v.light_status.toLowerCase() === 'red' ? 'bg-rose-500' : v.light_status.toLowerCase() === 'green' ? 'bg-emerald-500' : 'bg-slate-400')} />
                  {translateLightStatus(v.light_status)}
                </span>
              </DataTableCell>
              <DataTableCell>
                <div className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto" onClick={() => setSelectedImage(`http://localhost:8000/${v.image_path}`)}>
                  <img 
                    src={`http://localhost:8000/${v.image_path}`} 
                    alt="Violation Evidence" 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-sky-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 className="size-4 text-white drop-shadow-md" />
                  </div>
                </div>
              </DataTableCell>
              <DataTableCell>
                <div 
                  className="relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 w-28 h-16 shadow-lg mx-auto transition-all active:scale-95" 
                  onClick={() => setSelectedVideo(`http://localhost:8000/${v.video_path}`)}
                >
                  <img 
                    src={`http://localhost:8000/${v.image_path}`} 
                    alt="Video Cover" 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-60"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 group-hover:scale-110 transition-transform shadow-xl">
                        <Play className="size-4 text-white fill-current" />
                      </div>
                  </div>
                </div>
              </DataTableCell>
              <DataTableCell align="center">
                  <button 
                    onClick={() => setPreviewViolation(v as unknown as ViolationType)}
                    className="p-3 bg-slate-800 hover:bg-sky-500 text-sky-400 hover:text-white rounded-xl transition-all shadow-lg border border-white/5 active:scale-90"
                    title="ພິມລາຍງານ"
                  >
                    <Printer className="size-5" />
                  </button>
              </DataTableCell>
            </DataTableRow>
          ))}
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
                 <h3 className="font-black text-2xl uppercase tracking-tighter text-white">Full Evidence View</h3>
              </div>
              <button 
                onClick={() => setSelectedImage(null)}
                className="p-3 bg-white/5 hover:bg-rose-500/20 rounded-full transition-colors text-white/50 hover:text-rose-500"
              >
                <X className="size-6" />
              </button>
            </div>
            <div className="bg-black p-4 text-center">
               <img src={selectedImage} alt="Violation Full Evidence" className="inline-block h-auto max-h-[75vh] object-contain rounded-2xl mx-auto shadow-2xl" />
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
                 <h3 className="font-black text-2xl uppercase tracking-tighter">Evidence Video Playback</h3>
              </div>
              <button 
                onClick={() => setSelectedVideo(null)}
                className="p-3 bg-white/5 hover:bg-rose-500/20 rounded-full transition-colors text-white/50 hover:text-rose-500"
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

      <PrintPreviewModal 
        violation={previewViolation} 
        onClose={() => setPreviewViolation(null)} 
      />

    </DashboardShell>
  )
}
