'use client'

import { usePathname } from 'next/navigation'

/** Soft enter on in-dashboard navigation to avoid abrupt content swaps. */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div
      key={pathname}
      className="animate-dashboard-page motion-reduce:animate-none min-h-0"
    >
      {children}
    </div>
  )
}
