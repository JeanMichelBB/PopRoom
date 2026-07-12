export function hashStr(str) {
  let h = 0
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return Math.abs(h)
}

// Deterministic 0‥1 value from a string seed — FNV-1a, full 32-bit range
export function seededRand(seed) {
  let h = 2166136261 >>> 0
  for (const c of String(seed)) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h / 0xFFFFFFFF
}

// Deterministic 0‥1 value from (bx, by, salt) via integer mixing (Murmur3-style
// finalizer). String-based hashes like seededRand don't diffuse well over very
// short, near-identical inputs (e.g. "pond_-1_0" vs "pond_-1_1") — that showed
// up as ponds banding along a single column instead of scattering naturally.
// Multiplying each coordinate by a large odd constant before mixing avoids it.
export function hash2D(bx, by, salt) {
  let h = (Math.imul(bx, 374761393) + Math.imul(by, 668265263) + Math.imul(salt, 2246822519)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 0xFFFFFFFF
}
