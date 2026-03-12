const BATCH_SIZE = 8192
const BASE64_ALPHABET = /[A-Za-z0-9+/]/g

function sanitizeBase64(s: string): string {
  const match = s.match(BASE64_ALPHABET)
  return match ? match.join('') : ''
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  let binary = ''
  for (let i = 0; i < bytes.length; i += BATCH_SIZE) {
    const batch = bytes.subarray(i, Math.min(i + BATCH_SIZE, bytes.length))
    binary += String.fromCharCode.apply(null, Array.from(batch))
  }
  return btoa(binary)
}

function decodeOneChunk(b64: string): Uint8Array | null {
  const clean = sanitizeBase64(b64)
  if (!clean.length) return null
  const pad = clean.length % 4
  const padded = pad ? clean + '='.repeat(4 - pad) : clean
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

export function base64ToBytes(b64: string): Uint8Array | null {
  if (!b64 || typeof b64 !== 'string') return null
  return decodeOneChunk(b64)
}

export function base64ChunksToBytes(chunks: string[]): Uint8Array | null {
  const decoded: Uint8Array[] = []
  let totalLength = 0
  for (const chunk of chunks) {
    const bytes = decodeOneChunk(chunk)
    if (bytes && bytes.length > 0) {
      decoded.push(bytes)
      totalLength += bytes.length
    }
  }
  if (totalLength === 0) return null
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const b of decoded) {
    result.set(b, offset)
    offset += b.length
  }
  return result
}
