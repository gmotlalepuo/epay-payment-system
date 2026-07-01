'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock3, ShieldAlert } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

// High-value payment sessions warn after four idle minutes and end after five.
export const DEFAULT_INACTIVITY_TIMEOUT_MS = 4 * 60 * 1000
export const DEFAULT_WARNING_DURATION_MS = 60 * 1000

const ACTIVITY_STORAGE_PREFIX = 'botspay:last-activity-at'
const LOGOUT_STORAGE_PREFIX = 'botspay:inactivity-logout-at'
const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  'keydown',
  'mousedown',
  'pointerdown',
  'scroll',
  'touchstart',
]

type InactivityLogoutProps = {
  onLogout: () => void | Promise<void>
  sessionKey: string
  inactivityTimeoutMs?: number
  warningDurationMs?: number
}

function readStoredTimestamp(key: string) {
  try {
    const value = Number(window.localStorage.getItem(key))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function storeTimestamp(key: string, timestamp: number) {
  try {
    window.localStorage.setItem(key, String(timestamp))
  } catch {
    // The local timer still protects the session when browser storage is unavailable.
  }
}

export function InactivityLogout({
  onLogout,
  sessionKey,
  inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS,
  warningDurationMs = DEFAULT_WARNING_DURATION_MS,
}: InactivityLogoutProps) {
  const activityStorageKey = `${ACTIVITY_STORAGE_PREFIX}:${sessionKey}`
  const logoutStorageKey = `${LOGOUT_STORAGE_PREFIX}:${sessionKey}`
  const [warningDeadline, setWarningDeadline] = useState<number | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(
    Math.ceil(warningDurationMs / 1000),
  )
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const lastActivityAt = useRef(0)
  const warningDeadlineRef = useRef<number | null>(null)
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutStartedRef = useRef(false)
  const onLogoutRef = useRef(onLogout)

  useEffect(() => {
    onLogoutRef.current = onLogout
  }, [onLogout])

  const clearWarningTimer = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
    warningTimerRef.current = null
  }, [])

  const openWarning = useCallback(
    (activityAt: number) => {
      clearWarningTimer()
      const deadline = activityAt + inactivityTimeoutMs + warningDurationMs
      warningDeadlineRef.current = deadline
      setWarningDeadline(deadline)
      setSecondsRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
    },
    [clearWarningTimer, inactivityTimeoutMs, warningDurationMs],
  )

  const scheduleWarning = useCallback(
    (activityAt: number) => {
      clearWarningTimer()
      const delay = activityAt + inactivityTimeoutMs - Date.now()

      if (delay <= 0) {
        openWarning(activityAt)
        return
      }

      warningTimerRef.current = setTimeout(() => openWarning(activityAt), delay)
    },
    [clearWarningTimer, inactivityTimeoutMs, openWarning],
  )

  const performLogout = useCallback(async (broadcast = true) => {
    if (logoutStartedRef.current) return
    logoutStartedRef.current = true
    setIsLoggingOut(true)
    clearWarningTimer()

    if (broadcast) {
      storeTimestamp(logoutStorageKey, Date.now())
    }

    try {
      await onLogoutRef.current()
    } catch (error) {
      logoutStartedRef.current = false
      setIsLoggingOut(false)
      console.error('Unable to sign out after inactivity:', error)
    }
  }, [clearWarningTimer, logoutStorageKey])

  const confirmActivity = useCallback(() => {
    if (isLoggingOut) return
    const now = Date.now()
    lastActivityAt.current = now
    warningDeadlineRef.current = null
    setWarningDeadline(null)
    storeTimestamp(activityStorageKey, now)
    scheduleWarning(now)
  }, [activityStorageKey, isLoggingOut, scheduleWarning])

  useEffect(() => {
    const now = Date.now()
    const storedActivity = readStoredTimestamp(activityStorageKey)
    const initialActivity = storedActivity && storedActivity <= now ? storedActivity : now
    lastActivityAt.current = initialActivity

    // Do not carry inactivity across a completely new authenticated browser session.
    if (initialActivity + inactivityTimeoutMs + warningDurationMs <= now) {
      lastActivityAt.current = now
      storeTimestamp(activityStorageKey, now)
      scheduleWarning(now)
    } else {
      scheduleWarning(initialActivity)
    }

    const recordActivity = () => {
      // Once the warning is shown, only the explicit confirmation counts as activity.
      if (warningDeadlineRef.current || logoutStartedRef.current) return
      const activityAt = Date.now()
      if (activityAt - lastActivityAt.current < 500) return
      lastActivityAt.current = activityAt
      storeTimestamp(activityStorageKey, activityAt)
      scheduleWarning(activityAt)
    }

    const checkElapsedTime = () => {
      if (document.visibilityState !== 'visible' || logoutStartedRef.current) return
      const activityAt = lastActivityAt.current
      const logoutAt = activityAt + inactivityTimeoutMs + warningDurationMs

      if (Date.now() >= logoutAt) {
        void performLogout()
      } else if (Date.now() >= activityAt + inactivityTimeoutMs) {
        openWarning(activityAt)
      } else {
        scheduleWarning(activityAt)
      }
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === logoutStorageKey && event.newValue) {
        void performLogout(false)
        return
      }

      if (event.key !== activityStorageKey || !event.newValue) return
      const activityAt = Number(event.newValue)
      if (!Number.isFinite(activityAt) || activityAt <= lastActivityAt.current) return

      lastActivityAt.current = activityAt
      warningDeadlineRef.current = null
      setWarningDeadline(null)
      scheduleWarning(activityAt)
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      document.addEventListener(eventName, recordActivity, { passive: true })
    })
    document.addEventListener('visibilitychange', checkElapsedTime)
    window.addEventListener('storage', handleStorage)

    return () => {
      clearWarningTimer()
      ACTIVITY_EVENTS.forEach((eventName) => {
        document.removeEventListener(eventName, recordActivity)
      })
      document.removeEventListener('visibilitychange', checkElapsedTime)
      window.removeEventListener('storage', handleStorage)
    }
  }, [
    clearWarningTimer,
    activityStorageKey,
    inactivityTimeoutMs,
    logoutStorageKey,
    openWarning,
    performLogout,
    scheduleWarning,
    warningDurationMs,
  ])

  useEffect(() => {
    if (!warningDeadline) return

    const updateCountdown = () => {
      const remaining = warningDeadline - Date.now()
      setSecondsRemaining(Math.max(0, Math.ceil(remaining / 1000)))
      if (remaining <= 0) void performLogout()
    }

    updateCountdown()
    const countdownInterval = window.setInterval(updateCountdown, 250)
    const logoutTimer = window.setTimeout(
      () => void performLogout(),
      Math.max(0, warningDeadline - Date.now()),
    )

    return () => {
      window.clearInterval(countdownInterval)
      window.clearTimeout(logoutTimer)
    }
  }, [performLogout, warningDeadline])

  return (
    <AlertDialog open={warningDeadline !== null}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => event.preventDefault()}
        className="sm:max-w-md"
      >
        <AlertDialogHeader>
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 sm:mx-0">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </div>
          <AlertDialogTitle>Are you still active?</AlertDialogTitle>
          <AlertDialogDescription className="leading-6">
            For your security, you will be signed out after one minute unless you confirm
            that you are still using BotsPay Wallet.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div
          className="flex items-center justify-center gap-2 rounded-xl border bg-muted/50 px-4 py-3 font-medium tabular-nums sm:justify-start"
          role="timer"
          aria-live="polite"
          aria-label={`${secondsRemaining} seconds until automatic sign out`}
        >
          <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
          Signing out in {secondsRemaining} second{secondsRemaining === 1 ? '' : 's'}
        </div>

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => void performLogout()}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out now'}
          </Button>
          <AlertDialogAction onClick={confirmActivity} disabled={isLoggingOut}>
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
