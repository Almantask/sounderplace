import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { AppShell } from './AppShell'

vi.mock('@/lib/api', () => ({
  api: {
    session: vi.fn(),
    signOut: vi.fn(),
  },
}))

describe('AppShell', () => {
  beforeEach(() => {
    vi.mocked(api.session).mockResolvedValue({
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada', isAdmin: true },
    })
    vi.mocked(api.signOut).mockResolvedValue({ ok: true })
  })

  it('shows the catalog admin link for operator accounts', async () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: /^admin$/i })).toHaveAttribute('href', '/admin')
  })

  it('revokes every session when Sign out everywhere is used', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /sign out everywhere/i }))
    expect(api.signOut).toHaveBeenCalledWith({ all: true })
  })
})
