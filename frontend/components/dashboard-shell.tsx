"use client"

import { ReactNode, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"

export function DashboardShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen bg-background text-brand-foreground" suppressHydrationWarning>
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      
      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <header className="px-8 py-5 border-b border-white/10 bg-panel/30 backdrop-blur-sm flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
             <h1 className="text-2xl font-black text-white tracking-tighter uppercase">{title}</h1>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Optional: Add user profile or notifications here */}
          </div>
        </header>
        
        <div className="flex-1 p-8 overflow-y-auto" suppressHydrationWarning>
           <div className="max-w-[1600px] mx-auto w-full">
              {children}
           </div>
        </div>
      </main>
    </div>
  )
}
