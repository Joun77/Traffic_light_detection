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
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
            .no-print { display: none !important; }
            .print-document {
              box-shadow: none !important; border: none !important;
              width: 210mm !important; height: 297mm !important;
              padding: 10mm 15mm !important;
              overflow: hidden !important;
              page-break-after: avoid !important;
            }
          }

          .print-document {
            background: #fff;
            width: 210mm;
            height: 297mm;
            padding: 10mm 15mm;
            margin: auto;
            font-family: 'Phetsarath OT', 'Noto Sans Lao', sans-serif;
            color: #1a1a1a;
            line-height: 1.3;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          /* ── Header ── */
          .print-header {
            text-align: center;
            border-bottom: 2px solid #1a1a1a;
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .print-country { font-size: 13px; font-weight: bold; margin: 0; }
          .print-motto   { font-size: 13px; font-weight: bold; margin: 0; }
          .print-dept    { font-size: 12px; font-weight: bold; color: #1e3a5f; margin: 0; }

          /* ── Title ── */
          .print-title-block { text-align: center; margin: 5px 0; }
          .print-title-block h1 { font-size: 22px; font-weight: 900; color: #b91c1c; margin: 0; }
          .print-title-block h2 { font-size: 13px; color: #444; margin: 1px 0 0; font-weight: bold; }

          /* ── Meta row ── */
          .print-meta-row {
            display: flex; justify-content: space-between;
            border: 1px solid #ccc; margin: 5px 0; background: #f9f9f9;
          }
          .print-meta-cell { padding: 5px 12px; font-size: 12px; flex: 1; }
          .print-meta-cell:first-child { border-right: 1px solid #ccc; }
          .print-meta-cell span { font-weight: bold; margin-left: 4px; color: #b91c1c; }

          /* ── Section headings ── */
          .print-section-heading {
            font-size: 12px; font-weight: bold; color: #fff;
            background: #1e3a5f; padding: 4px 12px;
            margin: 7px 0 5px; border-radius: 4px;
          }

          /* ── Details grid ── */
          .print-details-grid {
            display: grid; grid-template-columns: repeat(2, 1fr);
            gap: 4px 20px; margin-bottom: 4px; padding: 0 8px;
          }
          .print-detail-item { font-size: 12px; }
          .print-detail-label { font-weight: bold; color: #555; width: 90px; display: inline-block; }
          .print-detail-value { font-weight: bold; color: #000; }

          /* ── Evidence section ── */
          .print-ev-section { margin: 4px 0; }
          .print-ev-label {
            font-size: 9px; font-weight: bold; color: #1e3a5f;
            margin-bottom: 2px; letter-spacing: 0.05em; text-transform: uppercase;
          }
          .print-ev-main {
            border: 2px solid #1e3a5f; border-radius: 6px;
            padding: 4px; background: #fff; margin-bottom: 5px;
            height: 50mm; display: flex; align-items: center;
            justify-content: center; overflow: hidden;
          }
          .print-ev-main img {
            max-width: 100%; max-height: 46mm; object-fit: contain; border-radius: 3px;
          }
          .print-ev-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
          .print-ev-small {
            border: 1.5px solid #cbd5e1; border-radius: 6px;
            padding: 4px; background: #f8fafc;
            height: 30mm; display: flex; flex-direction: column; gap: 2px; overflow: hidden;
          }
          .print-ev-small-inner {
            flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden;
          }
          .print-ev-small-inner img { max-width: 100%; max-height: 100%; object-fit: contain; }
          .print-ev-placeholder { color: #94a3b8; font-size: 9px; font-style: italic; text-align: center; }

          /* ── Warning box ── */
          .print-warning-box {
            border: 1.5px solid #f59e0b; background: #fffbeb;
            border-radius: 6px; padding: 7px 10px; margin: 6px 0; font-size: 10px;
          }
          .print-warn-title { font-weight: bold; color: #b45309; font-size: 11px; margin-bottom: 3px; }
          .print-warning-box ul { padding-left: 14px; margin: 0; }
          .print-warning-box li { margin-bottom: 1px; }

          /* ── Footer ── */
          .print-footer {
            display: flex; justify-content: space-between;
            margin-top: auto; padding-top: 8px; border-top: 1px solid #eee;
          }
          .print-sig-block   { text-align: center; flex: 1; font-size: 11px; }
          .print-stamp-block { text-align: center; flex: 1; font-size: 11px; }
          .print-stamp-circle {
            width: 60px; height: 60px; border: 2px dashed #1e3a5f;
            border-radius: 50%; margin: 5px auto;
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; color: #1e3a5f; font-weight: bold;
          }

          .print-sys-footer {
            text-align: center; font-size: 9px; color: #aaa;
            margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee;
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
          <div className="print-ev-section">

            {/* ① ຮູບຫຼັກຖານລວມ */}
            <div className="print-ev-label">① ຮູບຫຼັກຖານລວມ — ພາຫະນະ ແລະ ໄຟສັນຍານ</div>
            <div className="print-ev-main">
              <img
                src={`http://localhost:8000/${violation.context_image_path || violation.image_path}`}
                alt="Full Evidence"
              />
            </div>

            {/* ② ຮູບລົດ  +  ③ ຮູບປ້າຍທະບຽນ */}
            <div className="print-ev-row">
              <div className="print-ev-small">
                <div className="print-ev-label">② ຮູບພາຫະນະທີ່ກະທຳຜິດ</div>
                <div className="print-ev-small-inner">
                  {violation.crop_image_path ? (
                    <img src={`http://localhost:8000/${violation.crop_image_path}`} alt="Vehicle" />
                  ) : (
                    <div className="print-ev-placeholder">ບໍ່ມີຮູບພາຫະນະ</div>
                  )}
                </div>
              </div>
              <div className="print-ev-small">
                <div className="print-ev-label">③ ຮູບປ້າຍທະບຽນ</div>
                <div className="print-ev-small-inner">
                  {violation.plate_image_path ? (
                    <img src={`http://localhost:8000/${violation.plate_image_path}`} alt="Plate" />
                  ) : (
                    <div className="print-ev-placeholder">ບໍ່ມີຮູບປ້າຍທະບຽນ</div>
                  )}
                </div>
              </div>
            </div>

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
