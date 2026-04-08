'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const GlobalChatWidget = dynamic(() => import('@/components/GlobalChatWidget'), { ssr: false })

export default function LandingChatMount() {
  const [showChatWidget, setShowChatWidget] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setShowChatWidget(true), 1200)
    return () => window.clearTimeout(id)
  }, [])

  return showChatWidget ? <GlobalChatWidget /> : null
}
