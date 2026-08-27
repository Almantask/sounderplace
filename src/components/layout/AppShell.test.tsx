import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('@/lib/api', () => ({
  api: {
    session: () =>
      Promise.resolve({
        user: { id: 'u1', email: 'ada@example.com', name: 'Ada', isAdmin: true },
      }),
    signOut: vi.fn(),
  },
}))

describe('AppShell', () => {
  it('shows the catalog admin link for operator accounts', async () => {
    render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: /^admin$/i })).toHaveAttribute('href', '/admin')
  })
})
