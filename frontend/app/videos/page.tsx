import { DashboardShell } from "@/components/dashboard-shell"
import { Search, PlaySquare, Download, Trash2 } from "lucide-react"

const videoRows = [
  { no: 1, id: "201516", type: "SUSUKI", date: "12/06/2026", time: "10:30:52", status: "ຍັງບໍ່ໄດ້ກວດສອບ", done: false },
  { no: 2, id: "341257", type: "SUSUKI", date: "10/06/2026", time: "09:30:52", status: "ກວດສອບສຳເລັດ", done: true },
  { no: 3, id: "224456", type: "SUSUKI", date: "09/06/2026", time: "11:30:52", status: "ກວດສອບສຳເລັດ", done: true },
]

export default function VideosPage() {
  return (
    <DashboardShell title="ໜ້າເບິ່ງຂໍ້ມູນວິດີໂອ">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-sm font-medium text-brand-foreground">
            ຄົ້ນຫາຈາກວັນທີ
          </label>
          <input
            id="from"
            type="date"
            defaultValue="2026-06-01"
            className="rounded-full bg-card px-4 py-2.5 text-card-foreground outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-sm font-medium text-brand-foreground">
            ເຖິງວັນທີ
          </label>
          <input
            id="to"
            type="date"
            defaultValue="2026-06-01"
            className="rounded-full bg-card px-4 py-2.5 text-card-foreground outline-none"
          />
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-panel px-5 py-2.5 font-medium text-panel-foreground"
        >
          <Search className="size-4" aria-hidden="true" />
          ຄົ້ນຫາ
        </button>
      </div>

      {/* Count + page size */}
      <div className="mt-8 flex items-center justify-between">
        <p className="text-brand-foreground">ສະແດງ 1 - 10 ລາຍການໃນຂໍ້ມູນທັງໝົດ</p>
        <select className="rounded-lg bg-card px-4 py-2 text-card-foreground outline-none">
          <option>10 ລາຍການ</option>
          <option>20 ລາຍການ</option>
          <option>50 ລາຍການ</option>
        </select>
      </div>

      {/* Video record cards */}
      <div className="mt-4 flex flex-col gap-5">
        {videoRows.map((row) => (
          <div
            key={row.no}
            className="grid grid-cols-2 items-center gap-y-2 rounded-2xl bg-card px-6 py-4 text-card-foreground sm:grid-cols-8"
          >
            <Field label="ລຳດັບ" value={String(row.no)} />
            <Field label="ໄອດີ" value={row.id} />
            <Field label="ປະເພດລົດ" value={row.type} />
            <Field label="ວັນທີ" value={row.date} />
            <Field label="ເວລາ" value={row.time} />
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground">ວິດີໂອ</span>
              <button type="button" aria-label="ຫຼິ້ນວິດີໂອ">
                <PlaySquare className="size-9 text-status-blue" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground">ສະຖານະກວດສອບ</span>
              <span className={`text-sm font-medium ${row.done ? "text-status-green" : "text-status-red"}`}>
                {row.status}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground">ດາວໂຫຼດວິດີໂອ ແລະ ລົບຂໍ້ມູນ</span>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="ດາວໂຫຼດ">
                  <Download className="size-5 text-status-green" aria-hidden="true" />
                </button>
                <button type="button" aria-label="ລົບ">
                  <Trash2 className="size-5 text-status-red" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-semibold">{value}</span>
    </div>
  )
}
