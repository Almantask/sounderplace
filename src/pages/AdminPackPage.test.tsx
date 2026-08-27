import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminPackPage } from './AdminPackPage'

const adminPack = vi.fn()
const updateAdminPack = vi.fn()
const createAdminTrack = vi.fn()
const deleteAdminTrack = vi.fn()
const deleteAdminPack = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    adminPack: (...args: unknown[]) => adminPack(...args),
    updateAdminPack: (...args: unknown[]) => updateAdminPack(...args),
    createAdminTrack: (...args: unknown[]) => createAdminTrack(...args),
    deleteAdminTrack: (...args: unknown[]) => deleteAdminTrack(...args),
    deleteAdminPack: (...args: unknown[]) => deleteAdminPack(...args),
    uploadAdminTrackAudio: vi.fn(),
    uploadAdminPackArchive: vi.fn(),
  },
}))

const detail = {
  id: 'pack_forest-ambience',
  slug: 'forest-ambience',
  title: 'Forest',
  description: 'Soft woodland beds.',
  kind: 'ambience' as const,
  category: 'forest',
  listingStatus: 'draft' as const,
  priceSnapshotCents: 0,
  priceUpdatePassCents: 0,
  featuredEligible: true,
  trackCount: 1,
  currentVersion: 'v1',
  updatedAt: 0,
  changelog: 'Initial release',
  reviewNotes: null,
  tracks: [
    {
      id: 'track_1',
      name: 'Forest 01',
      durationSeconds: 90,
      sortOrder: 0,
      moods: ['calm'],
      instruments: ['strings'],
      hasFullAudio: false,
      hasPreviewAudio: false,
      previewUrl: null,
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/packs/forest-ambience']}>
      <Routes>
        <Route path="/admin/packs/:slug" element={<AdminPackPage />} />
        <Route path="/admin" element={<p>Catalog admin</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminPackPage', () => {
  beforeEach(() => {
    adminPack.mockReset()
    updateAdminPack.mockReset()
    createAdminTrack.mockReset()
    deleteAdminTrack.mockReset()
    deleteAdminPack.mockReset()
    adminPack.mockResolvedValue({ pack: detail })
    updateAdminPack.mockResolvedValue({ pack: { ...detail, title: 'Deep Forest', listingStatus: 'live' } })
    createAdminTrack.mockResolvedValue({
      pack: {
        ...detail,
        tracks: [...detail.tracks, { ...detail.tracks[0], id: 'track_2', name: 'Forest 02', sortOrder: 1 }],
      },
    })
    deleteAdminTrack.mockResolvedValue({ pack: { ...detail, tracks: [] } })
  })

  it('loads pack metadata and existing tracks', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: /edit forest/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Forest')).toBeInTheDocument()
    expect(screen.getByText('Forest 01')).toBeInTheDocument()
    expect(screen.getByText(/calm/i)).toBeInTheDocument()
  })

  it('saves pack metadata including listing status', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: /edit forest/i })

    const title = screen.getByLabelText(/^title$/i)
    await user.clear(title)
    await user.type(title, 'Deep Forest')
    await user.selectOptions(screen.getByLabelText(/listing status/i), 'live')
    await user.click(screen.getByRole('button', { name: /save pack/i }))

    expect(updateAdminPack).toHaveBeenCalledWith(
      'forest-ambience',
      expect.objectContaining({
        title: 'Deep Forest',
        listingStatus: 'live',
      }),
    )
  })

  it('adds a track to the current version', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: /edit forest/i })

    await user.type(screen.getByLabelText(/^track name$/i), 'Forest 02')
    await user.type(screen.getByLabelText(/^duration \(seconds\)$/i), '90')
    await user.type(screen.getByLabelText(/^moods$/i), 'calm')
    await user.click(screen.getByRole('button', { name: /add track/i }))

    expect(createAdminTrack).toHaveBeenCalledWith(
      'forest-ambience',
      expect.objectContaining({
        name: 'Forest 02',
        durationSeconds: 90,
        moods: 'calm',
      }),
    )
    expect(await screen.findByText('Forest 02')).toBeInTheDocument()
  })

  it('removes a track after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: /edit forest/i })

    await user.click(screen.getByRole('button', { name: /remove forest 01/i }))

    expect(deleteAdminTrack).toHaveBeenCalledWith('forest-ambience', 'track_1')
  })
})
