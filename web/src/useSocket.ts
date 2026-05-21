import { useCallback, useEffect, useRef, useState } from 'react'
import { buildWsUrl } from './api'

export type ConnectionState = 'closed' | 'connecting' | 'connected' | 'reconnecting'

type Options = {
  code: string
  onMessage: (data: string | ArrayBuffer) => void
}

const SEND_BUFFER_LIMIT = 4 * 1024 * 1024

function waitForSocketBuffer(ws: WebSocket, limit = SEND_BUFFER_LIMIT): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Connection is not open'))
  if (ws.bufferedAmount <= limit) return Promise.resolve()

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }

    intervalId = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        cleanup()
        reject(new Error('Connection closed during transfer'))
        return
      }
      if (ws.bufferedAmount <= limit) {
        cleanup()
        resolve()
      }
    }, 40)

    timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('Transfer stalled while waiting for the network'))
    }, 30000)
  })
}

export function useSocket({ code, onMessage }: Options) {
  const [state, setState] = useState<ConnectionState>('closed')
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const codeRef = useRef(code)
  const closingByCleanupRef = useRef(false)
  const shouldReconnectRef = useRef(true)

  onMessageRef.current = onMessage
  codeRef.current = code

  const connect = useCallback(() => {
    if (!codeRef.current) return
    closingByCleanupRef.current = false
    const url = buildWsUrl(codeRef.current)
    setState('connecting')
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => setState('connected')
    ws.onclose = () => {
      if (closingByCleanupRef.current) {
        closingByCleanupRef.current = false
        wsRef.current = null
        return
      }
      wsRef.current = null
      setState((s) => (s === 'connected' ? 'reconnecting' : 'closed'))
      if (shouldReconnectRef.current && codeRef.current) {
        setTimeout(connect, 2000)
      }
    }
    ws.onerror = () => {}
    ws.onmessage = (e) => {
      if (typeof e.data === 'string' || e.data instanceof ArrayBuffer) {
        onMessageRef.current(e.data)
      }
    }
  }, [])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setState('closed')
  }, [])

  const restart = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setState('closed')
    shouldReconnectRef.current = true
    connect()
  }, [connect])

  const send = useCallback((data: string | ArrayBuffer): boolean => {
    const ws = wsRef.current
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(data)
    return true
  }, [])

  const sendWhenReady = useCallback(async (data: string | ArrayBuffer): Promise<void> => {
    const ws = wsRef.current
    if (ws?.readyState !== WebSocket.OPEN) throw new Error('Connection is not open')
    await waitForSocketBuffer(ws)
    if (ws.readyState !== WebSocket.OPEN) throw new Error('Connection closed during transfer')
    ws.send(data)
  }, [])

  useEffect(() => {
    if (code) {
      shouldReconnectRef.current = true
      connect()
    }
    return () => {
      shouldReconnectRef.current = false
      closingByCleanupRef.current = true
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [code, connect])

  return { state, send, sendWhenReady, connect, disconnect, restart }
}
