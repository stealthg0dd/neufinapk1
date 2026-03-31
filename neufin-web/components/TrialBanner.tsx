import React, { useEffect, useState } from 'react'
import Link from 'next/link'

interface TrialBannerProps {
  status: 'trial' | 'active' | 'expired'
  daysRemaining?: number
}

export default function TrialBanner({ status, daysRemaining }: TrialBannerProps) {
  if (status === 'active') return null
  if (status === 'expired') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 border border-red-700 text-center px-8 py-10 rounded-xl shadow-xl">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Your 14-day trial has ended</h2>
          <p className="text-gray-300 mb-6">Upgrade to Neufin Pro to keep accessing reports and Swarm analysis.</p>
          <Link href="/upgrade" className="btn-primary text-lg px-8 py-3">Upgrade Now</Link>
        </div>
      </div>
    )
  }
  if (status === 'trial' && daysRemaining !== undefined && daysRemaining <= 3) {
    return (
      <div className="w-full bg-amber-500/90 text-black text-center py-3 font-semibold text-base">
        ⏱ Your free trial ends in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}. Upgrade to keep access →{' '}
        <Link href="/upgrade" className="underline font-bold">Upgrade Now</Link>
      </div>
    )
  }
  return null
}
