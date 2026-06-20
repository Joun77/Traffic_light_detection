"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { RealTimeClock } from "@/components/real-time-clock"
import {
  Calendar,
  AlarmClock,
  Video,
  ShieldAlert,
  BarChart3,
  ChevronDown,
  MapPin,
  ExternalLink,
  ArrowRight,
  TrendingUp,
  Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable, DataTableRow, DataTableCell } from "@/components/ui/data-table"
import Link from "next/link"

interface CCTV {
  id: number
  camera_id: string
  location_name: string
  village: string
  district: string
  province: string
  is_active: boolean
}

interface SummaryData {
  total_violations: number
  by_type: { vehicle_type: string; count: number }[]
  daily_stats: { date: string; count: number }[]
}

function SmallCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card p-5 text-card-foreground shadow-sm border border-border ${className}`}>
      {children}
    </div>
  )
}

function SummaryBlock({
  label,
  value,
  sublabel,
  icon: Icon,
  colorClass,
}: {
  label: string
  value: number | string
  sublabel?: string
  icon: React.ElementType
  colorClass: string
}) {
  return (
    <div className={cn("rounded-2xl p-5 border flex flex-col gap-3", colorClass)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</span>
        <Icon className="size-5 opacity-50" />
      </div>
      <p className="text-4xl font-black tracking-tighter">{value}</p>
      {sublabel && (
        <p className="text-[10px] font-bold opacity-60 uppercase tracking-wider">{sublabel}</p>
      )}
    </div>
  )
}

type FilterPeriod = "week" | "month"

export default function HomePage() {
  const [summaryWeek, setSummaryWeek] = useState<SummaryData | null>(null)
  const [summaryMonth, setSummaryMonth] = useState<SummaryData | null>(null)
  const [summaryAll, setSummaryAll] = useState<SummaryData | null>(null)
  const [cameras, setCameras] = useState<CCTV[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>("week")
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [wRes, mRes, aRes, camRes] = await Promise.all([
        fetch("http://localhost:8000/violation-summary?period=week"),
        fetch("http://localhost:8000/violation-summary?period=month"),
        fetch("http://localhost:8000/violation-summary?period=all"),
        fetch("http://localhost:8000/cameras"),
      ])
      if (wRes.ok) setSummaryWeek(await wRes.json())
      if (mRes.ok) setSummaryMonth(await mRes.json())
      if (aRes.ok) setSummaryAll(await aRes.json())
      if (camRes.ok) setCameras(await camRes.json())
    } catch (err) {
      console.error("Dashboard fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const activeCamerasCount = cameras.filter((c) => c.is_active).length
  const currentSummary = filterPeriod === "week" ? summaryWeek : summaryMonth
  const periodDays = filterPeriod === "week" ? 7 : 30
  const avgPerDay = currentSummary
    ? Math.round(currentSummary.total_violations / periodDays)
    : 0

  const summaryBlocks = [
    {
      label: filterPeriod === "week" ? "ການລະເມີດ (ອາທິດນີ້)" : "ການລະເມີດ (ເດືອນນີ້)",
      value: currentSummary?.total_violations ?? 0,
      sublabel: `ສະເລ່ຍ ${avgPerDay} ຄັ້ງ / ວັນ`,
      icon: ShieldAlert,
      colorClass: "bg-rose-500/10 border-rose-500/20 text-rose-400",
    },
    {
      label: "ການລະເມີດທັງໝົດ",
      value: summaryAll?.total_violations ?? 0,
      sublabel: "ນັບຕັ້ງແຕ່ເລີ່ມລະບົບ",
      icon: BarChart3,
      colorClass: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    },
    {
      label: "ກ້ອງທີ່ໃຊ້ງານ",
      value: activeCamerasCount,
      sublabel: `ຈາກທັງໝົດ ${cameras.length} ກ້ອງ`,
      icon: Video,
      colorClass: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    },
    {
      label: "ກ້ອງທັງໝົດ",
      value: cameras.length,
      sublabel: `ປິດໃຊ້ງານ ${cameras.length - activeCamerasCount} ກ້ອງ`,
      icon: TrendingUp,
      colorClass: "bg-sky-500/10 border-sky-500/20 text-sky-400",
    },
  ]

  return (
    <DashboardShell title="ພາບລວມທັງໝົດ">

      {/* ─── Period Filter ─────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-slate-400">
          <Activity className="size-4 text-sky-400" />
          <span className="text-[10px] font-black uppercase tracking-widest">ສະຫຼຸບລາຍງານ</span>
        </div>
        <div className="relative">
          <button
            onClick={() => setIsFilterOpen((v) => !v)}
            className="flex items-center gap-2 text-xs font-black text-sky-400 bg-sky-500/10 px-4 py-2 rounded-xl border border-sky-500/20 uppercase tracking-widest"
          >
            <span>{filterPeriod === "week" ? "ລາຍອາທິດ (7 ວັນ)" : "ລາຍເດືອນ (30 ວັນ)"}</span>
            <ChevronDown className={cn("size-3 transition-transform", isFilterOpen && "rotate-180")} />
          </button>
          {isFilterOpen && (
            <div className="absolute top-full right-0 mt-1 w-44 bg-slate-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
              <button
                onClick={() => { setFilterPeriod("week"); setIsFilterOpen(false) }}
                className={cn("w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 text-slate-300", filterPeriod === "week" && "text-sky-400 bg-sky-500/5")}
              >
                ລາຍອາທິດ (7 ວັນ)
              </button>
              <button
                onClick={() => { setFilterPeriod("month"); setIsFilterOpen(false) }}
                className={cn("w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 text-slate-300", filterPeriod === "month" && "text-sky-400 bg-sky-500/5")}
              >
                ລາຍເດືອນ (30 ວັນ)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Summary Blocks ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        {summaryBlocks.map((block) => (
          <SummaryBlock key={block.label} {...block} />
        ))}
      </div>

      {/* ─── Date / Time ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <SmallCard>
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar className="size-5 text-sky-400" />
            <span className="text-[10px] font-black uppercase tracking-widest">ວັນທີ / ເດືອນ / ປີ</span>
          </div>
          <p className="mt-4 text-2xl font-black text-white tracking-tighter">
            <RealTimeClock type="date" />
          </p>
        </SmallCard>
        <SmallCard>
          <div className="flex items-center gap-2 text-slate-400">
            <AlarmClock className="size-5 text-sky-400" />
            <span className="text-[10px] font-black uppercase tracking-widest">ເວລາ</span>
          </div>
          <p className="mt-4 text-2xl font-black text-white tracking-tighter">
            <RealTimeClock type="time" />
          </p>
        </SmallCard>
      </div>

      {/* ─── Camera Table ──────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between px-1 mb-4">
          <div className="flex items-center gap-3">
            <Video className="size-5 text-sky-400" />
            <h2 className="text-lg font-black text-white uppercase tracking-tighter">
              ລາຍການທັງໝົດ — ກ້ອງ CCTV
            </h2>
          </div>
          <Link
            href="/cameras"
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-sky-500 hover:text-white transition-all shadow-lg shadow-sky-500/5"
          >
            ຈັດການກ້ອງທັງໝົດ <ArrowRight className="size-3" />
          </Link>
        </div>

        <DataTable
          headers={["ລຳດັບ", "Camera ID", "ສະຖານທີ່ຕິດຕັ້ງ", "ສະຖານະ", "ຈັດການ"]}
          loading={loading}
          columnCount={5}
        >
          {cameras.map((cam, index) => (
            <DataTableRow key={cam.id}>

              {/* ລຳດັບ */}
              <DataTableCell className="font-black text-sky-500 text-lg">
                #{index + 1}
              </DataTableCell>

              {/* Camera ID */}
              <DataTableCell className="font-mono font-black text-white tracking-tighter uppercase">
                CCTV-{cam.camera_id}
              </DataTableCell>

              {/* ສະຖານທີ່ */}
              <DataTableCell align="left">
                <div className="flex flex-col gap-1">
                  <span className="font-black text-sm text-white uppercase tracking-tight">
                    {cam.location_name}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5 uppercase opacity-70">
                    <MapPin className="size-3 text-rose-500" />
                    {cam.village}, {cam.district}, {cam.province}
                  </span>
                </div>
              </DataTableCell>

              {/* ສະຖານະ */}
              <DataTableCell>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-black text-[10px] border uppercase tracking-wider",
                    cam.is_active
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                  )}
                >
                  <div
                    className={cn(
                      "size-1.5 rounded-full",
                      cam.is_active ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                    )}
                  />
                  {cam.is_active ? "ໃຊ້ງານ" : "ປິດໃຊ້ງານ"}
                </span>
              </DataTableCell>

              {/* ຈັດການ */}
              <DataTableCell align="center">
                <Link
                  href={`/monitor?camera=${cam.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-sky-500 hover:text-white transition-all active:scale-95 shadow-lg shadow-sky-500/5"
                  title={`ເບິ່ງການຕິດຕາມ CCTV-${cam.camera_id}`}
                >
                  <ExternalLink className="size-3.5" />
                  ຕິດຕາມ
                </Link>
              </DataTableCell>

            </DataTableRow>
          ))}
        </DataTable>
      </section>

    </DashboardShell>
  )
}
