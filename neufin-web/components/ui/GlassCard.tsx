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
        'backdrop-blur-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-2xl',
        'transition-all duration-300',
        'hover:border-[var(--border-accent)] hover:shadow-[0_0_48px_-12px_rgba(245,162,35,0.35)]',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
