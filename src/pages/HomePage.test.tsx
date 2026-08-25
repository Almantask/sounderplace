import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

vi.mock('@/lib/api', () => ({
  api: {
    featured: () => Promise.resolve({ packs: [] }),
  },
}))

describe('HomePage', () => {
  it('renders the marketplace heading and catalog call to action', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Sunderplace' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse the catalog/i })).toBeInTheDocument()
    expect(await screen.findByText(/no featured activity yet/i)).toBeInTheDocument()
  })
})
