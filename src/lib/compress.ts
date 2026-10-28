/** Compress JSON-serializable data for localStorage (CompressionStream when available). */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export async function compressJson(value: unknown): Promise<string> {
  const json = JSON.stringify(value)
  if (typeof CompressionStream === 'undefined') {
    return `raw:${json}`
  }
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()
  return `gz:${bytesToBase64(new Uint8Array(buf))}`
}

export async function decompressJson<T>(payload: string): Promise<T> {
  if (payload.startsWith('raw:')) {
    return JSON.parse(payload.slice(4)) as T
  }
  if (!payload.startsWith('gz:')) {
    return JSON.parse(payload) as T
  }
  const bytes = base64ToBytes(payload.slice(3))
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Cannot decompress saved game in this browser')
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  return JSON.parse(text) as T
}
