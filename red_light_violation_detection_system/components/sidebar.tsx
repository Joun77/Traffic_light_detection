"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Car, Home, Layers, Video, Upload, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "ໜ້າຫຼັກ", icon: Home },
  { href: "/data", label: "ຈັດການຂໍ້ມູນ", icon: Layers },
  { href: "/videos", label: "ເບິ່ງວິດີໂອ", icon: Video },
  { href: "/upload-roi", label: "ອັບ ROI", icon: Upload },
  { href: "/settings", label: "ຕັ້ງຄ່າ", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-64 shrink-0 flex-col rounded-r-[2.5rem] bg-panel text-panel-foreground">
      <div className="flex items-center gap-2 px-6 pt-6 pb-10">
        <Car className="size-8 text-panel-foreground" aria-hidden="true" />
        <span className="text-lg font-bold">ລະບົບກວດຈັບລົດລວງໄຟແດງ</span>
      </div>

      <nav className="flex flex-col gap-2 px-4" aria-label="Main navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-full px-5 py-3 text-base font-medium transition-colors",
                active
                  ? "bg-panel-foreground text-panel"
                  : "text-panel-foreground hover:bg-white/10",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto px-6 pb-8 pt-10">
        <button
          type="button"
          className="flex items-center gap-3 text-base font-medium text-panel-foreground transition-colors hover:text-white/70"
        >
          <LogOut className="size-5" aria-hidden="true" />
          ອອກຈາກລະບົບ
        </button>
      </div>
    </aside>
  )
}
