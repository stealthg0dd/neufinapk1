'use client'

import Image from 'next/image'
import { useState } from 'react'

type Base = {
  src: string
  alt: string
  className?: string
  label: string
  /** Defaults to cover; use contain for large background watermarks. */
  objectFit?: 'cover' | 'contain'
}

type GraphicPlaceholderProps =
  | (Base & { width: number; height: number })
  | (Base & { fill: true; sizes: string })

export function GraphicPlaceholder(props: GraphicPlaceholderProps) {
  const [error, setError] = useState(false)
  const { src, alt, className = '', label, objectFit = 'cover' } = props

  if (error) {
    if ('fill' in props && props.fill) {
      return (
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-2xl border border-[#1EB8CC]/30 bg-[#E0F7FA] ${className}`}
        >
          <p className="px-4 text-center text-xs font-medium text-[#1EB8CC]">{label}</p>
        </div>
      )
    }
    const { width, height } = props as Base & { width: number; height: number }
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-[#1EB8CC]/30 bg-[#E0F7FA] ${className}`}
        style={{ width, height }}
      >
        <p className="px-4 text-center text-xs font-medium text-[#1EB8CC]">{label}</p>
      </div>
    )
  }

  if ('fill' in props && props.fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={props.sizes}
        className={className}
        unoptimized
        onError={() => setError(true)}
        style={{ objectFit }}
      />
    )
  }

  const { width, height } = props as Base & { width: number; height: number }
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      unoptimized
      onError={() => setError(true)}
      style={{ objectFit }}
    />
  )
}
