import { useCallback, useEffect, useState } from 'react'
import { getSession } from './api'
import { Transfer } from './Transfer'

export default function App() {
  const [sessionCode, setSessionCode] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadSession = useCallback(() => {
    setError(false)
    setLoading(true)
    getSession()
      .then(({ code }) => setSessionCode(code))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  if (sessionCode) {
    return <Transfer sessionCode={sessionCode} />
  }

  return (
    <div className="app-loading" aria-busy={loading}>
      <span>{error ? 'Connection failed.' : 'Connecting…'}</span>
      {error && (
        <button type="button" className="btn btn-secondary app-loading-retry" onClick={loadSession}>
          Retry
        </button>
      )}
    </div>
  )
}
