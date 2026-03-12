import { useEffect, useState } from 'react'
import { getSession } from './api'
import { Transfer } from './Transfer'

export default function App() {
  const [sessionCode, setSessionCode] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
    getSession()
      .then(({ code }) => setSessionCode(code))
      .catch(() => setError(true))
  }, [])

  if (sessionCode) {
    return <Transfer sessionCode={sessionCode} />
  }

  return (
    <div className="app-loading" aria-busy={!error}>
      <span>{error ? 'Connection failed. Refresh to retry.' : 'Connecting…'}</span>
    </div>
  )
}
