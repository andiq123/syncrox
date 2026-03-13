import { useState, useCallback, useRef, useEffect } from 'react'

const COMPOSING_DEBOUNCE_MS = 150

type Props = {
  onSend: (body: string) => void
  onComposingChange?: (active: boolean) => void
  disabled?: boolean
}

export function MessageInput({ onSend, onComposingChange, disabled }: Props) {
  const [value, setValue] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notifyComposing = useCallback(
    (active: boolean) => {
      onComposingChange?.(active)
    },
    [onComposingChange],
  )

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const submit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    notifyComposing(false)
    onSend(trimmed)
    setValue('')
  }, [value, onSend, disabled, notifyComposing])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value
      setValue(next)
      if (!onComposingChange) return
      const active = next.trim().length > 0
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (active) {
        debounceRef.current = setTimeout(() => notifyComposing(true), COMPOSING_DEBOUNCE_MS)
      } else {
        notifyComposing(false)
      }
    },
    [onComposingChange, notifyComposing],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    },
    [submit],
  )

  return (
    <div className="message-input">
      <label htmlFor="message-text" className="sr-only">
        Message
      </label>
      <textarea
        id="message-text"
        className="input message-textarea"
        placeholder="Type a message…"
        value={value}
        onChange={handleChange}
        onBlur={() => notifyComposing(false)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        rows={2}
        aria-describedby="message-send-hint"
      />
      <button
        id="message-send-hint"
        type="button"
        className="btn btn-primary"
        onClick={submit}
        disabled={disabled || !value.trim()}
      >
        Send
      </button>
    </div>
  )
}
