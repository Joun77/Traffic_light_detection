"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { UploadCloud } from "lucide-react"
import { ROIEditor } from "@/components/roi-editor"
import { SuccessModal } from "@/components/success-modal"

export default function UploadRoiPage() {
  const router = useRouter()
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isConfiguring, setIsConfiguring] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setVideoFile(file)
      // เติม #t=0.1 เพื่อให้วิดีโอแสดงเฟรมแรกทันทีบนบางเบราว์เซอร์
      setVideoUrl(URL.createObjectURL(file) + "#t=0.1")
      setIsConfiguring(true)
    }
  }

  const handleSaveConfig = async (configData: any) => {
    try {
      // 1. อัปโหลดไฟล์วิดีโอไปที่ Backend
      if (videoFile) {
        const formData = new FormData()
        formData.append("file", videoFile)
        await fetch("http://localhost:8000/upload-video", {
          method: "POST",
          body: formData,
        })
      }

      // 2. บันทึก ROI และสั่งเริ่ม AI
      const response = await fetch("http://localhost:8000/start-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configData),
      })

      if (response.ok) {
        setShowSuccess(true)
      } else {
        const err = await response.json()
        alert("Error: " + err.message)
      }
    } catch (error) {
      console.error("Save Error:", error)
      alert("ເກີດຂໍ້ຜິດພາດໃນການເຊື່ອມຕໍ່ກັບ Backend")
    }
  }

  const handleSuccessClose = () => {
    setShowSuccess(false)
    router.push("/monitor")
  }

  return (
    <DashboardShell title="ຕັ້ງຄ່າເສັ້ນ ROI">
      <div className="mx-auto max-w-5xl">
        {!isConfiguring ? (
          <div
            onClick={() => document.getElementById("file-input")?.click()}
            className="group relative flex min-h-[400px] cursor-pointer flex-col items-center justify-center rounded-[3rem] border-4 border-dashed border-sky-400/20 bg-card/50 p-12 text-center transition-all hover:border-sky-400/50 hover:bg-sky-400/5 shadow-2xl"
          >
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-sky-400/10 text-sky-400 group-hover:scale-110 transition-transform duration-500 shadow-inner">
              <UploadCloud className="size-12" />
            </div>
            
            <h2 className="text-3xl font-black text-foreground">ກົດເພື່ອອັບໂຫຼດວິດີໂອ</h2>
            <p className="mt-4 text-lg font-medium text-muted-foreground max-w-md mx-auto">
              ເລືອກໄຟລ໌ວິດີໂອການຈາລະຈອນຂອງທ່ານເພື່ອເລີ່ມຕົ້ນການກຳນົດເສັ້ນ ROI ແລະ ພື້ນທີ່ກວດຈັບ.
            </p>
            
            <div className="mt-8 flex gap-3">
              <span className="px-4 py-2 rounded-xl bg-panel text-xs font-black uppercase tracking-widest border border-border">MP4</span>
              <span className="px-4 py-2 rounded-xl bg-panel text-xs font-black uppercase tracking-widest border border-border">MOV</span>
              <span className="px-4 py-2 rounded-xl bg-panel text-xs font-black uppercase tracking-widest border border-border">AVI</span>
            </div>

            <input
              id="file-input"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          videoUrl && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-2 rounded-full bg-sky-400" />
                  <h3 className="text-xl font-black">ປັບແຕ່ງພື້ນທີ່ກວດຈັບ (ROI Editor)</h3>
                </div>
                <button 
                  onClick={() => setIsConfiguring(false)}
                  className="px-6 py-2 rounded-xl bg-panel hover:bg-muted font-bold text-sm transition-colors border border-border"
                >
                  ປ່ຽນວິດີໂອ
                </button>
              </div>

              <ROIEditor
                videoUrl={videoUrl}
                onSave={handleSaveConfig}
                onCancel={() => setIsConfiguring(false)}
              />
            </div>
          )
        )}
      </div>

      <SuccessModal 
        isOpen={showSuccess}
        onClose={handleSuccessClose}
        title="ເລີ່ມການກວດຈັບແລ້ວ"
        description="ລະບົບໄດ້ບັນທຶກພິກັດ ROI ແລະ ກຳລັງເລີ່ມປະມວນຜົນວິດີໂອຂອງທ່ານໃນຂະນະນີ້."
      />
    </DashboardShell>
  )
}
