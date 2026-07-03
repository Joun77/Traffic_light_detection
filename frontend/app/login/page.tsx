"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ShieldCheck, Lock, User } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("http://localhost:8000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        const data = await res.json()
        if (remember) {
          localStorage.setItem("auth_user", data.username)
        } else {
          sessionStorage.setItem("auth_user", data.username)
        }
        router.push("/")
      } else {
        setError("ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ")
      }
    } catch {
      setError("ບໍ່ສາມາດເຊື່ອມຕໍ່ server ໄດ້")
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[oklch(0.145_0_0)] flex items-center justify-center p-4">
      {/* background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 size-[600px] rounded-full bg-sky-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 size-[600px] rounded-full bg-indigo-500/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* logo / title */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-sky-500/10 border border-sky-500/20">
            <ShieldCheck className="size-8 text-sky-400" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black text-white tracking-tight uppercase">
              ລະບົບກວດຈັບລົດລ່ວງໄຟແດງ
            </h1>
            <p className="mt-1 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              ເຂົ້າສູ່ລະບົບ
            </p>
          </div>
        </div>

        {/* card */}
        <div className="rounded-2xl border border-white/10 bg-[oklch(0.205_0_0)] p-8 shadow-2xl shadow-black/40">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* username */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                ຊື່ຜູ້ໃຊ້
              </span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ກະລຸນາໃສ່ຊື່ຜູ້ໃຊ້"
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:bg-sky-500/5 transition-colors"
                />
              </div>
            </label>

            {/* password */}
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                ລະຫັດຜ່ານ
              </span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="ກະລຸນາໃສ່ລະຫັດຜ່ານ"
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-12 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-500/50 focus:bg-sky-500/5 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label="ສະແດງ/ເຊື່ອງລະຫັດຜ່ານ"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {/* remember me */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div
                className={`relative flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${remember ? "bg-sky-500 border-sky-500" : "border-white/20 bg-white/5"}`}
                onClick={() => setRemember((v) => !v)}
              >
                {remember && (
                  <svg className="size-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <input type="checkbox" className="sr-only" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span className="text-xs font-bold text-slate-400">ຈື່ຂໍ້ມູນການເຂົ້າສູ່ລະບົບ (Remember me)</span>
            </label>

            {/* error */}
            {error && (
              <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-center text-xs font-bold text-rose-400">
                {error}
              </p>
            )}

            {/* submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-xl bg-sky-500 py-3 text-sm font-black text-white uppercase tracking-widest transition-all hover:bg-sky-400 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-500/20"
            >
              {loading ? "ກຳລັງເຂົ້າລະບົບ..." : "ເຂົ້າລະບົບ"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[10px] font-bold text-slate-600 uppercase tracking-widest">
          © 2025 ລະບົບກວດຈັບລົດລ່ວງໄຟແດງ
        </p>
      </div>
    </div>
  )
}
