import { P } from '../constants'
import { snap } from '../pixel'
import { hashStr, seededRand } from '../rng'

export const BUSH_ROWS = [
  [-2, -2, 2],
  [-1, -3, 3],
  [ 0, -3, 3],
  [ 1, -2, 2],
]

export function drawBush(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = 95 + (hashStr(o.seed) % 25)
  const dark  = `hsl(${hue}, 28%, 16%)`
  const mid   = `hsl(${hue}, 34%, 24%)`
  const light = `hsl(${hue}, 38%, 32%)`
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, cy + gy * P, P, P) }

  for (const [ry, from, to] of BUSH_ROWS) {
    for (let gx = from; gx <= to; gx++) {
      const shade = seededRand(`${o.seed}_bush_${ry}_${gx}`)
      bp(gx, ry, shade > 0.7 ? light : shade > 0.35 ? mid : dark)
    }
  }
}
