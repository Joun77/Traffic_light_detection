"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Car, Home, Layers, Activity, Camera, Target, Settings, LogOut, ChevronLeft, Menu } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", label: "ໜ້າຫຼັກ", icon: Home },
  { href: "/monitor", label: "ກວດຈັບ", icon: Activity },
  { href: "/cameras", label: "ຈັດການກ້ອງ", icon: Camera },
  { href: "/data", label: "ປະຫວັດການລະເມີດ", icon: Layers },
  { href: "/upload-roi", label: "ຕັ້ງຄ່າພື້ນທີ່ກວດຈັບ", icon: Target },
  { href: "/settings", label: "ຕັ້ງຄ່າລະບົບ", icon: Settings },
]

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (value: boolean) => void
}

export function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside 
      className={cn(
        "relative flex shrink-0 flex-col bg-panel text-panel-foreground transition-all duration-300 ease-in-out",
        isCollapsed ? "w-20" : "w-64"
      )} 
      suppressHydrationWarning
    >
      {/* Toggle Button - Moved lower to avoid overlap with logo */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-24 z-50 flex size-6 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg hover:bg-sky-600 transition-transform active:scale-95 border-2 border-panel"
      >
        <ChevronLeft className={cn("size-4 transition-transform duration-500", isCollapsed && "rotate-180")} />
      </button>

      {/* Logo Section */}
      <div className={cn(
        "flex items-center gap-3 pt-10 pb-12 overflow-hidden",
        isCollapsed ? "justify-center px-0" : "px-6"
      )} suppressHydrationWarning>
        <div className="p-2 bg-sky-500/10 rounded-2xl shrink-0 flex items-center justify-center shadow-lg shadow-sky-500/5">
          <Car className={cn("text-sky-400", isCollapsed ? "size-7" : "size-8")} aria-hidden="true" />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="text-2xl font-black tracking-tighter leading-none text-white">
              ລະບົບກວດຈັບ
            </span>
            <span className="text-lg font-black tracking-tighter leading-none text-sky-400 mt-1">
              ລົດລວງໄຟແດງ
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2 px-3" aria-label="Main navigation" suppressHydrationWarning>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              title={isCollapsed ? label : ""}
              className={cn(
                "flex items-center gap-3 rounded-2xl transition-all duration-200 overflow-hidden whitespace-nowrap",
                isCollapsed ? "justify-center px-0 py-3" : "px-5 py-3",
                active
                  ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
                  : "text-panel-foreground/70 hover:bg-white/5 hover:text-white",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("shrink-0", isCollapsed ? "size-6" : "size-5")} aria-hidden="true" />
              {!isCollapsed && <span className="font-bold text-sm">{label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="mt-auto px-3 pb-8 pt-10" suppressHydrationWarning>
        <button
          type="button"
          className={cn(
            "flex items-center gap-3 rounded-2xl text-panel-foreground/60 transition-all hover:text-rose-400 hover:bg-rose-500/5 w-full",
            isCollapsed ? "justify-center py-3 px-0" : "px-5 py-3"
          )}
        >
          <LogOut className={cn("shrink-0", isCollapsed ? "size-6" : "size-5")} aria-hidden="true" />
          {!isCollapsed && <span className="font-bold text-sm">ອອກຈາກລະບົບ</span>}
        </button>
      </div>
    </aside>
  )
}
