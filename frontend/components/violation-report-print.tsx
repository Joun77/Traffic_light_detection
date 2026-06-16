"use client"

import React from "react"
import { Violation } from "./print-preview-modal"

interface ViolationReportPrintProps {
  violation: Violation
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
            @page { size: A4; margin: 10mm; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; background: #fff; }
            .no-print { display: none !important; }
            .print-document { box-shadow: none; border: none; padding: 0; width: 100%; }
          }
          
          .print-document {
            background: #fff;
            width: 210mm;
            min-height: 280mm;
            padding: 20mm 25mm;
            margin: auto;
            font-family: 'Phetsarath OT', 'Noto Sans Lao', sans-serif;
            color: #1a1a1a;
            line-height: 1.6;
            box-sizing: border-box;
          }

          .print-header {
            text-align: center;
            border-bottom: 3px double #1a1a1a;
            padding-bottom: 15px;
            margin-bottom: 25px;
          }
          .print-country { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
          .print-motto { font-size: 13px; margin-bottom: 10px; font-style: italic; }
          .print-dept { font-size: 15px; font-weight: bold; color: #1e3a5f; }

          .print-title-block { text-align: center; margin: 20px 0; }
          .print-title-block h1 { font-size: 32px; font-weight: 900; color: #b91c1c; margin: 0; }
          .print-title-block h2 { font-size: 18px; color: #444; margin-top: 5px; font-weight: bold; }

          .print-meta-row {
            display: flex;
            justify-content: space-between;
            border: 1px solid #bbb;
            margin: 20px 0;
            background: #fcfcfc;
          }
          .print-meta-cell { padding: 12px 20px; font-size: 15px; flex: 1; }
          .print-meta-cell:first-child { border-right: 1px solid #bbb; }
          .print-meta-cell span { font-weight: bold; margin-left: 10px; color: #b91c1c; }

          .print-section-heading {
            font-size: 16px;
            font-weight: bold;
            color: #fff;
            background: #1e3a5f;
            padding: 10px 20px;
            margin: 30px 0 20px;
            border-radius: 4px;
          }

          .print-details-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
            padding: 0 10px;
          }
          .print-detail-item { font-size: 15px; }
          .print-detail-label { font-weight: bold; color: #555; width: 130px; display: inline-block; }
          .print-detail-value { font-weight: bold; color: #000; }

          .print-evidence-box {
            border: 3px solid #1e3a5f;
            border-radius: 15px;
            padding: 15px;
            background: #fff;
            margin: 20px 0;
            box-shadow: 0 10px 25px rgba(0,0,0,0.05);
          }
          .print-evidence-image {
            width: 100%;
            height: auto;
            border-radius: 8px;
            display: block;
          }

          .print-warning-box {
            border: 2px solid #f59e0b;
            background: #fffbeb;
            border-radius: 12px;
            padding: 25px;
            margin: 40px 0;
            font-size: 14px;
          }
          .print-warn-title { font-weight: bold; color: #b45309; font-size: 16px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
          .print-warning-box ul { padding-left: 20px; }
          .print-warning-box li { margin-bottom: 10px; }

          .print-footer {
            display: flex;
            justify-content: space-between;
            margin-top: 60px;
            padding-top: 30px;
            border-top: 2px solid #eee;
          }
          .print-sig-block { text-align: center; flex: 1; }
          .print-stamp-block { text-align: center; flex: 1; }
          .print-stamp-circle {
            width: 110px;
            height: 110px;
            border: 3px dashed #1e3a5f;
            border-radius: 50%;
            margin: 15px auto;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #1e3a5f;
            font-weight: bold;
          }
          
          .print-sys-footer {
            text-align: center;
            font-size: 12px;
            color: #aaa;
            margin-top: 80px;
            padding-top: 20px;
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
              <span className="print-detail-value">ໄຟແດງສີ່ແຍກປະຕູໄຊ</span>
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
              <span className="print-detail-label">ລະຫັດກ້ອງ:</span>
              <span className="print-detail-value">CAM-001</span>
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
            <div className="print-warn-title">⚠ ຂໍ้ຄວນຮູ້ ແລະ ລະບຽບການ ⚠</div>
            <ul>
              <li>ໃບແຈ້ງໂທດສະບັບນີ້ ອ້າງອີງຈາກຫຼັກຖານຮູບພາບທີ່ໄດ້ຮັບການບັນທຶກໂດຍລະບົບ AI Monitoring ທີ່ໄດ້ກວດສອບຄວາມຖືກຕ້ອງແລ້ວ</li>
              <li>ກະລຸນານຳໃບແຈ້ງໂທດນີ້ ໄປຊຳລະຄ່າປັບໃໝ ທີ່ກົມຕຳຫຼວດຈະລາຈອນ ພາຍໃນ 15 ວັນ ນັບຈາກວັນທີອອກໃບແຈ້ງ</li>
              <li>ຫາກກາຍກຳນົດເວລາ ທ່ານຈະຖືກປັບໃໝເພີ່ມ ຫຼື ດຳເນີນການຕາມລະບຽບກົດໝາຍທີ່ກ່ຽວຂ້ອງ</li>
              <li>ຫາກມີຂໍ້ສົງໄສ ຫຼື ຕ້ອງການຄັດຄ້ານ ກະລຸນາຕິດຕໍ່: ກົມຕຳຫຼວດຈະລາຈອນ ເບີໂທ: 021 212xxx</li>
            </ul>
          </div>

          <div className="print-footer">
            <div className="print-sig-block">
               <p>ຜູ້ບັນທຶກຂໍ້ມູນ</p>
               <br/><br/>
               <p className="border-b border-gray-400 inline-block min-w-[200px]"></p>
               <p>(............................................)</p>
            </div>
            <div className="print-stamp-block">
               <p>ຫົວໜ້າກົມຕຳຫຼວດຈະລາຈອນ</p>
               <div className="print-stamp-circle">ຈ້ຳກາປະທັບ</div>
               <p className="border-b border-gray-400 inline-block min-w-[200px]"></p>
               <p>(............................................)</p>
            </div>
          </div>

          <div className="print-sys-footer">
            ເອກະສານສະບັບນີ້ອອກໂດຍລະບົບກວດຈັບລ້ຳໄຟແດງອັດຕະໂນມັດ | AI Traffic Monitoring & Enforcement System
          </div>
        </div>
      </div>
    );
  }
)

ViolationReportPrint.displayName = "ViolationReportPrint"
