import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('inline-flex rounded-full border border-line px-2 py-0.5 text-xs uppercase tracking-wide text-gold', className)}
      {...props}
    />
  )
}
