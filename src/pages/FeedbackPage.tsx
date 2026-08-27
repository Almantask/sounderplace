import { useState, type FormEvent, type ReactNode } from 'react'
import { FEEDBACK_CATEGORIES, FEEDBACK_MESSAGE_MAX, FEEDBACK_MESSAGE_MIN } from '@shared/feedback'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const CATEGORY_LABELS: Record<(typeof FEEDBACK_CATEGORIES)[number], string> = {
  bug: 'Bug',
  idea: 'Idea',
  question: 'Question',
  other: 'Other',
}

export function FeedbackPage() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setError(null)
    setStatus('submitting')
    try {
      await api.sendFeedback({
        name: String(data.get('name') ?? ''),
        email: String(data.get('email') ?? ''),
        category: String(data.get('category') ?? 'other'),
        message: String(data.get('message') ?? ''),
      })
      setStatus('success')
      form.reset()
    } catch (err) {
      setStatus('idle')
      setError(err instanceof Error ? err.message : 'Could not save feedback')
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Help the table</p>
        <h1 className="font-display text-4xl md:text-5xl">Send feedback</h1>
        <p className="max-w-3xl text-muted">
          Report a bug, suggest a pack idea, or ask a question. Sign-in is optional — leave a name or email if you
          want a reply.
        </p>
      </header>

      <Card className="max-w-2xl space-y-5 p-6">
        {status === 'success' ? (
          <p role="status" className="text-sm text-gold-bright">
            Thanks for the feedback. It is saved and we will read it.
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Name (optional)" htmlFor="feedback-name">
            <Input id="feedback-name" name="name" autoComplete="name" maxLength={120} />
          </Field>
          <Field label="Email (optional)" htmlFor="feedback-email">
            <Input id="feedback-email" name="email" type="email" autoComplete="email" maxLength={254} />
          </Field>
          <Field label="Category" htmlFor="feedback-category">
            <select
              id="feedback-category"
              name="category"
              defaultValue="other"
              className="h-10 w-full rounded-md border border-line bg-leather px-3 text-ink focus-visible:outline-2 focus-visible:outline-gold"
            >
              {FEEDBACK_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Message" htmlFor="feedback-message">
            <Textarea
              id="feedback-message"
              name="message"
              required
              minLength={FEEDBACK_MESSAGE_MIN}
              maxLength={FEEDBACK_MESSAGE_MAX}
              placeholder="What should we know?"
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Sending…' : 'Send feedback'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm text-ink">
        {label}
      </label>
      {children}
    </div>
  )
}
