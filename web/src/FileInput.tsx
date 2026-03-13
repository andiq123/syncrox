import { useRef } from 'react'

type Props = {
  onSend: (file: File) => void
  disabled?: boolean
}

export function FileInput({ onSend, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (file.name) onSend(file)
    }
    e.target.value = ''
  }

  return (
    <div className="file-input">
      <input
        ref={inputRef}
        type="file"
        className="file-input-native"
        multiple
        onChange={handleChange}
        disabled={disabled}
        aria-label="Choose files to send"
      />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        Send file(s)
      </button>
    </div>
  )
}
