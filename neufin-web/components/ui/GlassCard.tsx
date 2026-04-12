'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import clsx from 'clsx'

type GlassCardProps = HTMLMotionProps<'div'>

export function GlassCard({ className, children, ...props }: GlassCardProps) {
  return (
    <motion.div
      whileHover={{
        transition: { duration: 0.25 },
      }}
      className={clsx(
        'rounded-2xl border border-[var(--border)] bg-white/95 shadow-sm backdrop-blur-md',
        'transition-all duration-300',
        'hover:border-primary hover:shadow-md',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
