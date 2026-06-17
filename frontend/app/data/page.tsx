"use client"

import { useState, useEffect } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { Search, FileSpreadsheet, Eye, Calendar, Clock, Car, Trash2, Printer, X, Maximize2, Play } from "lucide-react"
import { getLaoISODate } from "@/lib/time"
import { PrintPreviewModal, Violation } from "@/components/print-preview-modal"
import { DataTable, DataTableRow, DataTableCell } from "@/components/ui/data-table"
import { translateLightStatus, translateVehicleType, getLightStatusColor } from "@/lib/localization"
import { ConfirmModal } from "@/components/confirm-modal"
import { Toast, ToastType } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

export default function DataPage() {
  const today = getLaoISODate()
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null)
  const [previewViolation, setPreviewViolation] = useState<Violation | null>(null)
  const [limit, setLimit] = useState(50)

  // Feedback States
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  const showToast = (message: string, type: ToastType = "success") => {
    setToast({ message, type })
  }

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch(`http://localhost:8000/violations?limit=${limit}`)
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          setViolations(data)
        } else {
          console.error("API returned non-array data:", data)
          setViolations([])
        }
      }
    } catch (error) {
      console.error("Fetch history error:", error)
      setViolations([])
    } finally {
      setLoading(false)
    }
  }

  const confirmDelete = async () => {
    if (deleteId === null) return
    try {
      const response = await fetch(`http://localhost:8000/violations/${deleteId}`, { method: "DELETE" })
      if (response.ok) {
        setViolations(prev => prev.filter(v => v.id !== deleteId))
        showToast("ລຶບຂໍ້ມູນສຳເລັດແລ້ວ")
      } else {
        showToast("ເກີດຂໍ้ຜິດພາດໃນການລຶບ", "error")
      }
    } catch (error) {
      showToast("ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບເຊີເວີ", "error")
    } finally {
      setDeleteId(null)
    }
  }

  const confirmDeleteAll = async () => {
    try {
      const response = await fetch(`http://localhost:8000/violations`, { method: "DELETE" })
      if (response.ok) {
        setViolations([])
        showToast("ລຶບຂໍ້ມູນທັງໝົດສຳເລັດແລ້ວ")
      } else {
        showToast("ເກີດຂໍ้ຜິດພາດໃນການລຶບ", "error")
      }
    } catch (error) {
      showToast("ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບເຊີເວີ", "error")
    } finally {
      setIsDeletingAll(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [limit])

  return (
    <DashboardShell title="ປະຫວັດການລະເມີດ (Violation History)">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <ConfirmModal 
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="ຢືນຢັນການລຶບ"
        description="ທ່ານຕ້ອງການລຶບຂໍ້ມູນການລະເມີດນີ້ແທ້ຫຼືບໍ່?"
      />

      <ConfirmModal 
        isOpen={isDeletingAll}
        onClose={() => setIsDeletingAll(false)}
        onConfirm={confirmDeleteAll}
        title="⚠️ ລຶບຂໍ້ມູນທັງໝົດ"
        description="ທ່ານແນ່ໃຈຫຼືບໍ່ວ່າຕ້ອງການລຶບຂໍ້ມູນທັງໝົດໃນລະບົບ?"
        subDescription="ການກະທຳນີ້ບໍ່ສາມາດຍົກເລີກໄດ້ ແລະ ຂໍ້ມູນທັງໝົດຈະຫາຍໄປຖາວອນ."
      />

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-sm font-black uppercase tracking-widest text-slate-500 ml-1">
            ຄົ້ນຫາຈາກວັນທີ
          </label>
          <input
            id="from"
            type="date"
            defaultValue={today}
            className="rounded-2xl bg-card px-5 py-3 text-card-foreground outline-none border border-border focus:border-sky-500 transition-all font-bold"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-sm font-black uppercase tracking-widest text-slate-500 ml-1">
            ເຖິງວັນທີ
          </label>
          <input
            id="to"
            type="date"
            defaultValue={today}
            className="rounded-2xl bg-card px-5 py-3 text-card-foreground outline-none border border-border focus:border-sky-500 transition-all font-bold"
          />
        </div>
        <button
          onClick={fetchHistory}
          type="button"
          className="flex items-center gap-2 rounded-2xl bg-sky-500 px-6 py-3 font-black text-white hover:bg-sky-600 transition-all active:scale-95 shadow-lg shadow-sky-500/20 uppercase text-xs tracking-widest"
        >
          <Search className="size-4" aria-hidden="true" />
          ຄົ້ນຫາ
        </button>
        
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 rounded-2xl bg-slate-800 border border-white/5 px-6 py-3 font-black text-emerald-400 hover:bg-slate-700 transition-all active:scale-95 shadow-xl uppercase text-xs tracking-widest"
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            Export Excel
          </button>
          <button
            onClick={() => setIsDeletingAll(true)}
            type="button"
            className="flex items-center gap-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 px-6 py-3 font-black text-rose-500 hover:bg-rose-500 hover:text-white transition-all active:scale-95 shadow-xl uppercase text-xs tracking-widest"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            ລຶບທັງໝົດ
          </button>
        </div>
      </div>

      {/* Table header info */}
      <div className="mt-10 flex items-center justify-between">
        <div className="flex items-center gap-3 text-slate-400">
           <div className="size-2 rounded-full bg-sky-500 animate-pulse shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
           <p className="text-sm font-bold">ສະແດງ {violations.length} ລາຍການຫຼ້າສຸດ</p>
        </div>
        <select 
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="rounded-xl bg-card px-4 py-2 text-card-foreground outline-none border border-border text-xs font-black transition-all hover:border-sky-500 cursor-pointer"
        >
          <option value={50}>ສະແດງ 50 ລາຍການ</option>
          <option value={100}>ສະແດງ 100 ລາຍການ</option>
          <option value={200}>ສະແດງ 200 ລາຍການ</option>
        </select>
      </div>

      <DataTable 
        headers={["ລຳດັບ", "ໄອດີລົດ", "ປະເພດພາຫະນະ", "ວັນທີ ແລະ ເວລາ", "ສະຖານະໄຟ", "ຮູບພາບຫຼັກຖານ", "ວິດີໂອຫຼັກຖານ", "ຈັດການ"]}
        loading={loading}
        columnCount={8}
      >
        {violations.map((v, index) => (
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
                <span className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase opacity-70"><Calendar className="size-3 text-sky-500" /> {new Date(v.time_stamp).toLocaleDateString('lo-LA')}</span>
                <span className="flex items-center justify-center gap-1.5 text-xs font-black text-white"><Clock className="size-3 text-sky-500" /> {new Date(v.time_stamp).toLocaleTimeString('lo-LA')}</span>
              </div>
            </DataTableCell>
            <DataTableCell>
              <span className={cn("inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-black text-[10px] border uppercase shadow-sm", getLightStatusColor(v.light_status))}>
                <div className={cn("size-1.5 rounded-full animate-pulse", v.light_status.toLowerCase() === 'red' ? 'bg-rose-500' : v.light_status.toLowerCase() === 'green' ? 'bg-emerald-500' : 'bg-slate-400')} />
                {translateLightStatus(v.light_status)}
              </span>
            </DataTableCell>
            <DataTableCell align="center">
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
            <DataTableCell align="center">
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
                    <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 group-hover:scale-110 transition-transform">
                      <Play className="size-4 text-white fill-current" />
                    </div>
                </div>
              </div>
            </DataTableCell>
            <DataTableCell align="center">
              <div className="flex items-center justify-center gap-2">
                <button 
                  onClick={() => setPreviewViolation(v)}
                  className="p-2.5 rounded-xl bg-slate-900 text-sky-400 border border-white/5 shadow-lg hover:bg-slate-800 transition-all transform active:scale-90"
                  title="ພິມລາຍງານ"
                >
                  <Printer className="size-4" />
                </button>
                <button 
                  onClick={() => setDeleteId(v.id)}
                  className="p-2.5 rounded-xl bg-slate-900 text-rose-500 border border-white/5 shadow-lg hover:bg-slate-800 transition-all transform active:scale-90"
                  title="ລຶບລາຍການ"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>

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
                 <h3 className="font-black text-2xl uppercase tracking-tighter text-white">Evidence Video Playback</h3>
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

      {/* Reusable Print Preview Modal */}
      <PrintPreviewModal 
        violation={previewViolation} 
        onClose={() => setPreviewViolation(null)} 
      />
    </DashboardShell>
  )
}
