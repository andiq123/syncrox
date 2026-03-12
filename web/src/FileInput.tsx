import { useRef } from 'react'

type Props = {
  onSend: (file: File) => void
  disabled?: boolean
}

export function FileInput({ onSend, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onSend(file)
    e.target.value = ''
  }

  return (
    <div className="file-input">
      <input
        ref={inputRef}
        type="file"
        className="file-input-native"
        onChange={handleChange}
        disabled={disabled}
        aria-label="Choose file to send"
      />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Send file
      </button>
    </div>
  )
}
