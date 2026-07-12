import { P } from '../constants'
import { snap } from '../pixel'
import { hashStr, seededRand } from '../rng'

// Grid half-width/height per size, in pixel-art blocks (not world units —
// world-unit collision radius is derived below).
const BOULDER_SHAPE = {
  small:  { halfW: 5,  height: 8  },
  medium: { halfW: 8,  height: 11 },
  large:  { halfW: 12, height: 15 },
}

export const BOULDER_RADIUS = {
  small:  BOULDER_SHAPE.small.halfW  * P,
  medium: BOULDER_SHAPE.medium.halfW * P,
  large:  BOULDER_SHAPE.large.halfW  * P,
}

// Builds an irregular, asymmetric rock silhouette, seeded per-instance so
// each boulder looks distinct. Bottom rows stay full width (flat base,
// flush with the ground — implies it's embedded rather than floating);
// only the top rows taper toward a rounded, jagged peak. Per-row jitter on
// both edges keeps it angular instead of a smooth circle/oval.
function boulderRows(o) {
  const { halfW: maxHalfWidth, height } = BOULDER_SHAPE[o.size] || BOULDER_SHAPE.medium
  const rows = []
  const topTaperRows = Math.ceil(height * 0.45)
  for (let i = 0; i < height; i++) {
    const ry = i - (height - 1)  // bottom row sits at ry = 0 (ground level), rest extend upward
    let halfW
    if (i < topTaperRows) {
      const t = i / topTaperRows
      halfW = maxHalfWidth * (0.35 + 0.65 * t)
    } else {
      halfW = maxHalfWidth
    }
    const jitterL = (seededRand(`${o.seed}_bl_${i}`) - 0.5) * maxHalfWidth * 0.35
    const jitterR = (seededRand(`${o.seed}_br_${i}`) - 0.5) * maxHalfWidth * 0.35
    rows.push([ry, -Math.round(halfW - jitterL), Math.round(halfW + jitterR)])
  }
  return rows
}

export function drawBoulder(ctx, o) {
  const cx = snap(o.cx), groundY = snap(o.cy)
  const hue = hashStr(o.seed) % 360
  const dark  = `hsl(${hue}, 9%, 24%)`
  const mid   = `hsl(${hue}, 9%, 35%)`
  const light = `hsl(${hue}, 9%, 48%)`
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, groundY + gy * P, P, P) }

  for (const [ry, from, to] of boulderRows(o)) {
    for (let gx = from; gx <= to; gx++) {
      const shade = seededRand(`${o.seed}_boulder_${ry}_${gx}`)
      bp(gx, ry, shade > 0.72 ? light : shade > 0.35 ? mid : dark)
    }
  }
}
