"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { Search, FileSpreadsheet, Eye, Calendar, Clock, Car } from "lucide-react"
import { getLaoISODate } from "@/lib/time"

interface Violation {
  id: number
  vehicle_id: number
  vehicle_type: string
  time_stamp: string
  light_status: string
  image_path: string
  video_path: string
}

export default function DataPage() {
  const today = getLaoISODate()
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [limit, setLimit] = useState(50)

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`http://localhost:8000/violations?limit=${limit}`)
      if (response.ok) {
        const data = await response.json()
        setViolations(data)
      }
    } catch (error) {
      console.error("Fetch history error:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [limit])

  return (
    <DashboardShell title="ໜ້າຈັດການຂໍ້ມູນ (Data Management)">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-sm font-medium text-brand-foreground">
            ຄົ້ນຫາຈາກວັນທີ
          </label>
          <input
            id="from"
            type="date"
            defaultValue={today}
            className="rounded-lg bg-card px-4 py-2.5 text-card-foreground outline-none border border-border"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-sm font-medium text-brand-foreground">
            ເຖິງວັນທີ
          </label>
          <input
            id="to"
            type="date"
            defaultValue={today}
            className="rounded-lg bg-card px-4 py-2.5 text-card-foreground outline-none border border-border"
          />
        </div>
        <button
          onClick={fetchHistory}
          type="button"
          className="flex items-center gap-2 rounded-lg bg-sky-400 px-5 py-2.5 font-medium text-white hover:bg-sky-500 transition-colors"
        >
          <Search className="size-4" aria-hidden="true" />
          ຄົ້ນຫາ
        </button>
        <button
          type="button"
          className="ml-auto flex items-center gap-2 rounded-lg bg-emerald-400 px-5 py-2.5 font-medium text-white hover:bg-emerald-500 transition-colors"
        >
          <FileSpreadsheet className="size-4" aria-hidden="true" />
          Excel
        </button>
      </div>

      {/* Table header info */}
      <div className="mt-8 flex items-center justify-between">
        <p className="text-muted-foreground text-sm font-bold">ສະແດງ {violations.length} ລາຍການ ຫຼ້າສຸດ</p>
        <select 
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-lg bg-card px-4 py-2 text-card-foreground outline-none border border-border text-xs"
        >
          <option value={50}>50 ລາຍການ</option>
          <option value={100}>100 ລາຍການ</option>
          <option value={200}>200 ລາຍການ</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-2xl bg-card text-card-foreground border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel/50 text-left text-panel-foreground border-b border-border">
                <th className="px-4 py-4 font-bold">ລຳດັບ</th>
                <th className="px-4 py-4 font-bold">ໄອດີລົດ</th>
                <th className="px-4 py-4 font-bold">ປະເພດລົດ</th>
                <th className="px-4 py-4 font-bold">ວັນທີ/ເວລາ</th>
                <th className="px-4 py-4 font-bold">ສະຖານະໄຟ</th>
                <th className="px-4 py-4 font-bold">ຮູບພາບ</th>
                <th className="px-4 py-4 font-bold text-center">ຈັດການ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-20 text-center text-muted-foreground italic">
                    ກຳລັງໂຫຼດຂໍ້ມູນ...
                  </td>
                </tr>
              ) : violations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-20 text-center text-muted-foreground italic">
                    ບໍ່ມີຂໍ້ມູນໃນລະບົບ
                  </td>
                </tr>
              ) : (
                violations.map((v, index) => (
                  <tr key={v.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-4">{index + 1}</td>
                    <td className="px-4 py-4 font-mono font-bold text-sky-500">#{v.vehicle_id}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Car className="size-4 text-muted-foreground" />
                        <span className="font-bold">{v.vehicle_type.toUpperCase()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Calendar className="size-3" /> {new Date(v.time_stamp).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1 text-xs font-black"><Clock className="size-3" /> {new Date(v.time_stamp).toLocaleTimeString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 rounded-full bg-rose-500/10 text-rose-500 text-[10px] font-black border border-rose-500/20 uppercase">
                        {v.light_status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="relative group cursor-pointer" onClick={() => setSelectedImage(`http://localhost:8000/${v.image_path}`)}>
                        <img 
                          src={`http://localhost:8000/${v.image_path}`} 
                          alt="Violation" 
                          className="h-10 w-16 rounded object-cover border border-border group-hover:opacity-75 transition-opacity"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Eye className="size-4 text-white drop-shadow-md" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button 
                        onClick={() => setSelectedImage(`http://localhost:8000/${v.image_path}`)}
                        className="p-2 hover:bg-sky-400/10 rounded-lg text-sky-500 transition-colors"
                      >
                        <Eye className="size-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full bg-panel rounded-3xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <img src={selectedImage} alt="Violation Full Evidence" className="w-full h-auto" />
            <div className="absolute top-4 right-4 flex gap-2">
              <button 
                onClick={() => setSelectedImage(null)}
                className="bg-black/50 text-white p-2 rounded-full hover:bg-black transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
