import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { FAQPage } from './FAQPage'

describe('FAQPage', () => {
  it('renders the FAQ header and key questions', () => {
    render(
      <MemoryRouter>
        <FAQPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /frequently asked questions/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /what is sunderplace and what is its intended use\?/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: /how does sunderplace work with arcanum audio and its 3 intensity levels\?/i,
      }),
    ).toBeInTheDocument()
  })

  it('documents Arcanum Audio and the 3 intensity levels', () => {
    render(
      <MemoryRouter>
        <FAQPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /1\. low intensity/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /2\. medium intensity/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /3\. high intensity/i })).toBeInTheDocument()

    expect(screen.getByText(/calm \/ exploration \/ rest/i)).toBeInTheDocument()
    expect(screen.getByText(/suspense \/ tension \/ danger/i)).toBeInTheDocument()
    expect(screen.getByText(/combat \/ action \/ climax/i)).toBeInTheDocument()
  })

  it('explains the 1-track full preview policy', () => {
    render(
      <MemoryRouter>
        <FAQPage />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: /how do track previews work in the marketplace\?/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/1 designated track \(always track 01\)/i)).toBeInTheDocument()
    expect(screen.getByText(/preview means playing the track in its entirety/i)).toBeInTheDocument()
  })
})
