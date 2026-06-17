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
    <div className="mt-4 overflow-hidden rounded-[2rem] bg-card text-card-foreground border border-border shadow-2xl flex flex-col flex-1 min-h-0" suppressHydrationWarning>
      <div className="overflow-auto flex-1 custom-scrollbar" suppressHydrationWarning>
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20 shadow-sm">
            <tr className="bg-panel/90 backdrop-blur-md text-center text-white border-b border-white/10">
              {headers.map((header, index) => (
                <th 
                  key={index} 
                  className="px-6 py-5 font-black uppercase tracking-[0.15em] text-[12px] text-center"
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
    <tr className={cn("border-b border-border/40 hover:bg-sky-400/[0.03] transition-all group", className)}>
      {children}
    </tr>
  )
}

export function DataTableCell({ children, className, align = "center" }: { children: ReactNode, className?: string, align?: "left" | "center" | "right" }) {
  return (
    <td className={cn(
      "px-6 py-4 align-middle",
      align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left",
      className
    )}>
      {children}
    </td>
  )
}
