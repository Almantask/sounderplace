import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EcosystemPage } from './EcosystemPage'

describe('EcosystemPage', () => {
  it('links to Thunder FX, Sunder, and Arcanum Audio', async () => {
    render(<EcosystemPage />)
    expect(await screen.findByRole('heading', { name: 'Thunder FX' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sunder' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Arcanum Audio' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Donate' })).toBeInTheDocument()
  })
})
