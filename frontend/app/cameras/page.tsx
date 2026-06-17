"use client"

import { useState, useEffect, useRef } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { Camera, Video, Trash2, Edit2, Search, Save, X, MapPin, Upload, Loader2, Play } from "lucide-react"
import { DataTable, DataTableRow, DataTableCell } from "@/components/ui/data-table"
import { VideoPreviewModal } from "@/components/video-preview-modal"
import { UploadLoadingModal } from "@/components/upload-loading-modal"
import { ConfirmModal } from "@/components/confirm-modal"
import { Toast, ToastType } from "@/components/ui/toast"
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

export default function CamerasPage() {
  const [cameras, setCameras] = useState<CCTV[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCamera, setEditingCamera] = useState<CCTV | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // Feedback States
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null)
  const [deleteCamId, setDeleteCamId] = useState<number | null>(null)
  const [deleteVideoId, setDeleteVideoId] = useState<number | null>(null)

  // Video Upload & Preview State
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  
  const [playingVideo, setPlayingVideo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const showToast = (message: string, type: ToastType = "success") => {
    setToast({ message, type })
  }

  const fetchCameras = async () => {
    setLoading(true)
    try {
      const response = await fetch("http://localhost:8000/cameras")
      if (response.ok) {
        const data = await response.json()
        setCameras(data)
      }
    } catch (error) { console.error("Fetch error:", error) }
    finally { setLoading(false) }
  }

  const handleToggleStatus = async (id: number, currentStatus: boolean) => {
    try {
      const response = await fetch(`http://localhost:8000/cameras/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentStatus }),
      })
      if (response.ok) {
        setCameras(prev => prev.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c))
        showToast(`ອັບເດດສະຖານະກ້ອງສຳເລັດ`, "success")
      }
    } catch (error) { showToast("ເກີດຂໍ້ຜິດພາດໃນການອັບເດດ", "error") }
  }

  const confirmDeleteCamera = async () => {
    if (deleteCamId === null) return
    try {
      const response = await fetch(`http://localhost:8000/cameras/${deleteCamId}`, { method: "DELETE" })
      if (response.ok) {
        fetchCameras()
        showToast("ລຶບຂໍ້ມູນກ້ອງສຳເລັດແລ້ວ", "success")
      } else {
        showToast("ເກີດຂໍ้ຜິດພາດໃນການລຶບ", "error")
      }
    } catch (error) { showToast("ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບເຊີເວີ", "error") }
    finally { setDeleteCamId(null) }
  }

  const confirmRemoveVideo = async () => {
    if (deleteVideoId === null) return
    try {
      const response = await fetch(`http://localhost:8000/cameras/${deleteVideoId}/video`, { method: "DELETE" })
      if (response.ok) {
        showToast("ລຶບວິດີໂອສຳເລັດແລ້ວ", "success")
        fetchCameras()
      } else {
        showToast("ເກີດຂໍ้ຜິດພາດໃນການລຶບວິດີໂອ", "error")
      }
    } catch (error) { showToast("ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບເຊີເວີ", "error") }
    finally { setDeleteVideoId(null) }
  }

  const handleSaveEdit = async () => {
    if (!editingCamera) return
    try {
      const response = await fetch(`http://localhost:8000/cameras/${editingCamera.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingCamera),
      })
      if (response.ok) { 
        fetchCameras()
        setIsModalOpen(false)
        showToast("ແກ້ໄຂຂໍ້ມູນສະຖານທີ່ສຳເລັດ", "success")
      }
    } catch (error) { showToast("ເກີດຂໍ້ຜິດພາດในການບັນທຶກ", "error") }
  }

  const handleUploadClick = (id: number) => {
    setUploadingId(id)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || uploadingId === null) return

    setIsUploading(true)
    abortControllerRef.current = new AbortController()
    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await fetch(`http://localhost:8000/cameras/${uploadingId}/upload-video`, {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current.signal
      })

      if (response.ok) {
        const data = await response.json()
        setPreviewUrl(data.url)
        setIsPreviewOpen(true)
      } else {
        showToast("ເກີດຂໍ້ຜິດພາດໃນການອັບໂຫຼດ", "error")
        setUploadingId(null)
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') showToast("ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບເຊີເວີ", "error")
      setUploadingId(null)
    } finally { setIsUploading(false) }
  }

  const handleCancelUpload = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    setIsUploading(false)
    setUploadingId(null)
    showToast("ຍົກເລີກການອັບໂຫຼດແລ້ວ", "warning")
  }

  const confirmSaveVideo = () => {
    setIsPreviewOpen(false)
    setPreviewUrl(null)
    setUploadingId(null)
    showToast("ບັນທຶກວິດີໂອສຳເລັດແລ້ວ!", "success")
    fetchCameras()
  }

  const discardPreview = () => {
    setIsPreviewOpen(false)
    setPreviewUrl(null)
    setUploadingId(null)
    showToast("ຍົກເລີກການອັບໂຫຼດແລ້ວ", "warning")
  }

  useEffect(() => { fetchCameras() }, [])

  return (
    <DashboardShell title="ຈັດການກ້ອງວົງຈອນປິດ (CCTV Management)">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/*" className="hidden" />

      {/* Global Toast Notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      {/* Global Upload Loading Modal */}
      <UploadLoadingModal isOpen={isUploading} onCancel={handleCancelUpload} />

      {/* Camera Deletion Confirmation Modal */}
      <ConfirmModal 
        isOpen={deleteCamId !== null}
        onClose={() => setDeleteCamId(null)}
        onConfirm={confirmDeleteCamera}
        title="ຢືນຢັນການລຶບກ້ອງ"
        description="ທ່ານຕ້ອງການລຶບກ້ອງວົງຈອນປິດນີ້ແທ້ຫຼືບໍ່?"
        subDescription="ການກະທຳນີ້ຈະລຶບຂໍ້ມູນກ້ອງອອກຈາກລະບົບຖາວອນ."
      />

      {/* Video Deletion Confirmation Modal */}
      <ConfirmModal 
        isOpen={deleteVideoId !== null}
        onClose={() => setDeleteVideoId(null)}
        onConfirm={confirmRemoveVideo}
        title="ຢືນຢັນການລຶບວິດີໂອ"
        description="ທ່ານຕ້ອງການລຶບວິດີໂອຂອງກ້ອງນີ້ແທ້ຫຼືບໍ່?"
        subDescription="ການກະທຳນີ້ຈະລຶບໄຟລ໌ວິດີໂອອອກຈາກລະບົບຖາວອນ."
      />

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-panel p-4 rounded-[1.5rem] text-panel-foreground shadow-lg border border-white/5">
            <Camera className="size-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground text-white">ລາຍຊື່ກ້ອງວົງຈອນປິດ</h2>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] opacity-60">System Inventory: {cameras.length} Nodes</p>
          </div>
        </div>
        <button 
          onClick={fetchCameras} 
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-panel text-panel-foreground hover:bg-slate-800 transition-all font-black text-xs uppercase tracking-widest border border-white/5 shadow-xl active:scale-95"
        >
          <Search className="size-4" /> ໂຫຼດຂໍ້ມູນຄືນໃໝ່
        </button>
      </div>

      <DataTable headers={["ລຳດັບ", "ໄອດີກ້ອງ", "ສະຖານທີ່ຕິດຕັ້ງ", "ວິດີໂອ", "ສະຖານະ", "ຈັດການ"]} loading={loading} columnCount={6}>
        {cameras.map((cam, index) => (
          <DataTableRow key={cam.id}>
            <DataTableCell className="font-black text-sky-500 text-lg">#{index + 1}</DataTableCell>
            <DataTableCell align="left" className="font-black text-slate-700 tracking-tighter uppercase">CCTV-{cam.camera_id}</DataTableCell>
            <DataTableCell align="left">
              <div className="flex flex-col gap-1 text-left">
                <span className="font-black text-sm text-foreground uppercase tracking-tight">{cam.location_name}</span>
                <span className="text-[10px] text-muted-foreground font-bold flex items-center gap-1.5 uppercase opacity-70">
                  <MapPin className="size-3 text-rose-500" /> {cam.village}, {cam.district}, {cam.province}
                </span>
              </div>
            </DataTableCell>
            <DataTableCell>
              <div className="flex items-center justify-center gap-2">
                <button 
                  onClick={() => setPlayingVideo(`http://localhost:8000/${cam.rtsp_url}`)}
                  disabled={!cam.rtsp_url} 
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${cam.rtsp_url ? 'bg-slate-900 text-sky-400 border-white/5 hover:bg-slate-800' : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'}`}
                >
                  <Play className="size-3.5 fill-current" /> Play
                </button>
                {cam.rtsp_url && (
                  <button 
                    onClick={() => setDeleteVideoId(cam.id)}
                    className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-lg transition-all border border-rose-500/20"
                    title="ລຶບວິດີໂອ"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            </DataTableCell>
            <DataTableCell>
              <button 
                onClick={() => handleToggleStatus(cam.id, cam.is_active)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${cam.is_active ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]' : 'bg-slate-200'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${cam.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </DataTableCell>
            <DataTableCell align="center">
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => handleUploadClick(cam.id)} className="p-3 rounded-xl bg-slate-900 text-emerald-400 border border-white/5 shadow-lg hover:bg-slate-800 transition-all transform active:scale-90" title="ອັບໂຫຼດວິດີໂອ">
                  {uploadingId === cam.id && isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                </button>
                <button onClick={() => { setEditingCamera({...cam}); setIsModalOpen(true); }} className="p-3 rounded-xl bg-slate-900 text-sky-400 border border-white/5 shadow-lg hover:bg-slate-800 transition-all transform active:scale-90" title="ແກ້ໄຂຂໍ້ມູນ">
                  <Edit2 className="size-4" />
                </button>
                <button onClick={() => setDeleteCamId(cam.id)} className="p-3 rounded-xl bg-slate-900 text-rose-500 border border-white/5 shadow-lg hover:bg-slate-800 transition-all transform active:scale-90" title="ລຶບຂໍ້ມູນ">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>

      {/* Play Video Modal */}
      {playingVideo && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 p-6 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setPlayingVideo(null)}>
          <div className="relative max-w-5xl w-full bg-panel rounded-[3rem] overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="p-8 border-b border-white/5 flex justify-between items-center text-white bg-slate-900/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-sky-500/10 rounded-2xl text-sky-400"><Video className="size-6" /></div>
                <h3 className="font-black text-2xl uppercase tracking-tighter text-white">CCTV Stream Preview</h3>
              </div>
              <button onClick={() => setPlayingVideo(null)} className="p-3 bg-white/5 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"><X className="size-6" /></button>
            </div>
            <div className="bg-black aspect-video flex items-center justify-center p-2">
              <video src={playingVideo} controls autoPlay className="w-full h-full max-h-[70vh] rounded-2xl" />
            </div>
          </div>
        </div>
      )}

      {/* Video Preview Modal (AFTER UPLOAD) */}
      <VideoPreviewModal 
        isOpen={isPreviewOpen} 
        videoUrl={previewUrl} 
        onClose={discardPreview} 
        onSave={confirmSaveVideo} 
        onCancel={discardPreview} 
      />

      {/* Edit Modal */}
      {isModalOpen && editingCamera && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}>
          <div className="relative max-w-lg w-full bg-card rounded-[3rem] overflow-hidden shadow-2xl border border-border p-10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4 text-sky-400">
                <div className="bg-panel p-3 rounded-2xl shadow-inner"><Edit2 className="size-6" /></div>
                <h3 className="font-black text-2xl text-foreground tracking-tight">ແກ້ໄຂສະຖານທີ່</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground opacity-50"><X className="size-6" /></button>
            </div>
            <div className="space-y-8 text-white">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1 opacity-60 uppercase">ຊື່ສະຖານທີ່ຕິດຕັ້ງ</label>
                <input type="text" value={editingCamera.location_name} onChange={e => setEditingCamera({...editingCamera, location_name: e.target.value})} className="w-full px-6 py-4 rounded-[1.5rem] bg-muted/50 border border-border focus:border-sky-500 focus:outline-none font-black text-lg transition-all shadow-inner text-white" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1 opacity-60 uppercase">ບ້ານ (Village)</label>
                  <input type="text" value={editingCamera.village} onChange={e => setEditingCamera({...editingCamera, village: e.target.value})} className="w-full px-6 py-4 rounded-[1.5rem] bg-muted/50 border border-border focus:border-sky-500 focus:outline-none font-bold transition-all shadow-inner text-white" />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1 opacity-60 uppercase">ເມືອງ (District)</label>
                  <input type="text" value={editingCamera.district} onChange={e => setEditingCamera({...editingCamera, district: e.target.value})} className="w-full px-6 py-4 rounded-[1.5rem] bg-muted/50 border border-border focus:border-sky-500 focus:outline-none font-bold transition-all shadow-inner text-white" />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1 opacity-60 uppercase">ແຂວງ (Province)</label>
                <input type="text" value={editingCamera.province} onChange={e => setEditingCamera({...editingCamera, province: e.target.value})} className="w-full px-6 py-4 rounded-[1.5rem] bg-muted/50 border border-border focus:border-sky-500 focus:outline-none font-bold transition-all shadow-inner text-white" />
              </div>
              <div className="flex gap-4 pt-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 px-6 py-4 rounded-[1.5rem] bg-slate-100 text-slate-600 font-black hover:bg-slate-200 transition-all active:scale-95 text-sm uppercase tracking-widest">ຍົກເລີກ</button>
                <button onClick={handleSaveEdit} className="flex-[1.5] flex items-center justify-center gap-3 px-8 py-4 rounded-[1.5rem] bg-sky-500 text-white font-black hover:bg-sky-600 shadow-xl shadow-sky-500/30 transition-all active:scale-95 text-sm uppercase tracking-widest">
                  <Save className="size-5" /> ບັນທຶກຂໍ້ມູນ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
