"use client"

import { useState } from "react"
import { DashboardShell } from "@/components/dashboard-shell"
import { User, SlidersHorizontal, Bell, ShieldCheck } from "lucide-react"

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-5 flex items-center gap-2 border-b border-border pb-3">
        <Icon className="size-5 text-brand" />
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Toggle({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((v) => !v)}
        className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-status-green" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  "rounded-lg border border-border bg-background/0 px-4 py-2.5 text-card-foreground outline-none focus:border-brand"

export default function SettingsPage() {
  return (
    <DashboardShell title="ໜ້າຕັ້ງຄ່າ">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="ໂປຣໄຟລ໌ຜູ້ໃຊ້" icon={User}>
          <Field label="ຊື່ຜູ້ໃຊ້">
            <input className={inputClass} defaultValue="admin" />
          </Field>
          <Field label="ອີເມວ">
            <input type="email" className={inputClass} defaultValue="admin@example.com" />
          </Field>
          <Field label="ເບີໂທລະສັບ">
            <input className={inputClass} defaultValue="020 12345678" />
          </Field>
        </SectionCard>

        <SectionCard title="ການຕັ້ງຄ່າລະບົບ" icon={SlidersHorizontal}>
          <Field label="ພາສາ">
            <select className={inputClass}>
              <option>ລາວ</option>
              <option>English</option>
              <option>ไทย</option>
            </select>
          </Field>
          <Field label="ເຂດເວລາ">
            <select className={inputClass}>
              <option>(GMT+7) ວຽງຈັນ</option>
              <option>(GMT+8) ບາງກອກ</option>
            </select>
          </Field>
          <Toggle label="ໂໝດກາງຄືນ (Dark mode)" />
          <Toggle label="ບັນທຶກອັດຕະໂນມັດ" defaultOn />
        </SectionCard>

        <SectionCard title="ການແຈ້ງເຕືອນ" icon={Bell}>
          <Toggle label="ແຈ້ງເຕືອນເມື່ອກວດພົບລົດລ່ວງໄຟແດງ" defaultOn />
          <Toggle label="ແຈ້ງເຕືອນທາງອີເມວ" defaultOn />
          <Toggle label="ແຈ້ງເຕືອນເມື່ອກ້ອງມີບັນຫາ" />
          <Field label="ຄວາມຖີ່ການສະຫຼຸບລາຍງານ">
            <select className={inputClass}>
              <option>ປະຈຳວັນ</option>
              <option>ປະຈຳອາທິດ</option>
              <option>ປະຈຳເດືອນ</option>
            </select>
          </Field>
        </SectionCard>

        <SectionCard title="ຄວາມປອດໄພ" icon={ShieldCheck}>
          <Field label="ລະຫັດຜ່ານໃໝ່">
            <input type="password" className={inputClass} placeholder="••••••••" />
          </Field>
          <Field label="ຢືນຢັນລະຫັດຜ່ານ">
            <input type="password" className={inputClass} placeholder="••••••••" />
          </Field>
          <Toggle label="ການຢືນຢັນ 2 ຊັ້ນ (2FA)" />
        </SectionCard>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          className="rounded-lg bg-brand px-10 py-3 text-lg font-semibold text-brand-foreground"
        >
          ບັນທຶກ
        </button>
        <button
          type="button"
          className="rounded-lg bg-panel px-10 py-3 text-lg font-semibold text-panel-foreground"
        >
          ຍົກເລີກ
        </button>
      </div>
    </DashboardShell>
  )
}
