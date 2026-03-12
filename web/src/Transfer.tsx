import { useCallback, useEffect, useRef, useState } from 'react'
import { encodeChunk, parseChunk } from './chunkProtocol'
import {
  MessageType,
  ChunkSize,
  type Envelope,
  type TextPayload,
  type FileStartPayload,
  type FileEndPayload,
} from './protocol'
import { useSocket } from './useSocket'
import { ConnectionStatus } from './ConnectionStatus'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { FileList } from './FileList'
import { FileInput } from './FileInput'

type MessageItem = { id: string; body: string; at: number; direction: 'out' | 'in' }

type IncomingFile = {
  transferId: string
  name: string
  size: number
  mimeType: string
  chunks: Map<number, Uint8Array>
  received: number
  done: boolean
}

type OutgoingFile = {
  transferId: string
  name: string
  size: number
  sent: number
  done: boolean
}

type Props = {
  sessionCode: string
}

export function Transfer({ sessionCode }: Props) {
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [incomingFiles, setIncomingFiles] = useState<Map<string, IncomingFile>>(new Map())
  const [outgoingFiles, setOutgoingFiles] = useState<Map<string, OutgoingFile>>(new Map())
  const [isDragging, setIsDragging] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const msgIdRef = useRef(0)
  const incomingRef = useRef<Map<string, IncomingFile>>(new Map())
  const outgoingBlobsRef = useRef<Map<string, { name: string; blob: Blob }>>(new Map())
  const [transferSpeeds, setTransferSpeeds] = useState<Map<string, number>>(new Map())
  const lastSampleRef = useRef<Map<string, { bytes: number; time: number }>>(new Map())
  const outgoingSnapshotRef = useRef<Map<string, OutgoingFile>>(new Map())
  const incomingSnapshotRef = useRef<Map<string, IncomingFile>>(new Map())
  outgoingSnapshotRef.current = outgoingFiles
  incomingSnapshotRef.current = incomingFiles

  const onMessage = useCallback((raw: string | ArrayBuffer) => {
    if (raw instanceof ArrayBuffer) {
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
      const f = incomingRef.current.get(transferId)
      if (f) {
        f.chunks.set(index, data)
        f.received = f.chunks.size
      }
      return
    }

    let e: Envelope
    try {
      e = JSON.parse(raw as string) as Envelope
    } catch {
      return
    }
    switch (e.type) {
      case MessageType.Joined:
        return
      case MessageType.Error: {
        const p = e.payload as { message?: string }
        setConnectionError(p?.message ?? 'Connection error')
        return
      }
      case MessageType.Text: {
        const p = e.payload as TextPayload
        if (!p?.body) return
        setMessages((prev) => [
          ...prev,
          { id: `m-${++msgIdRef.current}`, body: p.body, at: Date.now(), direction: 'in' },
        ])
        return
      }
      case MessageType.FileStart: {
        const p = e.payload as FileStartPayload
        if (!p?.transfer_id || !p?.name) return
        setIncomingFiles((prev) => {
          const next = new Map(prev)
          next.set(p.transfer_id, {
            transferId: p.transfer_id,
            name: p.name,
            size: p.size,
            mimeType: p.mime_type ?? '',
            chunks: new Map<number, Uint8Array>(),
            received: 0,
            done: false,
          })
          return next
        })
        incomingRef.current.set(p.transfer_id, {
          transferId: p.transfer_id,
          name: p.name,
          size: p.size,
          mimeType: p.mime_type ?? '',
          chunks: new Map<number, Uint8Array>(),
          received: 0,
          done: false,
        })
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
  }, [])

  const { state, send, restart } = useSocket({ code: sessionCode, onMessage })
  const prevStateRef = useRef(state)

  const purgeSession = useCallback(() => {
    setConnectionError(null)
    setTransferSpeeds(new Map())
    lastSampleRef.current.clear()
    setMessages([])
    setIncomingFiles(new Map())
    setOutgoingFiles(new Map())
    incomingRef.current.clear()
    outgoingBlobsRef.current.clear()
    restart()
  }, [restart])

  useEffect(() => {
    if (state === 'connected') setConnectionError(null)
  }, [state])

  useEffect(() => {
    if (state !== 'connected') return
    const interval = setInterval(() => {
      const now = Date.now()
      const next = new Map<string, number>()
      const last = lastSampleRef.current
      const outgoing = outgoingSnapshotRef.current
      const incoming = incomingSnapshotRef.current

      outgoing.forEach((f, id) => {
        if (f.done) return
        const bytes = f.sent * ChunkSize
        const prev = last.get(id)
        last.set(id, { bytes, time: now })
        if (prev && now > prev.time) {
          const dt = (now - prev.time) / 1000
          if (dt > 0) next.set(id, (bytes - prev.bytes) / dt)
        }
      })

      incoming.forEach((f, id) => {
        if (f.done) return
        const refFile = incomingRef.current.get(id)
        const received = refFile?.chunks.size ?? f.received
        const bytes = f.size ? Math.min(f.size, received * ChunkSize) : received * ChunkSize
        const prev = last.get(id)
        last.set(id, { bytes, time: now })
        if (prev && now > prev.time) {
          const dt = (now - prev.time) / 1000
          if (dt > 0) next.set(id, (bytes - prev.bytes) / dt)
        }
      })

      setTransferSpeeds((prev) => {
        const m = new Map(prev)
        next.forEach((v, k) => m.set(k, v))
        return m
      })
    }, 500)
    return () => clearInterval(interval)
  }, [state])

  useEffect(() => {
    const wasConnected = prevStateRef.current === 'connected'
    prevStateRef.current = state
    if (wasConnected && state !== 'connected') {
      setMessages([])
      setIncomingFiles(new Map())
      setOutgoingFiles(new Map())
      incomingRef.current.clear()
      outgoingBlobsRef.current.clear()
    }
  }, [state])

  const sendText = useCallback(
    (body: string) => {
      if (!body.trim()) return
      send(JSON.stringify({ type: MessageType.Text, payload: { body: body.trim() } }))
      setMessages((prev) => [
        ...prev,
        { id: `m-${++msgIdRef.current}`, body: body.trim(), at: Date.now(), direction: 'out' },
      ])
    },
    [send],
  )

  const sendFile = useCallback(
    async (file: File) => {
      const transferId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const size = file.size
      setOutgoingFiles((prev) => {
        const next = new Map(prev)
        next.set(transferId, { transferId, name: file.name, size, sent: 0, done: false })
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
    [send],
  )

  const downloadIncoming = useCallback((transferId: string) => {
    console.log('[downloadIncoming] called', transferId)
    const fileRef = incomingRef.current.get(transferId)
    const fileState = incomingFiles.get(transferId)
    const file = fileRef ?? fileState
    if (!file) {
      console.warn('[downloadIncoming] no file for transferId', transferId)
      return
    }
    if (!file.done) {
      console.warn('[downloadIncoming] file not done', transferId)
      return
    }
    const refChunks = fileRef?.chunks ?? new Map<number, Uint8Array>()
    const stateChunks = fileState?.chunks ?? new Map<number, Uint8Array>()
    const allKeys = new Set([...refChunks.keys(), ...stateChunks.keys()])
    const keys = Array.from(allKeys).sort((a, b) => a - b)
    const parts: Uint8Array[] = []
    for (const k of keys) {
      const part = refChunks.get(k) ?? stateChunks.get(k)
      if (part?.length) parts.push(part)
    }
    if (parts.length === 0) {
      console.warn('[downloadIncoming] no chunks', transferId, {
        refSize: refChunks.size,
        stateSize: stateChunks.size,
      })
      return
    }
    const blob = new Blob(parts, { type: file.mimeType || undefined })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.rel = 'noopener noreferrer'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    console.log('[downloadIncoming] download triggered', file.name, parts.length, 'parts')
    setTimeout(() => URL.revokeObjectURL(url), 200)
  }, [incomingFiles])

  const downloadOutgoing = useCallback((transferId: string) => {
    const stored = outgoingBlobsRef.current.get(transferId)
    if (!stored) return
    const url = URL.createObjectURL(stored.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = stored.name
    a.click()
    URL.revokeObjectURL(url)
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
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file?.name) sendFile(file)
      }
    },
    [sendFile, state],
  )

  const incomingList = Array.from(incomingFiles.values()).map((f) => {
    const receivedChunks = incomingRef.current.get(f.transferId)?.chunks.size ?? f.received
    const receivedBytes = receivedChunks * ChunkSize
    const progress = f.size ? Math.min(1, receivedBytes / f.size) : 1
    const remaining = Math.max(0, f.size - receivedBytes)
    return {
      ...f,
      done: f.done,
      progress,
      remaining,
      speed: transferSpeeds.get(f.transferId),
    }
  })
  const outgoingList = Array.from(outgoingFiles.values()).map((f) => {
    const sentBytes = f.sent * ChunkSize
    const remaining = Math.max(0, f.size - sentBytes)
    return {
      ...f,
      remaining,
      speed: transferSpeeds.get(f.transferId),
    }
  })

  return (
    <div className="transfer">
      <header className="transfer-header">
        <ConnectionStatus state={state} />
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
        <div className="transfer-error" role="alert">
          {connectionError}
        </div>
      )}

      <main className="transfer-main">
        <section className="transfer-section" aria-label="Messages">
          <MessageList messages={messages} />
          <MessageInput onSend={sendText} disabled={state !== 'connected'} />
        </section>

        <section
          className={`transfer-section transfer-section--files ${isDragging ? 'transfer-section--dragging' : ''}`}
          aria-label="Files"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="file-drop-overlay" aria-hidden>
              Drop files here
            </div>
          )}
          <FileList
            incoming={incomingList}
            outgoing={outgoingList}
            chunkSize={ChunkSize}
            onDownloadIncoming={downloadIncoming}
            onDownloadOutgoing={downloadOutgoing}
          />
          <FileInput onSend={sendFile} disabled={state !== 'connected'} />
        </section>
      </main>
    </div>
  )
}
