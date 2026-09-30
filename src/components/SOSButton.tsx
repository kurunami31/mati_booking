import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, cn } from './UI'

interface SOSButtonProps {
  onActivate: () => Promise<void> | void
  disabled?: boolean
  /** Seconds the user must hold before the alert fires. */
  holdSeconds?: number
  label?: string
}

/**
 * Hold-to-send SOS.
 * A single tap does nothing; the button must be held so it is not triggered by
 * a pocket press. Keyboard users can hold Enter or Space.
 */
export function SOSButton({
  onActivate,
  disabled,
  holdSeconds = 3,
  label = 'Hold to send SOS',
}: SOSButtonProps) {
  const [progress, setProgress] = useState(0)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    setProgress(0)
  }, [])

  const fire = useCallback(async () => {
    stop()
    if (disabled || sending) return
    setSending(true)
    setError(null)
    try {
      await onActivate()
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the alert.')
    } finally {
      setSending(false)
    }
  }, [disabled, onActivate, sending, stop])

  const start = useCallback(() => {
    if (disabled || sending || sent) return
    if (timerRef.current != null) return
    const startedAt = Date.now()
    timerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      const next = Math.min(1, elapsed / holdSeconds)
      setProgress(next)
      if (next >= 1) void fire()
    }, 60)
  }, [disabled, fire, holdSeconds, sending, sent])

  useEffect(() => stop, [stop])

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || sending}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault()
            start()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            stop()
          }
        }}
        aria-describedby="sos-help"
        className={cn(
          'relative w-full overflow-hidden rounded-2xl border-2 border-sos-600 bg-sos-500 px-4 py-5',
          'text-center text-lg font-extrabold text-white select-none',
          'disabled:opacity-70',
        )}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-sos-600 transition-[width] duration-75"
          style={{ width: `${progress * 100}%` }}
        />
        <span className="relative">
          {sent ? 'SOS sent — help is being alerted' : sending ? 'Sending SOS…' : label}
        </span>
      </button>
      <p id="sos-help" className="text-xs text-slate-500">
        {sent
          ? 'Keep your phone on. The city control point has your trip and last known location.'
          : `Hold for ${holdSeconds} seconds. This alerts the city responder and logs your trip and location.`}
      </p>
      {error && (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      )}
      {!sent && (
        <Button
          variant="secondary"
          block
          size="lg"
          disabled={disabled || sending}
          onClick={() => void fire()}
          className="hidden"
        >
          Confirm SOS
        </Button>
      )}
    </div>
  )
}
