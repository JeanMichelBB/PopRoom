import { P } from '../constants'
import { snap } from '../pixel'

export const STUMP_ROWS = [
  [-2, -2, 2],
  [-1, -2, 2],
  [ 0, -2, 2],
]

export function drawStump(ctx, o) {
  const cx = snap(o.cx), groundY = snap(o.cy)
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, groundY + gy * P, P, P) }

  for (const [ry, from, to] of STUMP_ROWS) {
    for (let gx = from; gx <= to; gx++) bp(gx, ry, ry === -2 ? '#6b4a30' : '#4a3222')
  }
  // Growth rings on the cut top face
  bp(0, -2, '#7a5a3a')
  bp(-1, -2, '#5a3d26')
  bp(1, -2, '#5a3d26')
}
