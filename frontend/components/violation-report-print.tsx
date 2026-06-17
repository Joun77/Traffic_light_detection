"use client"

import React from "react"
import { Violation } from "./print-preview-modal"

interface ViolationReportPrintProps {
  violation: Violation & {
    village?: string
    district?: string
    province?: string
    location_name?: string
  }
}

export const ViolationReportPrint = React.forwardRef<HTMLDivElement, ViolationReportPrintProps>(
  ({ violation }, ref) => {
    const today = new Date().toLocaleDateString("lo-LA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })

    const violationDate = new Date(violation.time_stamp).toLocaleDateString("lo-LA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    
    const violationTime = new Date(violation.time_stamp).toLocaleTimeString("lo-LA", {
      hour: "2-digit",
      minute: "2-digit",
    })

    const translateType = (type: string) => {
      const map: Record<string, string> = {
        car: "ລົດໃຫຍ່ (Car)",
        motorcycle: "ລົດຈັກ (Motorcycle)",
        bus: "ລົດເມ (Bus)",
        truck: "ລົດບັນທຸກ (Truck)",
      }
      return map[type.toLowerCase()] || type
    }

    const translateStatus = (status: string) => {
      const map: Record<string, string> = {
        red: "ແດງ",
        green: "ຂຽວ",
        yellow: "ເຫຼືອງ",
        unknown: "ບໍ່ລະບຸ",
      }
      return map[status.toLowerCase()] || status
    }

    return (
      <div ref={ref} className="print-container">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page { size: A4; margin: 0; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; background: #fff; }
            .no-print { display: none !important; }
            .print-document { box-shadow: none; border: none; padding: 0; width: 100%; height: 297mm; overflow: hidden; page-break-after: avoid; }
          }
          
          .print-document {
            background: #fff;
            width: 210mm;
            height: 297mm;
            padding: 15mm 20mm;
            margin: auto;
            font-family: 'Phetsarath OT', 'Noto Sans Lao', sans-serif;
            color: #1a1a1a;
            line-height: 1.4;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
          }

          .print-header {
            text-align: center;
            border-bottom: 2px solid #1a1a1a;
            padding-bottom: 10px;
            margin-bottom: 15px;
          }
          .print-country { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
          .print-motto { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
          .print-dept { font-size: 14px; font-weight: bold; color: #1e3a5f; }

          .print-title-block { text-align: center; margin: 10px 0; }
          .print-title-block h1 { font-size: 26px; font-weight: 900; color: #b91c1c; margin: 0; }
          .print-title-block h2 { font-size: 16px; color: #444; margin-top: 2px; font-weight: bold; }

          .print-meta-row {
            display: flex;
            justify-content: space-between;
            border: 1px solid #ccc;
            margin: 10px 0;
            background: #f9f9f9;
          }
          .print-meta-cell { padding: 8px 15px; font-size: 13px; flex: 1; }
          .print-meta-cell:first-child { border-right: 1px solid #ccc; }
          .print-meta-cell span { font-weight: bold; margin-left: 5px; color: #b91c1c; }

          .print-section-heading {
            font-size: 14px;
            font-weight: bold;
            color: #fff;
            background: #1e3a5f;
            padding: 6px 15px;
            margin: 15px 0 10px;
            border-radius: 4px;
          }

          .print-details-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px 30px;
            margin-bottom: 15px;
            padding: 0 10px;
          }
          .print-detail-item { font-size: 13px; }
          .print-detail-label { font-weight: bold; color: #555; width: 100px; display: inline-block; }
          .print-detail-value { font-weight: bold; color: #000; }

          .print-evidence-box {
            border: 2px solid #1e3a5f;
            border-radius: 10px;
            padding: 10px;
            background: #fff;
            margin: 10px 0;
            max-height: 105mm;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .print-evidence-image {
            max-width: 100%;
            max-height: 100mm;
            width: auto;
            height: auto;
            border-radius: 5px;
            object-fit: contain;
          }

          .print-warning-box {
            border: 1.5px solid #f59e0b;
            background: #fffbeb;
            border-radius: 8px;
            padding: 12px;
            margin: 10px 0;
            font-size: 11px;
          }
          .print-warn-title { font-weight: bold; color: #b45309; font-size: 13px; margin-bottom: 5px; }
          .print-warning-box ul { padding-left: 15px; margin: 0; }

          .print-footer {
            display: flex;
            justify-content: space-between;
            margin-top: auto;
            padding-top: 15px;
            border-top: 1px solid #eee;
          }
          .print-sig-block { text-align: center; flex: 1; font-size: 12px; }
          .print-stamp-block { text-align: center; flex: 1; font-size: 12px; }
          .print-stamp-circle {
            width: 80px;
            height: 80px;
            border: 2px dashed #1e3a5f;
            border-radius: 50%;
            margin: 8px auto;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #1e3a5f;
            font-weight: bold;
          }
          
          .print-sys-footer {
            text-align: center;
            font-size: 10px;
            color: #aaa;
            margin-top: 10px;
            padding-top: 5px;
            border-top: 1px solid #eee;
          }
        ` }} />

        <div className="print-document">
          <div className="print-header">
            <div className="print-country">ສາທາລະນະລັດ ປະຊາທິປະໄຕ ປະຊາຊົນລາວ</div>
            <div className="print-motto">ສັນຕິພາບ ເອກະລາດ ປະຊາທິປະໄຕ ເອກະພາບ ວັດທະນະຖາວອນ</div>
            <div className="print-dept">ກົມຕຳຫຼວດຈະລາຈອນ</div>
          </div>

          <div className="print-title-block">
            <h1>ໃບແຈ້ງໂທດ</h1>
            <h2>ການກະທຳຜິດກົດຈະລາຈອນ (ລ່ວງໄຟແດງ)</h2>
          </div>

          <div className="print-meta-row">
            <div className="print-meta-cell">ເລກທີໃບແຈ້ງ: <span>REQ-{violation.id.toString().padStart(6, '0')}</span></div>
            <div className="print-meta-cell">ວັນທີອອກໃບແຈ້ງ: <span>{today}</span></div>
          </div>

          <div className="print-section-heading">ລາຍລະອຽດການກະທຳຜິດ</div>
          <div className="print-details-grid">
            <div className="print-detail-item">
              <span className="print-detail-label">ສະຖານທີ່:</span>
              <span className="print-detail-value">{violation.location_name || "ບໍ່ລະບຸ"}</span>
            </div>
            <div className="print-detail-item">
              <span className="print-detail-label">ບ້ານ:</span>
              <span className="print-detail-value">{violation.village || "ບໍ່ລະບຸ"}</span>
            </div>
            <div className="print-detail-item">
              <span className="print-detail-label">ເມືອງ:</span>
              <span className="print-detail-value">{violation.district || "ບໍ່ລະບຸ"}</span>
            </div>
            <div className="print-detail-item">
              <span className="print-detail-label">ແຂວງ:</span>
              <span className="print-detail-value">{violation.province || "ບໍ່ລະບຸ"}</span>
            </div>
            <div className="print-detail-item">
              <span className="print-detail-label">ວັນທີກະທຳຜິດ:</span>
              <span className="print-detail-value">{violationDate}</span>
            </div>
            <div className="print-detail-item">
              <span className="print-detail-label">ເວລາກະທຳຜິດ:</span>
              <span className="print-detail-value">{violationTime}</span>
            </div>
            <div className="print-detail-item">
              <span className="print-detail-label">ປະເພດພາຫະນະ:</span>
              <span className="print-detail-value uppercase">{translateType(violation.vehicle_type)}</span>
            </div>
            <div className="print-detail-item">
              <span className="print-detail-label">ສະຖານະໄຟ:</span>
              <span className="print-detail-value text-red-600">{translateStatus(violation.light_status)}</span>
            </div>
          </div>

          <div className="print-section-heading">ຫຼັກຖານການກະທຳຜິດ (Evidence Proof)</div>
          <div className="print-evidence-box">
            <img 
              src={`http://localhost:8000/${violation.image_path}`} 
              alt="Evidence" 
              className="print-evidence-image"
            />
          </div>

          <div className="print-warning-box">
            <div className="print-warn-title">⚠ ຂໍ້ຄວນຮູ້ ແລະ ລະບຽบການ ⚠</div>
            <ul>
              <li>ໃບແຈ້ງໂທດສະບັບນີ້ ອ້າງອີງຈາກຫຼັກຖານຮູບພາບທີ່ໄດ້ຮັບການບັນທຶກໂດຍລະບົບ AI Monitoring</li>
              <li>ກະລຸນານຳໃບແຈ້ງໂທດນີ້ ໄປຊຳລະຄ່າປັບໃໝ ທີ່ກົມຕຳຫຼວດຈະລາຈອນ ພາຍໃນ 15 ວັນ</li>
              <li>ຫາກມີຂໍ້ສົງໄສ ຫຼື ຕ້ອງການຄັດຄ້ານ ກະລຸນາຕິດຕໍ່: ກົມຕຳຫຼວດຈະລາຈອນ</li>
            </ul>
          </div>

          <div className="print-footer">
            <div className="print-sig-block">
               <p>ຜູ້ບັນທຶກຂໍ້ມູນ</p>
               <br/><br/>
               <p className="border-b border-gray-400 inline-block min-w-[150px]"></p>
               <p>(............................................)</p>
            </div>
            <div className="print-stamp-block">
               <p>ຫົວໜ້າກົມຕຳຫຼວດຈະລາຈອນ</p>
               <div className="print-stamp-circle">ຈ້ຳກາປະທັບ</div>
               <p className="border-b border-gray-400 inline-block min-w-[150px]"></p>
               <p>(............................................)</p>
            </div>
          </div>

          <div className="print-sys-footer">
            ເອກະສານສະບັບນີ້ອອກໂດຍລະບົບກວດຈັບລ້ຳໄຟແດງອັດຕະໂນມັດ | AI Traffic Monitoring System
          </div>
        </div>
      </div>
    );
  }
)

ViolationReportPrint.displayName = "ViolationReportPrint"
