import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-32 w-full rounded-md border border-line bg-leather px-3 py-2 text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-gold',
        className,
      )}
      {...props}
    />
  )
}
