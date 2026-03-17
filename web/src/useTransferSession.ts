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

const COMPOSING_EXPIRE_MS = 800
const SPEED_SAMPLE_INTERVAL_MS = 500

export type TextEvent = {
  type: 'text'
  id: string
  body: string
  at: number
  direction: 'out' | 'in'
  senderName?: string | null
}

export type FileEvent = {
  type: 'file'
  id: string
  transferId: string
  name: string
  size: number
  at: number
  direction: 'out' | 'in'
  done: boolean
  progress: number
  remaining: number
  speed?: number
  senderName?: string | null
}

export type ChatEvent = TextEvent | FileEvent

export type IncomingFileState = {
  transferId: string
  name: string
  size: number
  mimeType: string
  chunks: Map<number, Uint8Array>
  received: number
  done: boolean
  senderName?: string | null
  at: number
}

export type OutgoingFileState = {
  transferId: string
  name: string
  size: number
  sent: number
  done: boolean
  senderName?: string | null
  at: number
}

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

function makeIncomingFileEntry(
  transferId: string,
  name: string,
  size: number,
  mimeType: string,
  senderName?: string | null,
): IncomingFileState {
  return {
    transferId,
    name,
    size,
    mimeType,
    chunks: new Map<number, Uint8Array>(),
    received: 0,
    done: false,
    senderName: senderName ?? null,
    at: Date.now(),
  }
}

function buildBlobFromIncoming(
  fileRef: IncomingFileState | undefined,
  fileState: IncomingFileState | undefined,
): { blob: Blob; name: string } | null {
  const file = fileRef ?? fileState
  if (!file?.done) return null
  const refChunks = fileRef?.chunks ?? new Map<number, Uint8Array>()
  const stateChunks = fileState?.chunks ?? new Map<number, Uint8Array>()
  const keys = Array.from(new Set([...refChunks.keys(), ...stateChunks.keys()])).sort((a, b) => a - b)
  const parts: BlobPart[] = []
  for (const k of keys) {
    const part = refChunks.get(k) ?? stateChunks.get(k)
    if (part?.length) parts.push(part.slice(0).buffer)
  }
  if (parts.length === 0) return null
  return {
    blob: new Blob(parts, { type: file.mimeType || undefined }),
    name: file.name,
  }
}

export function useTransferSession() {
  const [messages, setMessages] = useState<TextEvent[]>([])
  const [incomingFiles, setIncomingFiles] = useState<Map<string, IncomingFileState>>(new Map())
  const [outgoingFiles, setOutgoingFiles] = useState<Map<string, OutgoingFileState>>(new Map())
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  const msgIdRef = useRef(0)
  const incomingRef = useRef<Map<string, IncomingFileState>>(new Map())
  const outgoingBlobsRef = useRef<Map<string, { name: string; blob: Blob }>>(new Map())
  
  const [transferSpeeds, setTransferSpeeds] = useState<Map<string, number>>(new Map())
  const [peerName, setPeerName] = useState<string | null>(null)
  const [peerComposing, setPeerComposing] = useState<{ name: string } | null>(null)
  
  const composingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSampleRef = useRef<Map<string, { bytes: number; time: number }>>(new Map())
  const outgoingSnapshotRef = useRef<Map<string, OutgoingFileState>>(new Map())
  const incomingSnapshotRef = useRef<Map<string, IncomingFileState>>(new Map())
  
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
            type: 'text',
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
    [send]
  )

  const sendText = useCallback(
    (body: string) => {
      if (!body.trim()) return
      sendComposing(false)
      send(JSON.stringify({ type: MessageType.Text, payload: { body: body.trim() } }))
      setMessages((prev) => [
        ...prev,
        {
          type: 'text',
          id: `m-${++msgIdRef.current}`,
          body: body.trim(),
          at: Date.now(),
          direction: 'out',
          senderName: peerName ?? undefined,
        },
      ])
    },
    [send, sendComposing, peerName]
  )

  const sendFile = useCallback(
    async (file: File) => {
      const transferId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const size = file.size
      const creationTime = Date.now()

      setOutgoingFiles((prev) => {
        const next = new Map(prev)
        next.set(transferId, {
          transferId,
          name: file.name,
          size,
          sent: 0,
          done: false,
          senderName: peerName ?? undefined,
          at: creationTime,
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
        })
      )

      const chunkSize = ChunkSize
      const parts: BlobPart[] = []
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
          parts.push(chunk.slice(0).buffer)
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
        parts.push(buffer.slice(0).buffer)
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
    [send, peerName]
  )

  const sendFiles = useCallback(
    (files: FileList | File[]) => {
      if (!files?.length) return
      for (const file of Array.from(files)) {
        if (file.name) sendFile(file)
      }
    },
    [sendFile]
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

  const timelineEvents = useMemo(() => {
    const events: ChatEvent[] = [...messages]

    Array.from(incomingFiles.values()).forEach((f) => {
      const receivedChunks = incomingRef.current.get(f.transferId)?.chunks.size ?? f.received
      const receivedBytes = receivedChunks * ChunkSize
      const progress = f.size ? Math.min(1, receivedBytes / f.size) : 1
      events.push({
        type: 'file',
        id: `file-in-${f.transferId}`,
        transferId: f.transferId,
        name: f.name,
        size: f.size,
        at: f.at,
        direction: 'in',
        done: f.done,
        progress,
        remaining: Math.max(0, f.size - receivedBytes),
        speed: transferSpeeds.get(f.transferId),
        senderName: f.senderName,
      })
    })

    Array.from(outgoingFiles.values()).forEach((f) => {
      const sentBytes = f.sent * ChunkSize
      const progress = f.size ? Math.min(1, sentBytes / f.size) : 1
      events.push({
        type: 'file',
        id: `file-out-${f.transferId}`,
        transferId: f.transferId,
        name: f.name,
        size: f.size,
        at: f.at,
        direction: 'out',
        done: f.done,
        progress,
        remaining: Math.max(0, f.size - sentBytes),
        speed: transferSpeeds.get(f.transferId),
        senderName: f.senderName,
      })
    })

    events.sort((a, b) => a.at - b.at)
    return events
  }, [messages, incomingFiles, outgoingFiles, transferSpeeds])

  return {
    state,
    restart,
    connectionError,
    peerName,
    peerComposing,
    purgeSession,
    sendText,
    sendComposing,
    sendFiles,
    downloadIncoming,
    downloadOutgoing,
    timelineEvents,
  }
}
