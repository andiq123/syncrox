import { useState, useCallback, useRef, useEffect } from 'react'

type Props = {
  onSendText: (body: string) => void
  onSendFiles: (files: FileList) => void
  onComposingChange: (active: boolean) => void
  disabled?: boolean
}

export function MessageComposer({ onSendText, onSendFiles, onComposingChange, disabled }: Props) {
  const [body, setBody] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value)

    if (composingTimeoutRef.current) clearTimeout(composingTimeoutRef.current)
    onComposingChange(true)
    composingTimeoutRef.current = setTimeout(() => {
      onComposingChange(false)
    }, 1200)
  }

  const handleSendText = useCallback(() => {
    const trimmed = body.trim()
    if (!trimmed) return
    onSendText(trimmed)
    setBody('')
    onComposingChange(false)
    if (composingTimeoutRef.current) clearTimeout(composingTimeoutRef.current)
  }, [body, onSendText, onComposingChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendText()
      }
    },
    [handleSendText],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onSendFiles(e.target.files)
        // Reset the input so the same files can be selected again
        e.target.value = ''
      }
    },
    [onSendFiles],
  )

  useEffect(() => () => {
    if (composingTimeoutRef.current) clearTimeout(composingTimeoutRef.current)
  }, [])

  return (
    <div className="message-composer">
      <button
        className="btn btn-ghost attach-btn"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
        aria-label="Attach files"
        title="Attach files"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>

      <input
        type="file"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />

      <div className="composer-input-wrapper">
        <textarea
          className="input message-textarea"
          placeholder="Type a message or paste code..."
          value={body}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          aria-label="Message input"
        />
      </div>

      <button
        type="button"
        className="btn btn-primary send-btn"
        disabled={disabled || !body.trim()}
        onClick={handleSendText}
        aria-label="Send message"
        title="Send"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  )
}
