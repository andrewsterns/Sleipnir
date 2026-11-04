// The picker is the side panel's one search: its own items, then what
// `search` finds inside them.

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TabPicker } from './TabPicker'

const setup = (onPickNode = vi.fn(), onPick = vi.fn()) => {
  render(
    <TabPicker
      noun="Plans and nodes"
      icon="network"
      items={[
        { id: 'plan-a', label: 'Checkout flow', section: 'Plans' },
        { id: 'plan-b', label: 'Search page', section: 'Plans' },
      ]}
      openIds={[]}
      activeId={null}
      onPick={onPick}
      search={(q) => (q === 'check' ? [{ id: 'node-1', label: 'CheckoutView', section: 'Nodes', onPick: onPickNode }] : [])}
    />,
  )
  const field = screen.getByRole('combobox')
  fireEvent.focus(field)
  return field
}

describe('TabPicker search', () => {
  it('lists what a query finds after the matching items, under its own heading', () => {
    const field = setup()
    fireEvent.change(field, { target: { value: 'check' } })
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Checkout flow', 'CheckoutView'])
    expect(screen.getByText('Nodes')).toBeTruthy()
    expect(screen.queryByText('Plans')).toBeNull()
  })

  it("runs a found item's own onPick instead of opening it as a tab", () => {
    const onPickNode = vi.fn()
    const onPick = vi.fn()
    const field = setup(onPickNode, onPick)
    fireEvent.change(field, { target: { value: 'check' } })
    const found = screen.getAllByRole('option').find((o) => o.textContent === 'CheckoutView')!
    fireEvent.click(found.firstElementChild!)
    expect(onPickNode).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('asks nothing until something is typed', () => {
    const search = vi.fn(() => [])
    render(<TabPicker noun="Boards" icon="canvas" items={[]} openIds={[]} activeId={null} onPick={() => {}} search={search} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(search).not.toHaveBeenCalled()
  })
})
