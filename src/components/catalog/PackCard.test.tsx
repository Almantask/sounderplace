import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PackCard } from './PackCard'

const pack = {
  id: 'pack_tavern-ambience',
  slug: 'tavern-ambience',
  title: 'Tavern',
  description: 'Inn beds',
  kind: 'ambience' as const,
  category: 'tavern',
  ownerType: 'platform' as const,
  listingStatus: 'live' as const,
  priceSnapshotCents: 0,
  priceUpdatePassCents: 0,
  trackCount: 30,
  currentVersion: 'v1',
  featuredScore: 0,
}

describe('PackCard', () => {
  it('renders a free pack title, kind, track count, and 1-track preview player', () => {
    render(
      <MemoryRouter>
        <PackCard pack={pack} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Tavern' })).toBeInTheDocument()
    expect(screen.getByText(/free/i)).toBeInTheDocument()
    expect(screen.getByText(/30 tracks/i)).toBeInTheDocument()
    expect(screen.getByText(/preview track:/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/preview tavern 01/i)).toBeInTheDocument()
  })
})
