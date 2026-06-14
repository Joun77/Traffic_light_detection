"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { RealTimeClock } from "@/components/real-time-clock"
import {
  Calendar,
  AlarmClock,
  BookOpen,
  BarChart3,
  RotateCw,
  Maximize2,
  Video,
  Car,
  CalendarDays,
  Clock
} from "lucide-react"

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
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [sumAllRes, sumDayRes, recentRes] = await Promise.all([
        fetch("http://localhost:8000/violation-summary?period=all"),
        fetch("http://localhost:8000/violation-summary?period=day"),
        fetch("http://localhost:8000/violations?limit=5")
      ])
      if (sumAllRes.ok) setSummaryAll(await sumAllRes.json())
      if (sumDayRes.ok) setSummaryToday(await sumDayRes.json())
      if (recentRes.ok) setViolations(await recentRes.json())
    } catch (err) {
      console.error("Dashboard fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const statusRows = [
    { label: "ລາຍການລົດລ່ວງໄຟແດງໂດຍລວມທັງໝົດ", value: summaryAll?.total_violations || 0, color: "bg-rose-500 text-white" },
    { label: "ລາຍການລົດລ່ວງໄຟແດງພາຍໃນມື້ນີ້", value: summaryToday?.total_violations || 0, color: "bg-status-green text-white" },
  ]

  return (
    <DashboardShell title="ພາບລວມທັງໝົດ">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status list card */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-panel/50">
            <h2 className="text-lg font-bold">ສະຫຼຸບ ແລະ ລາຍງານ</h2>
            <div className="flex items-center gap-3 text-muted-foreground">
              <button onClick={fetchData}><RotateCw className={`size-5 ${loading ? 'animate-spin' : ''}`} /></button>
              <Maximize2 className="size-5" aria-hidden="true" />
            </div>
          </div>
          <ul>
            {statusRows.map((row, i) => (
              <li
                key={row.label}
                className={`flex items-center justify-between px-5 py-5 ${
                  i !== statusRows.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <span className="text-sm font-bold">{row.label}</span>
                <span className={`min-w-16 rounded-md px-4 py-1.5 text-center text-sm font-black ${row.color}`}>
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Right column */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-6 text-sky-400" aria-hidden="true" />
              <span className="text-base font-medium">ວັນທີ/ເດືອນ/ປີ</span>
            </div>
            <p className="mt-6 text-3xl font-bold">
              <RealTimeClock type="date" />
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlarmClock className="size-6 text-sky-400" aria-hidden="true" />
              <span className="text-base font-medium">ເວລາ</span>
            </div>
            <p className="mt-6 text-3xl font-bold">
              <RealTimeClock type="time" />
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-muted-foreground">
              <BookOpen className="size-6 text-sky-400" aria-hidden="true" />
              <span className="text-base font-medium">ຈຸດຕິດຕັ້ງກ້ອງ</span>
            </div>
            <p className="mt-4 flex items-center gap-2 text-3xl font-bold">
              1 <Video className="size-6 text-muted-foreground" aria-hidden="true" />
            </p>
            <div className="mt-4 space-y-1 text-sm border-t border-border pt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ສະຖານະ</span>
                <span className="font-bold text-status-green">ກຳລັງເຮັດວຽກ</span>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="size-6 text-sky-400" aria-hidden="true" />
              <span className="text-base font-medium">7 ມື້ຫຼ້າສຸດ</span>
            </div>
            <p className="mt-4 flex items-center gap-2 text-3xl font-bold">
              {summaryAll?.daily_stats.slice(-7).reduce((acc, curr) => acc + curr.count, 0) || 0} <Car className="size-6 text-muted-foreground" aria-hidden="true" />
            </p>
            <div className="mt-4 flex justify-between text-sm border-t border-border pt-4">
              <span className="text-muted-foreground">ສະເລ່ย/ວັນ</span>
              <span className="font-bold">
                {Math.round((summaryAll?.daily_stats.slice(-7).reduce((acc, curr) => acc + curr.count, 0) || 0) / 7)}
              </span>
            </div>
          </Card>
        </div>
      </div>

      {/* Records table */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-brand-foreground">ຂໍ້ມູນຂອງລົດລ່ວງໄຟແດງ (ຫຼ້າສຸດ)</h2>
          <a href="/data" className="text-sm font-bold text-sky-400 hover:underline">ເບິ່ງທັງໝົດ</a>
        </div>
        <div className="overflow-hidden rounded-2xl bg-card text-card-foreground border border-border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel/50 text-left text-panel-foreground border-b border-border">
                <th className="px-4 py-3 font-bold">ລຳດັບ</th>
                <th className="px-4 py-3 font-bold">ໄອດີ</th>
                <th className="px-4 py-3 font-bold">ປະເພດລົດ</th>
                <th className="px-4 py-3 font-bold">ວັນທີ/ເວລາ</th>
                <th className="px-4 py-3 font-bold text-center">ຮູບພາບ</th>
                <th className="px-4 py-3 font-bold text-center">ສະຖານະ</th>
              </tr>
            </thead>
            <tbody>
              {recentViolations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground italic">ຍັງບໍ່ມີຂໍ້ມູນ...</td>
                </tr>
              ) : (
                recentViolations.map((v, i) => (
                  <tr key={v.id} className="border-b border-border hover:bg-muted/30">
                    <td className="px-4 py-4">{i + 1}</td>
                    <td className="px-4 py-4 font-mono font-bold">#{v.vehicle_id}</td>
                    <td className="px-4 py-4 uppercase font-bold text-xs">{v.vehicle_type}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col text-[10px]">
                        <span className="flex items-center gap-1 font-bold text-muted-foreground"><CalendarDays className="size-3" /> {new Date(v.time_stamp).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1 font-black"><Clock className="size-3" /> {new Date(v.time_stamp).toLocaleTimeString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button onClick={() => setSelectedImage(`http://localhost:8000/${v.image_path}`)}>
                        <img src={`http://localhost:8000/${v.image_path}`} alt="Evidence" className="h-10 w-16 rounded object-cover border border-border mx-auto hover:opacity-80" />
                      </button>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="px-2 py-1 rounded-full bg-status-red/10 text-status-red text-[10px] font-black uppercase border border-status-red/20">
                        {v.light_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Image Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl w-full bg-panel rounded-3xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <img src={selectedImage} alt="Violation Evidence" className="w-full h-auto" />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
