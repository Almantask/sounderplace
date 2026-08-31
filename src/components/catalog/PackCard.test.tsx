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
  downloadCount: 1204,
  previewTrack: {
    id: 'track_tavern-ambience_01',
    name: 'Hearth and Fiddle',
    durationSeconds: 96,
    previewUrl: '/api/previews/track_tavern-ambience_01',
  },
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
    expect(screen.getByLabelText(/preview hearth and fiddle/i)).toBeInTheDocument()
  })

  it('says so instead of offering a play button when no preview audio is ingested', () => {
    render(
      <MemoryRouter>
        <PackCard pack={{ ...pack, previewTrack: null }} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/no preview track has been ingested/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument()
  })

  it('renders the download count, and says so when a pack has none', () => {
    const { rerender } = render(
      <MemoryRouter>
        <PackCard pack={pack} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/1,204 downloads/i)).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <PackCard pack={{ ...pack, downloadCount: 0 }} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/no downloads yet/i)).toBeInTheDocument()
  })
})
