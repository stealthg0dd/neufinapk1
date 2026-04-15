'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import clsx from 'clsx'

/** Solid surface card (no glass blur). Hover: lift + shadow. */
const surfaceCard =
  'rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow transition-transform duration-200 hover:shadow-md hover:-translate-y-0.5'

type GlassCardProps = HTMLMotionProps<'div'>

export function GlassCard({ className, children, ...props }: GlassCardProps) {
  return (
    <motion.div className={clsx(surfaceCard, className)} {...props}>
      {children}
    </motion.div>
  )
}
