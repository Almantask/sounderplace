import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border border-line bg-leather px-3 text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-gold',
        className,
      )}
      {...props}
    />
  )
}
