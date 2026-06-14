import type { ReactNode } from "react"
import { Sidebar } from "@/components/sidebar"

export function DashboardShell({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-background text-brand-foreground">
      <Sidebar />
      <main className="flex-1 px-8 py-6">
        <header className="border-b border-white/30 pb-5">
          <h1 className="text-3xl font-bold text-brand-foreground">{title}</h1>
        </header>
        <div className="pt-6">{children}</div>
      </main>
    </div>
  )
}
