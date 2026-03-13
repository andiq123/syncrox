import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { encodeChunk, parseChunk } from './chunkProtocol'
import {
  MessageType,
  ChunkSize,
  formatSenderName,
  type Envelope,
  type TextPayload,
  type ComposingPayload,
  type FileStartPayload,
  type FileEndPayload,
  type JoinedPayload,
} from './protocol'
import { DEFAULT_SESSION_CODE } from './api'
import { useSocket } from './useSocket'
import { ConnectionStatus } from './ConnectionStatus'
import { MessageList, type MessageItem } from './MessageList'
import { MessageInput } from './MessageInput'
import { FileList } from './FileList'
import { FileInput } from './FileInput'

const COMPOSING_EXPIRE_MS = 800
const SPEED_SAMPLE_INTERVAL_MS = 500

function createDownloadTrigger(): (blob: Blob, name: string) => void {
  let anchor: HTMLAnchorElement | null = null
  let lastUrl: string | null = null
  return (blob: Blob, name: string) => {
    if (lastUrl) URL.revokeObjectURL(lastUrl)
    const url = URL.createObjectURL(blob)
    lastUrl = url
    if (!anchor) {
      anchor = document.createElement('a')
      anchor.rel = 'noopener noreferrer'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
    }
    anchor.href = url
    anchor.download = name
    anchor.click()
  }
}

const triggerDownload = createDownloadTrigger()

type IncomingFile = {
  transferId: string
  name: string
  size: number
  mimeType: string
  chunks: Map<number, Uint8Array>
  received: number
  done: boolean
  senderName?: string | null
}

type OutgoingFile = {
  transferId: string
  name: string
  size: number
  sent: number
  done: boolean
  senderName?: string | null
}

function makeIncomingFileEntry(
  transferId: string,
  name: string,
  size: number,
  mimeType: string,
  senderName?: string | null,
): IncomingFile {
  return {
    transferId,
    name,
    size,
    mimeType,
    chunks: new Map<number, Uint8Array>(),
    received: 0,
    done: false,
    senderName: senderName ?? null,
  }
}

function buildIncomingList(
  incomingFiles: Map<string, IncomingFile>,
  incomingRef: Map<string, IncomingFile>,
  transferSpeeds: Map<string, number>,
) {
  return Array.from(incomingFiles.values()).map((f) => {
    const receivedChunks = incomingRef.get(f.transferId)?.chunks.size ?? f.received
    const receivedBytes = receivedChunks * ChunkSize
    const progress = f.size ? Math.min(1, receivedBytes / f.size) : 1
    return {
      ...f,
      progress,
      remaining: Math.max(0, f.size - receivedBytes),
      speed: transferSpeeds.get(f.transferId),
    }
  })
}

function buildOutgoingList(
  outgoingFiles: Map<string, OutgoingFile>,
  transferSpeeds: Map<string, number>,
) {
  return Array.from(outgoingFiles.values()).map((f) => {
    const sentBytes = f.sent * ChunkSize
    return {
      ...f,
      remaining: Math.max(0, f.size - sentBytes),
      speed: transferSpeeds.get(f.transferId),
    }
  })
}

function buildBlobFromIncoming(
  fileRef: IncomingFile | undefined,
  fileState: IncomingFile | undefined,
): { blob: Blob; name: string } | null {
  const file = fileRef ?? fileState
  if (!file?.done) return null
  const refChunks = fileRef?.chunks ?? new Map<number, Uint8Array>()
  const stateChunks = fileState?.chunks ?? new Map<number, Uint8Array>()
  const keys = Array.from(new Set([...refChunks.keys(), ...stateChunks.keys()])).sort((a, b) => a - b)
  const parts: Uint8Array[] = []
  for (const k of keys) {
    const part = refChunks.get(k) ?? stateChunks.get(k)
    if (part?.length) parts.push(part.slice(0))
  }
  if (parts.length === 0) return null
  return {
    blob: new Blob(parts, { type: file.mimeType || undefined }),
    name: file.name,
  }
}

function ConnectionErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="transfer-error" role="alert" aria-live="assertive">
      <span className="transfer-error-text">{message}</span>
      <button
        type="button"
        className="btn btn-ghost btn-small transfer-error-retry"
        onClick={onRetry}
        aria-label="Retry connection"
      >
        Retry
      </button>
    </div>
  )
}

export function Transfer() {
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [incomingFiles, setIncomingFiles] = useState<Map<string, IncomingFile>>(new Map())
  const [outgoingFiles, setOutgoingFiles] = useState<Map<string, OutgoingFile>>(new Map())
  const [isDragging, setIsDragging] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const msgIdRef = useRef(0)
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map())
  const outgoingBlobsRef = useRef<Map<string, { name: string; blob: Blob }>>(new Map())
  const [transferSpeeds, setTransferSpeeds] = useState<Map<string, number>>(new Map())
  const [peerName, setPeerName] = useState<string | null>(null)
  const [peerComposing, setPeerComposing] = useState<{ name: string } | null>(null)
  const composingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSampleRef = useRef<Map<string, { bytes: number; time: number }>>(new Map())
  const outgoingSnapshotRef = useRef<Map<string, OutgoingFile>>(new Map())
  const incomingSnapshotRef = useRef<Map<string, IncomingFile>>(new Map())
  outgoingSnapshotRef.current = outgoingFiles
  incomingSnapshotRef.current = incomingFiles

  const clearAllState = useCallback(() => {
    setConnectionError(null)
    setTransferSpeeds(new Map())
    lastSampleRef.current = new Map()
    setMessages([])
    setIncomingFiles(new Map())
    setOutgoingFiles(new Map())
    incomingRef.current = new Map()
    outgoingBlobsRef.current = new Map()
    setPeerComposing(null)
    if (composingTimeoutRef.current) clearTimeout(composingTimeoutRef.current)
    composingTimeoutRef.current = null
  }, [])

  const handleBinaryChunk = useCallback((raw: ArrayBuffer) => {
    const parsed = parseChunk(raw)
    if (!parsed) return
    const { transferId, index, data } = parsed
    setIncomingFiles((prev) => {
      const file = prev.get(transferId)
      if (!file) return prev
      const next = new Map(prev)
      const nextFile = { ...file, chunks: new Map(file.chunks) }
      nextFile.chunks.set(index, data)
      nextFile.received = nextFile.chunks.size
      next.set(transferId, nextFile)
      return next
    })
    const refFile = incomingRef.current.get(transferId)
    if (refFile) {
      refFile.chunks.set(index, data)
      refFile.received = refFile.chunks.size
    }
  }, [])

  const onMessage = useCallback(
    (raw: string | ArrayBuffer) => {
      if (raw instanceof ArrayBuffer) {
        handleBinaryChunk(raw)
        return
      }

      let e: Envelope
      try {
        e = JSON.parse(raw as string) as Envelope
      } catch {
        return
      }
      switch (e.type) {
      case MessageType.Joined: {
        const p = e.payload as JoinedPayload
        setPeerName(p?.name ?? null)
        return
      }
      case MessageType.Error: {
        const p = e.payload as { message?: string }
        setConnectionError(p?.message ?? 'Connection error')
        return
      }
      case MessageType.StartFresh:
        clearAllState()
        return
      case MessageType.Text: {
        const p = e.payload as TextPayload
        if (!p?.body) return
        setPeerComposing(null)
        setMessages((prev) => [
          ...prev,
          {
            id: `m-${++msgIdRef.current}`,
            body: p.body,
            at: Date.now(),
            direction: 'in',
            senderName: p.sender_name ?? null,
          },
        ])
        return
      }
      case MessageType.Composing: {
        const p = e.payload as ComposingPayload
        if (!p?.active) {
          setPeerComposing(null)
          return
        }
        if (composingTimeoutRef.current) clearTimeout(composingTimeoutRef.current)
        const name = formatSenderName(p.sender_name ?? 'Someone')
        setPeerComposing({ name })
        composingTimeoutRef.current = setTimeout(() => setPeerComposing(null), COMPOSING_EXPIRE_MS)
        return
      }
      case MessageType.FileStart: {
        const p = e.payload as FileStartPayload
        if (!p?.transfer_id || !p?.name) return
        const entry = makeIncomingFileEntry(
          p.transfer_id,
          p.name,
          p.size,
          p.mime_type ?? '',
          p.sender_name,
        )
        setIncomingFiles((prev) => {
          const next = new Map(prev)
          next.set(p.transfer_id, { ...entry, chunks: new Map(entry.chunks) })
          return next
        })
        incomingRef.current.set(p.transfer_id, { ...entry, chunks: new Map(entry.chunks) })
        return
      }
      case MessageType.FileEnd: {
        const p = e.payload as FileEndPayload
        if (!p?.transfer_id) return
        const f = incomingRef.current.get(p.transfer_id)
        if (f) f.done = true
        setIncomingFiles((prev) => {
          const next = new Map(prev)
          const file = next.get(p.transfer_id)
          if (!file) return next
          next.set(p.transfer_id, { ...file, done: true })
          return next
        })
        return
      }
      default:
        return
    }
    },
    [handleBinaryChunk, clearAllState],
  )

  const { state, send, restart } = useSocket({ code: DEFAULT_SESSION_CODE, onMessage })
  const prevStateRef = useRef(state)

  const purgeSession = useCallback(() => {
    clearAllState()
    send(JSON.stringify({ type: MessageType.StartFresh }))
  }, [clearAllState, send])

  useEffect(() => {
    if (state === 'connected' || state === 'connecting') setConnectionError(null)
  }, [state])

  useEffect(() => {
    if (state !== 'connected') return
    const last = lastSampleRef.current
    const recordSample = (
      id: string,
      bytes: number,
      now: number,
      next: Map<string, number>,
    ) => {
      const prev = last.get(id)
      last.set(id, { bytes, time: now })
      if (prev && now > prev.time) {
        const dt = (now - prev.time) / 1000
        if (dt > 0) next.set(id, (bytes - prev.bytes) / dt)
      }
    }
    const interval = setInterval(() => {
      const now = Date.now()
      const next = new Map<string, number>()
      const outgoing = outgoingSnapshotRef.current
      const incoming = incomingSnapshotRef.current

      outgoing.forEach((f, id) => {
        if (f.done) return
        recordSample(id, f.sent * ChunkSize, now, next)
      })
      incoming.forEach((f, id) => {
        if (f.done) return
        const refFile = incomingRef.current.get(id)
        const received = refFile?.chunks.size ?? f.received
        const bytes = f.size ? Math.min(f.size, received * ChunkSize) : received * ChunkSize
        recordSample(id, bytes, now, next)
      })

      setTransferSpeeds((prev) => {
        const m = new Map(prev)
        next.forEach((v, k) => m.set(k, v))
        return m
      })
    }, SPEED_SAMPLE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [state])

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = state
    if (prev === 'connected' && state !== 'connected') {
      setMessages([])
      setIncomingFiles(new Map())
      setOutgoingFiles(new Map())
      setPeerName(null)
      incomingRef.current = new Map()
      outgoingBlobsRef.current = new Map()
    }
    if (state === 'closed' && (prev === 'connecting' || prev === 'reconnecting')) {
      setConnectionError('Connection failed. Check the server or try again.')
    }
  }, [state])

  useEffect(() => () => {
    if (composingTimeoutRef.current) clearTimeout(composingTimeoutRef.current)
  }, [])

  const sendComposing = useCallback(
    (active: boolean) => {
      send(JSON.stringify({ type: MessageType.Composing, payload: { active } }))
    },
    [send],
  )

  const sendText = useCallback(
    (body: string) => {
      if (!body.trim()) return
      sendComposing(false)
      send(JSON.stringify({ type: MessageType.Text, payload: { body: body.trim() } }))
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${++msgIdRef.current}`,
          body: body.trim(),
          at: Date.now(),
          direction: 'out',
          senderName: peerName ?? undefined,
        },
      ])
    },
    [send, sendComposing, peerName],
  )

  const sendFile = useCallback(
    async (file: File) => {
      const transferId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const size = file.size
      setOutgoingFiles((prev) => {
        const next = new Map(prev)
        next.set(transferId, {
          transferId,
          name: file.name,
          size,
          sent: 0,
          done: false,
          senderName: peerName ?? undefined,
        })
        return next
      })

      send(
        JSON.stringify({
          type: MessageType.FileStart,
          payload: {
            transfer_id: transferId,
            name: file.name,
            size,
            mime_type: file.type || undefined,
          },
        }),
      )

      const chunkSize = ChunkSize
      const parts: Uint8Array[] = []
      const reader = file.stream().getReader()
      let index = 0
      const totalChunks = Math.ceil(size / chunkSize)
      const progressInterval = Math.max(1, Math.floor(totalChunks / 50))
      let buffer = new Uint8Array(0)

      while (true) {
        const { done, value } = await reader.read()
        if (value?.length) {
          const combined = new Uint8Array(buffer.length + value.length)
          combined.set(buffer)
          combined.set(value, buffer.length)
          buffer = combined
        }
        while (buffer.length >= chunkSize) {
          const chunk = buffer.subarray(0, chunkSize)
          buffer = buffer.subarray(chunkSize)
          send(encodeChunk(transferId, index, chunk))
          parts.push(chunk)
          index += 1
          if (index % progressInterval === 0 || index === totalChunks) {
            setOutgoingFiles((prev) => {
              const next = new Map(prev)
              const f = next.get(transferId)
              if (!f) return prev
              next.set(transferId, { ...f, sent: index })
              return next
            })
          }
        }
        if (done) break
      }
      if (buffer.length > 0) {
        send(encodeChunk(transferId, index, buffer))
        parts.push(buffer)
        index += 1
      }

      send(JSON.stringify({ type: MessageType.FileEnd, payload: { transfer_id: transferId } }))
      setOutgoingFiles((prev) => {
        const next = new Map(prev)
        const f = next.get(transferId)
        if (!f) return prev
        next.set(transferId, { ...f, done: true })
        return next
      })
      const blob = new Blob(parts, { type: file.type || undefined })
      outgoingBlobsRef.current.set(transferId, { name: file.name, blob })
    },
    [send, peerName],
  )

  const downloadIncoming = useCallback((transferId: string) => {
    const file = incomingRef.current.get(transferId)
    const result = buildBlobFromIncoming(file, undefined)
    if (result) triggerDownload(result.blob, result.name)
  }, [])

  const downloadOutgoing = useCallback((transferId: string) => {
    const stored = outgoingBlobsRef.current.get(transferId)
    if (!stored) return
    triggerDownload(stored.blob, stored.name)
  }, [])

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
      if (state !== 'connected') return
      const files = e.dataTransfer?.files
      if (!files?.length) return
      for (const file of Array.from(files)) {
        if (file.name) sendFile(file)
      }
    },
    [sendFile, state],
  )

  const incomingList = useMemo(
    () => buildIncomingList(incomingFiles, incomingRef.current, transferSpeeds),
    [incomingFiles, transferSpeeds],
  )
  const outgoingList = useMemo(
    () => buildOutgoingList(outgoingFiles, transferSpeeds),
    [outgoingFiles, transferSpeeds],
  )

  const preventFileDragDefault = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
    }
  }, [])

  return (
    <div className="transfer" onDragOver={preventFileDragDefault}>
      <a href="#transfer-main" className="skip-link">
        Skip to main content
      </a>
      <header className="transfer-header" role="banner">
        <ConnectionStatus state={state} peerName={peerName} />
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={purgeSession}
          aria-label="Purge session and start fresh"
        >
          Start fresh
        </button>
      </header>

      {connectionError && (
        <ConnectionErrorBanner message={connectionError} onRetry={restart} />
      )}

      <main id="transfer-main" className="transfer-main" role="main">
        <section
          className="transfer-section transfer-section--messages"
          aria-labelledby="messages-heading"
        >
          <h2 id="messages-heading" className="sr-only">
            Messages
          </h2>
          <div className="section-inner">
            <div className="section-body section-body--messages">
              <MessageList messages={messages} />
            </div>
            <div className="typing-indicator-slot" aria-live="polite">
              {peerComposing ? (
                <p className="typing-indicator">{peerComposing.name} is typing…</p>
              ) : null}
            </div>
            <div className="section-footer">
              <MessageInput
                onSend={sendText}
                onComposingChange={sendComposing}
                disabled={state !== 'connected'}
              />
            </div>
          </div>
        </section>

        <section
          className={`transfer-section transfer-section--files ${isDragging ? 'transfer-section--dragging' : ''}`}
          aria-labelledby="files-heading"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <h2 id="files-heading" className="sr-only">
            Files
          </h2>
          {isDragging && (
            <div className="file-drop-overlay" aria-hidden>
              Drop files here
            </div>
          )}
          <div className="section-inner">
            <div className="section-body section-body--files">
              <FileList
                incoming={incomingList}
                outgoing={outgoingList}
                chunkSize={ChunkSize}
                onDownloadIncoming={downloadIncoming}
                onDownloadOutgoing={downloadOutgoing}
              />
            </div>
            <div className="section-footer">
              <FileInput onSend={sendFile} disabled={state !== 'connected'} />
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
