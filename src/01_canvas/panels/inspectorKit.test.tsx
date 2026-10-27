import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NumberField } from './inspectorKit'

function Field({ onChange, min, max }: { onChange?: (n: number) => void; min?: number; max?: number }) {
  const [value, setValue] = useState(10)
  return (
    <NumberField
      label="W"
      value={value}
      min={min}
      max={max}
      onChange={(n) => {
        setValue(n)
        onChange?.(n)
      }}
    />
  )
}

// jsdom has no PointerEvent, so fireEvent.pointerDown would deliver no
// button/clientX — same stand-in as CanvasView.test.tsx's.
class JsdomPointerEvent extends MouseEvent {
  pointerId: number
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
  }
}
beforeAll(() => {
  if (!('PointerEvent' in globalThis)) {
    ;(globalThis as unknown as { PointerEvent: unknown }).PointerEvent = JsdomPointerEvent
  }
})

const input = () => screen.getByRole('spinbutton') as HTMLInputElement

// jsdom has no movementX, so every drag here is a single move from the press
// — the first move after the threshold, which is measured from clientX.
function drag(el: Element, fromX: number, toX: number, init: PointerEventInit = {}) {
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: fromX, clientY: 10 })
  fireEvent.pointerMove(window, { pointerId: 1, clientX: toX, clientY: 10, ...init })
  fireEvent.pointerUp(window, { pointerId: 1, clientX: toX, clientY: 10 })
}

describe('NumberField scrubbing', () => {
  it('drags right to raise and left to lower', () => {
    render(<Field />)
    drag(input(), 100, 125)
    expect(input().value).toBe('35')
    drag(input(), 100, 80)
    expect(input().value).toBe('15')
  })

  it('scrubs from its label too, and moves ten per pixel with Shift', () => {
    render(<Field />)
    drag(screen.getByText('W'), 50, 54, { shiftKey: true })
    expect(input().value).toBe('50')
  })

  it('stays inside min/max', () => {
    render(<Field min={0} max={20} />)
    drag(input(), 100, 400)
    expect(input().value).toBe('20')
    drag(input(), 400, 0)
    expect(input().value).toBe('0')
  })

  it('treats a press that never moves as a click that focuses the field', () => {
    const onChange = vi.fn()
    render(<Field onChange={onChange} />)
    drag(input(), 100, 101)
    expect(onChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input())
  })

  it('puts the value back on Escape', () => {
    render(<Field />)
    fireEvent.pointerDown(input(), { button: 0, pointerId: 1, clientX: 100, clientY: 10 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 140, clientY: 10 })
    expect(input().value).toBe('50')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(input().value).toBe('10')
  })
})
