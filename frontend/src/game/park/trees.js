import { P } from '../constants'
import { snap } from '../pixel'
import { hashStr, seededRand } from '../rng'

// Pixel-art silhouettes — [rowOffset, fromX, toX] technique, same as
// BALLOON_ROWS, kept blocky to match the rest of the art style.
// Fir/conifer silhouette — tapers from a point at top to a wide base.
// Generated so size is easy to retune: `height` rows tall, `maxHalfWidth`
// half-width at the base.
export function buildFirRows(height, maxHalfWidth) {
  const rows = []
  for (let i = 0; i < height; i++) {
    const ry = -(height - 1 - i)                // -(height-1) at tip .. 0 at base
    const t  = i / (height - 1)                 // 0 at tip .. 1 at base
    const halfW = Math.round(maxHalfWidth * t)
    rows.push([ry, -halfW, halfW])
  }
  return rows
}
export const TREE_CANOPY_ROWS = buildFirRows(30, 10)  // 3x taller, 2x wider than original

export function drawTree(ctx, o) {
  const cx = snap(o.cx), groundY = snap(o.cy)
  const hue = 95 + (hashStr(o.seed) % 30)
  const dark  = `hsl(${hue}, 32%, 18%)`
  const mid   = `hsl(${hue}, 38%, 26%)`
  const light = `hsl(${hue}, 42%, 34%)`
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, groundY + gy * P, P, P) }

  // Trunk
  ctx.fillStyle = '#4a3222'
  ctx.fillRect(cx - P, groundY - 2 * P, P * 2, P * 2)

  // Canopy, sat just above the trunk
  for (const [ry, from, to] of TREE_CANOPY_ROWS) {
    for (let gx = from; gx <= to; gx++) {
      const shade = seededRand(`${o.seed}_${ry}_${gx}`)
      bp(gx, ry - 2, shade > 0.7 ? light : shade > 0.35 ? mid : dark)
    }
  }
}
