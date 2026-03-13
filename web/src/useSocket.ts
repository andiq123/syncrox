import { useCallback, useEffect, useRef, useState } from 'react'
import { buildWsUrl } from './api'

export type ConnectionState = 'closed' | 'connecting' | 'connected' | 'reconnecting'

type Options = {
  code: string
  onMessage: (data: string | ArrayBuffer) => void
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

  const send = useCallback((data: string | ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
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

  return { state, send, connect, disconnect, restart }
}
