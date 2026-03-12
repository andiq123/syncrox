const ID_LEN_BYTES = 2
const INDEX_BYTES = 4
const HEADER_BYTES = ID_LEN_BYTES + INDEX_BYTES

export function encodeChunk(transferId: string, index: number, payload: Uint8Array): ArrayBuffer {
  const idBytes = new TextEncoder().encode(transferId)
  if (idBytes.length > 0xffff) throw new Error('transfer id too long')
  const buf = new ArrayBuffer(ID_LEN_BYTES + idBytes.length + INDEX_BYTES + payload.byteLength)
  const view = new DataView(buf)
  let off = 0
  view.setUint16(off, idBytes.length, true)
  off += ID_LEN_BYTES
  new Uint8Array(buf).set(idBytes, off)
  off += idBytes.length
  view.setUint32(off, index >>> 0, true)
  off += INDEX_BYTES
  new Uint8Array(buf).set(payload, off)
  return buf
}

export function parseChunk(buffer: ArrayBuffer): { transferId: string; index: number; data: Uint8Array } | null {
  if (buffer.byteLength < HEADER_BYTES) return null
  const view = new DataView(buffer)
  const idLen = view.getUint16(0, true)
  if (buffer.byteLength < ID_LEN_BYTES + idLen + INDEX_BYTES) return null
  const idBytes = new Uint8Array(buffer, ID_LEN_BYTES, idLen)
  const transferId = new TextDecoder().decode(idBytes)
  const index = view.getUint32(ID_LEN_BYTES + idLen, true)
  const dataStart = ID_LEN_BYTES + idLen + INDEX_BYTES
  const data = new Uint8Array(buffer.byteLength - dataStart)
  data.set(new Uint8Array(buffer, dataStart))
  return { transferId, index, data }
}

export const CHUNK_HEADER_MAX_BYTES = 64
