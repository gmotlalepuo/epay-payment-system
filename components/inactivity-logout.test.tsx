import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_INACTIVITY_TIMEOUT_MS,
  DEFAULT_WARNING_DURATION_MS,
  InactivityLogout,
} from '@/components/inactivity-logout'

describe('InactivityLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('warns after inactivity and logs out when the grace period expires', () => {
    const onLogout = vi.fn()
    render(<InactivityLogout sessionKey="user-1" onLogout={onLogout} />)

    act(() => vi.advanceTimersByTime(DEFAULT_INACTIVITY_TIMEOUT_MS))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('Are you still active?')).toBeTruthy()

    act(() => vi.advanceTimersByTime(DEFAULT_WARNING_DURATION_MS - 1))
    expect(onLogout).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('resets the inactivity period when the user interacts before the warning', () => {
    render(
      <InactivityLogout
        sessionKey="user-2"
        onLogout={vi.fn()}
        inactivityTimeoutMs={1_000}
        warningDurationMs={60_000}
      />,
    )

    act(() => vi.advanceTimersByTime(900))
    fireEvent.keyDown(document, { key: 'Tab' })
    act(() => vi.advanceTimersByTime(999))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('requires explicit confirmation after warning and starts a fresh inactivity period', () => {
    render(
      <InactivityLogout
        sessionKey="user-3"
        onLogout={vi.fn()}
        inactivityTimeoutMs={1_000}
        warningDurationMs={60_000}
      />,
    )

    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('alertdialog')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })
})
