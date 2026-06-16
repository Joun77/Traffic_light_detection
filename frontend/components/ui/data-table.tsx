"use client"

import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface DataTableProps {
  headers: string[]
  children: ReactNode
  loading?: boolean
  emptyMessage?: string
  columnCount: number
}

export function DataTable({ headers, children, loading, emptyMessage = "ບໍ່ມີຂໍ້ມູນໃນລະບົບ", columnCount }: DataTableProps) {
  return (
    <div className="mt-6 overflow-hidden rounded-[2.5rem] bg-card text-card-foreground border border-border shadow-2xl" suppressHydrationWarning>
      <div className="overflow-x-auto" suppressHydrationWarning>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-panel/80 text-left text-white border-b border-white/10">
              {headers.map((header, index) => (
                <th 
                  key={index} 
                  className={cn(
                    "px-6 py-6 font-black uppercase tracking-[0.15em] text-[13px]",
                    header === "ຈັດການ" || header === "Actions" ? "text-center" : ""
                  )}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="px-6 py-24 text-center text-muted-foreground italic">
                  <div className="flex flex-col items-center gap-4 opacity-50">
                    <div className="size-8 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
                    <span className="font-bold text-lg">ກຳລັງໂຫຼດຂໍ້ມູນ...</span>
                  </div>
                </td>
              </tr>
            ) : children === null || (Array.isArray(children) && children.length === 0) ? (
              <tr>
                <td colSpan={columnCount} className="px-6 py-24 text-center text-muted-foreground font-black italic opacity-20 text-xl tracking-tighter">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function DataTableRow({ children, className }: { children: ReactNode, className?: string }) {
  return (
    <tr className={cn("border-b border-border/50 hover:bg-sky-400/[0.02] transition-all", className)}>
      {children}
    </tr>
  )
}

export function DataTableCell({ children, className, align = "left" }: { children: ReactNode, className?: string, align?: "left" | "center" | "right" }) {
  return (
    <td className={cn("px-6 py-5", align === "center" ? "text-center" : "", className)}>
      {children}
    </td>
  )
}
