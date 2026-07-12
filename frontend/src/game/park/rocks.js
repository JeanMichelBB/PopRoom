import { P } from '../constants'
import { snap } from '../pixel'
import { hashStr, seededRand } from '../rng'

export const ROCK_ROWS = [
  [-1, -2, 2],
  [ 0, -3, 3],
]

export function drawRock(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = hashStr(o.seed) % 360
  const dark  = `hsl(${hue}, 8%, 30%)`
  const mid   = `hsl(${hue}, 8%, 40%)`
  const light = `hsl(${hue}, 8%, 52%)`
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, cy + gy * P, P, P) }

  for (const [ry, from, to] of ROCK_ROWS) {
    for (let gx = from; gx <= to; gx++) {
      const shade = seededRand(`${o.seed}_rock_${ry}_${gx}`)
      bp(gx, ry, shade > 0.75 ? light : shade > 0.35 ? mid : dark)
    }
  }
}
