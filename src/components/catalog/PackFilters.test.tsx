import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PackFilters } from './PackFilters'

describe('PackFilters', () => {
  it('notifies when the kind filter changes', async () => {
    const onChange = vi.fn()
    render(
      <PackFilters
        value={{ kind: 'all', category: '', mood: '', instrument: '', query: '' }}
        categories={['tavern']}
        moods={['lively']}
        instruments={['lute']}
        onChange={onChange}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText(/kind/i), 'ambience')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ambience' }))
  })
})
