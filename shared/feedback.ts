export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'question', 'other'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export const FEEDBACK_MESSAGE_MIN = 10
export const FEEDBACK_MESSAGE_MAX = 4000

export interface FeedbackInput {
  name?: string
  email?: string
  category?: string
  message?: string
}

export interface ParsedFeedback {
  name: string | null
  email: string | null
  category: FeedbackCategory
  message: string
}

export type ParseFeedbackResult = { ok: true; value: ParsedFeedback } | { ok: false; error: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value)
}

export function parseFeedback(input: FeedbackInput): ParseFeedbackResult {
  const name = input.name?.trim() || null
  const email = input.email?.trim() || null
  const message = input.message?.trim() ?? ''
  const category = input.category?.trim() || 'other'

  if (name && name.length > 120) return { ok: false, error: 'Name is too long' }
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) {
    return { ok: false, error: 'Enter a valid email or leave it blank' }
  }
  if (!isCategory(category)) return { ok: false, error: 'Choose a valid feedback category' }
  if (message.length < FEEDBACK_MESSAGE_MIN) {
    return { ok: false, error: 'Message must be at least 10 characters' }
  }
  if (message.length > FEEDBACK_MESSAGE_MAX) return { ok: false, error: 'Message is too long' }

  return { ok: true, value: { name, email, category, message } }
}
