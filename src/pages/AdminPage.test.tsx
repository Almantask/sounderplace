import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminPage } from './AdminPage'

const adminPacks = vi.fn()
const createAdminPack = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    adminPacks: (...args: unknown[]) => adminPacks(...args),
    createAdminPack: (...args: unknown[]) => createAdminPack(...args),
  },
}))

const samplePack = {
  id: 'pack_tavern-ambience',
  slug: 'tavern-ambience',
  title: 'Tavern',
  description: 'Warm inn beds.',
  kind: 'ambience',
  category: 'tavern',
  listingStatus: 'live',
  priceSnapshotCents: 0,
  priceUpdatePassCents: 0,
  featuredEligible: true,
  trackCount: 30,
  currentVersion: 'v1',
  updatedAt: 0,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  )
}

describe('AdminPage', () => {
  beforeEach(() => {
    adminPacks.mockReset()
    createAdminPack.mockReset()
    adminPacks.mockResolvedValue({ packs: [samplePack] })
    createAdminPack.mockResolvedValue({ pack: { ...samplePack, slug: 'forest-ambience', title: 'Forest' } })
  })

  it('lists catalog packs with status and edit links', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /catalog admin/i })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /tavern/i })).toHaveAttribute('href', '/admin/packs/tavern-ambience')
    expect(screen.getByText(/^live$/i)).toBeInTheDocument()
    expect(screen.getByText(/30 tracks ·/i)).toBeInTheDocument()
  })

  it('shows an auth error when the operator is not signed in', async () => {
    adminPacks.mockRejectedValue(new Error('Sign in required'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in required/i)
  })

  it('creates a pack from the new-pack form', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('link', { name: /tavern/i })

    await user.type(screen.getByLabelText(/^title$/i), 'Forest')
    await user.type(screen.getByLabelText(/^description$/i), 'Soft woodland beds.')
    await user.selectOptions(screen.getByLabelText(/^kind$/i), 'ambience')
    await user.type(screen.getByLabelText(/^category$/i), 'forest')
    await user.click(screen.getByRole('button', { name: /create pack/i }))

    expect(createAdminPack).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Forest',
        description: 'Soft woodland beds.',
        kind: 'ambience',
        category: 'forest',
      }),
    )
  })
})
