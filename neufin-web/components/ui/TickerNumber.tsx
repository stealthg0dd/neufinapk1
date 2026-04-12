'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import clsx from 'clsx'

type Format = 'currency' | 'percent' | 'number'

function formatValue(value: number, fmt: Format, currency = 'USD') {
  if (fmt === 'percent') {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}%`
  }
  if (fmt === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

export function TickerNumber({
  value,
  change,
  format = 'number',
  currency = 'USD',
  className,
  showArrow = true,
  highlightSign = false,
}: {
  value: number
  change?: number | null
  format?: Format
  currency?: string
  className?: string
  showArrow?: boolean
  /** Color the main value green/red when format is percent */
  highlightSign?: boolean
}) {
  const prev = useRef(value)
  const flash = prev.current !== value
  useEffect(() => {
    prev.current = value
  }, [value])

  const delta = change ?? null
  const positive = delta != null ? delta >= 0 : null

  return (
    <span className={clsx('inline-flex items-center gap-1 font-mono tabular-nums', className)}>
      <motion.span
        key={String(value)}
        initial={flash ? { opacity: 0.4 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className={
          highlightSign && format === 'percent'
            ? value >= 0
              ? 'text-[#16A34A]'
              : 'text-[#DC2626]'
            : 'text-[var(--text-primary)]'
        }
      >
        {format === 'percent' && value >= 0 && change === undefined ? '+' : ''}
        {formatValue(value, format, currency)}
      </motion.span>
      {delta != null && delta !== 0 && (
        <AnimatePresence mode="wait">
          <motion.span
            key={delta}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className={clsx(
              'inline-flex items-center gap-0.5 text-sm',
              positive ? 'text-[#16A34A]' : 'text-[#DC2626]',
            )}
          >
            {showArrow &&
              (positive ? (
                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 shrink-0" aria-hidden />
              ))}
            {`${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`}
          </motion.span>
        </AnimatePresence>
      )}
    </span>
  )
}
