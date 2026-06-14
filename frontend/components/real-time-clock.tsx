'use client'

import { useEffect, useState } from 'react'
import { formatLaoDate, formatLaoTime } from '@/lib/time'

interface RealTimeClockProps {
  type: 'date' | 'time'
}

export function RealTimeClock({ type }: RealTimeClockProps) {
  const [value, setValue] = useState<string>('')

  useEffect(() => {
    // Set initial value
    setValue(type === 'date' ? formatLaoDate() : formatLaoTime())

    const interval = setInterval(() => {
      setValue(type === 'date' ? formatLaoDate() : formatLaoTime())
    }, 1000)

    return () => clearInterval(interval)
  }, [type])

  // Prevent hydration mismatch by rendering nothing until client-side mount
  if (!value) {
    return <span className="opacity-0">--/--/----</span>
  }

  return <span>{value}</span>
}
