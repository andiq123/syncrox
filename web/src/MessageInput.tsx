import { useState, useCallback } from 'react'

type Props = {
  onSend: (body: string) => void
  disabled?: boolean
}

export function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')

  const submit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }, [value, onSend, disabled])

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
        onChange={(e) => setValue(e.target.value)}
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
