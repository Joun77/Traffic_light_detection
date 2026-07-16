"use client"

import { useRef } from "react"
import { Printer, X } from "lucide-react"
import { ViolationReportPrint } from "./violation-report-print"

export interface Violation {
  id: number
  vehicle_id: number
  vehicle_type: string
  time_stamp: string
  light_status: string
  image_path: string
  crop_image_path?: string
  context_image_path?: string
  plate_image_path?: string
  video_path: string
}

interface PrintPreviewModalProps {
  violation: Violation | null
  onClose: () => void
}

export function PrintPreviewModal({ violation, onClose }: PrintPreviewModalProps) {
  const printRef = useRef<HTMLDivElement>(null)

  if (!violation) return null

  const handleFinalPrint = () => {
    if (!printRef.current) return

    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const content = printRef.current.innerHTML
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Violation Report - REQ-${violation.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Lao:wght@400;700;900&display=swap');
            body { margin: 0; padding: 0; font-family: 'Noto Sans Lao', sans-serif; }
            .no-print { display: none !important; }
            @media print {
              @page { size: A4; margin: 0; }
              body { -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          ${content}
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                window.onafterprint = () => window.close();
              }, 500);
            }
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300 backdrop-blur-md"
      onClick={onClose}
    >
      <div 
        className="relative max-w-5xl w-full h-full max-h-[95vh] bg-slate-900 text-white rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col border border-white/10" 
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-sky-500/10 rounded-2xl text-sky-400">
               <Printer className="size-6" />
            </div>
            <div>
               <h3 className="font-black text-xl text-white uppercase tracking-tighter">
                 ຕົວຢ່າງກ່ອນພິມ (Print Preview)
               </h3>
               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Official AI Violation Report</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-rose-500/20 rounded-full transition-all text-slate-500 hover:text-rose-500"
          >
            <X className="size-6" />
          </button>
        </div>

        {/* Modal Content (The Actual Report) */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-950 flex justify-center custom-scrollbar">
           {/* Wrap the component in a fixed width container for preview */}
           <div className="bg-white shadow-[0_0_50px_rgba(0,0,0,0.5)] transform scale-[0.85] origin-top">
              <ViolationReportPrint ref={printRef} violation={violation} />
           </div>
        </div>

        {/* Modal Footer (Actions) */}
        <div className="px-8 py-5 border-t border-white/5 bg-white/[0.02] flex justify-end gap-4 shrink-0">
          <button 
            onClick={onClose}
            className="px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-400 hover:bg-white/5 transition-all active:scale-95"
          >
            ຍົກເລີກ (Cancel)
          </button>
          <button 
            onClick={handleFinalPrint}
            className="flex items-center gap-3 px-10 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-sky-500 text-white hover:bg-sky-600 shadow-xl shadow-sky-500/20 transition-all active:scale-95"
          >
            <Printer className="size-4" />
            ພິມເອກະສານ (Print Report)
          </button>
        </div>
      </div>
    </div>
  )
}

