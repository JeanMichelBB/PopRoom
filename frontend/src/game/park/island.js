import { P } from '../constants'
import { hash2D } from '../rng'

// Snap down to the nearest multiple of `step`, anchored at world origin —
// used so masked/scanned grids sample fixed world-space cells every frame
// instead of drifting with the camera's fractional position (which made
// per-block texture noise appear to "swim" as the camera panned).
function snapDown(v, step) { return Math.floor(v / step) * step }

// ── Island coastline ──────────────────────────────────────────────────────
// Base radius perturbed by 3 sine harmonics (long sweep + medium detail +
// fine texture) — the "mixed" option, same wobble technique as the pond,
// scaled up to the whole world so the forest's edge reads as a natural
// coastline instead of a hard square cutoff. Always centered on the fixed
// world origin (0,0), same as PARK_OBSTACLES/PARK_DECOR, so it's identical
// for every client regardless of where any one player spawns.
const ISLAND_BASE_R = 1900
const ISLAND_HARMONICS = [
  [0.22, 2, 0.9],   // long sweep — 2 broad lobes
  [0.12, 6, 2.4],   // medium detail — bays and inlets
  [0.05, 11, 0.5],  // fine texture
]
const ISLAND_AMPLITUDE_SUM = ISLAND_HARMONICS.reduce((s, [amp]) => s + amp, 0)
const ISLAND_MIN_R = ISLAND_BASE_R * (1 - ISLAND_AMPLITUDE_SUM)
const ISLAND_MAX_R = ISLAND_BASE_R * (1 + ISLAND_AMPLITUDE_SUM)

export function islandRadiusAt(theta) {
  let mult = 1
  for (const [amp, freq, phase] of ISLAND_HARMONICS) mult += amp * Math.sin(freq * theta + phase)
  return ISLAND_BASE_R * mult
}

// True if world point (x, y) falls outside the island's coastline (open water)
export function isOutsideIsland(x, y) {
  const dist  = Math.sqrt(x * x + y * y)
  const theta = Math.atan2(y, x)
  return dist > islandRadiusAt(theta)
}

// Draws water over the visible ocean only — land is the default ground
// fill, so this just needs to mask whatever's outside the coastline. Uses a
// cheap bounding check first: most of the time the whole view is well
// inside the island (no water on screen at all) or, much more rarely,
// entirely past it — only the ambiguous case near the coastline itself
// pays for the per-block scan.
export function drawOceanMask(ctx, viewCX, viewCY, halfW, halfH, zoom = 1) {
  const nearestDist = Math.max(0, Math.hypot(viewCX, viewCY) - Math.hypot(halfW, halfH))
  if (nearestDist > ISLAND_MAX_R) {
    // Whole view is past the island's widest possible reach — all water
    ctx.fillStyle = '#16323a'
    ctx.fillRect(viewCX - halfW, viewCY - halfH, halfW * 2, halfH * 2)
    return
  }
  const farthestDist = Math.hypot(viewCX, viewCY) + Math.hypot(halfW, halfH)
  if (farthestDist < ISLAND_MIN_R) return  // whole view guaranteed land — no water visible, skip entirely

  // Block size grows as you zoom out (never shrinks below baseline zoomed
  // in) so cell count stays roughly constant instead of scaling with the
  // visible area — the actual fix for the zoomed-out framerate drop.
  const step = Math.max(P * 2, Math.round((P * 2) / Math.min(1, zoom)))
  ctx.fillStyle = '#16323a'
  const minX = snapDown(viewCX - halfW, step), maxX = viewCX + halfW
  const minY = snapDown(viewCY - halfH, step), maxY = viewCY + halfH
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      if (isOutsideIsland(x, y)) ctx.fillRect(x, y, step, step)
    }
  }
}

// ── Cliff band ────────────────────────────────────────────────────────────
// A rocky ring drawn just outside the coastline, before open water. Its
// height varies on its own frequencies/phase — deliberately different from
// ISLAND_HARMONICS — so the rock formation bulges and recedes independently
// instead of just tracing a fixed-width offset of the coastline.
const CLIFF_BASE_H = 70
const CLIFF_MAX_H  = 70 + 24 + 11 + 8  // conservative upper bound for culling

function cliffHeightAt(theta) {
  const wide = Math.sin(theta * 4 + 1.2) * 24    // broad bulge, own frequency
  const mid  = Math.sin(theta * 13 + 4.0) * 11   // medium irregularity
  // Fine per-angle jitter via a coarse angle bucket (256 steps around the
  // full circle) so it's stable across frames without needing continuous noise.
  const bucket = Math.floor(((theta + Math.PI) / (Math.PI * 2)) * 256)
  const jag = (hash2D(bucket, 0, 77) - 0.5) * 16
  return Math.max(28, CLIFF_BASE_H + wide + mid + jag)
}

export function drawCliffMask(ctx, viewCX, viewCY, halfW, halfH, zoom = 1) {
  const outerBound = ISLAND_MAX_R + CLIFF_MAX_H
  const nearestDist = Math.max(0, Math.hypot(viewCX, viewCY) - Math.hypot(halfW, halfH))
  if (nearestDist > outerBound) return  // pure open water, ocean mask already covers it
  const farthestDist = Math.hypot(viewCX, viewCY) + Math.hypot(halfW, halfH)
  if (farthestDist < ISLAND_MIN_R) return  // pure land, no cliff visible

  // Match the rest of the game's pixel-art block size when zoomed in, but
  // grow the block size when zoomed out so cell count doesn't scale with
  // the (much larger) visible area — same fix as the ocean mask.
  const step = Math.max(P, Math.round(P / Math.min(1, zoom)))
  const minX = snapDown(viewCX - halfW, step), maxX = viewCX + halfW
  const minY = snapDown(viewCY - halfH, step), maxY = viewCY + halfH
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const dist  = Math.hypot(x, y)
      const theta = Math.atan2(y, x)
      const landR = islandRadiusAt(theta)
      if (dist < landR) continue  // land — grass already drawn there

      const cliffH = cliffHeightAt(theta)
      const outerR = landR + cliffH
      if (dist > outerR) continue  // open water — ocean mask already covers it

      const t  = (dist - landR) / cliffH  // 0 at coastline, 1 at the waterline
      const gx = Math.round(x / step), gy = Math.round(y / step)
      const n  = hash2D(gx, gy, 501)

      let r, g, b
      if (t < 0.3)      { r = 172; g = 160; b = 138 }  // lit ledge
      else if (t < 0.7) { r = 122; g = 114; b = 100 }  // mid stone
      else              { r = 70;  g = 65;  b = 56  }  // dark base
      const shade = 0.8 + n * 0.35
      r *= shade; g *= shade; b *= shade

      // Crack seams — a coarse angular hash decides which columns get one
      const crackBucket = Math.floor(((theta + Math.PI) / (Math.PI * 2)) * 180)
      if (hash2D(crackBucket, 0, 909) > 0.85 && n > 0.4 && n < 0.6) {
        r *= 0.55; g *= 0.55; b *= 0.55
      }
      // Highlight flecks near the lit ledge
      if (t < 0.35 && n > 0.92) { r = 210; g = 200; b = 178 }

      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
      ctx.fillRect(x, y, step, step)

      // Foam right at the waterline
      if (t > 0.93) {
        ctx.fillStyle = 'rgba(210,225,222,0.5)'
        ctx.fillRect(x, y, step, step)
      }
    }
  }
}
