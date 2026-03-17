import { useState, useCallback } from 'react'
import { ChatTimeline } from './ChatTimeline'
import { MessageComposer } from './MessageComposer'
import type { ChatEvent } from './useTransferSession'

type Props = {
  events: ChatEvent[]
  peerComposing: { name: string } | null
  disabled: boolean
  onSendText: (body: string) => void
  onSendFiles: (files: FileList | File[]) => void
  onComposingChange: (active: boolean) => void
  onDownloadIncoming: (transferId: string) => void
  onDownloadOutgoing: (transferId: string) => void
}

export function MessagingPanel({
  events,
  peerComposing,
  disabled,
  onSendText,
  onSendFiles,
  onComposingChange,
  onDownloadIncoming,
  onDownloadOutgoing,
}: Props) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      if (disabled) return
      const files = e.dataTransfer?.files
      if (files?.length) onSendFiles(files)
    },
    [disabled, onSendFiles],
  )

  const preventFileDragDefault = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
    }
  }, [])

  return (
    <main
      id="transfer-main"
      className={`transfer-main unified-panel ${isDragging ? 'transfer-panel--dragging' : ''}`}
      role="main"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <section
        className="transfer-section unified-section"
        aria-labelledby="messages-heading"
        onDragOver={preventFileDragDefault}
      >
        <h2 id="messages-heading" className="sr-only">
          Chat Timeline
        </h2>
        {isDragging && (
          <div className="file-drop-overlay" aria-hidden>
            Drop files to send
          </div>
        )}
        <div className="section-inner unified-inner">
          <div className="section-body unified-body">
            <ChatTimeline
              events={events}
              onDownloadIncoming={onDownloadIncoming}
              onDownloadOutgoing={onDownloadOutgoing}
            />
          </div>
          
          <div className="typing-indicator-slot" aria-live="polite">
            {peerComposing ? (
              <p className="typing-indicator">{peerComposing.name} is typing…</p>
            ) : null}
          </div>
          
          <div className="section-footer unified-footer">
            <MessageComposer
              onSendText={onSendText}
              onSendFiles={onSendFiles}
              onComposingChange={onComposingChange}
              disabled={disabled}
            />
          </div>
        </div>
      </section>
    </main>
  )
}
