import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackPage } from './FeedbackPage'

const sendFeedback = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    sendFeedback: (...args: unknown[]) => sendFeedback(...args),
  },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <FeedbackPage />
    </MemoryRouter>,
  )
}

describe('FeedbackPage', () => {
  beforeEach(() => {
    sendFeedback.mockReset()
    sendFeedback.mockResolvedValue({ ok: true })
  })

  it('renders the feedback form', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /send feedback/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeInTheDocument()
  })

  it('submits trimmed form values to the API and shows a success message', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/name/i), 'Ada')
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com')
    await user.selectOptions(screen.getByLabelText(/category/i), 'idea')
    await user.type(screen.getByLabelText(/message/i), 'Please add more tavern beds.')
    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(sendFeedback).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      category: 'idea',
      message: 'Please add more tavern beds.',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/thanks for the feedback/i)
  })

  it('shows an error when the API rejects the submission', async () => {
    sendFeedback.mockRejectedValue(new Error('Could not save feedback'))
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/message/i), 'The catalog filters are hard to use.')
    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save feedback/i)
  })
})
