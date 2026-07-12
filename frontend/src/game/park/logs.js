import { P } from '../constants'
import { snap } from '../pixel'

export const LOG_ROWS = [
  [-1, -6, 6],
  [ 0, -6, 6],
]

export function drawLog(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, cy + gy * P, P, P) }
  const rows = o.angled
    ? LOG_ROWS.map(([ry, from, to]) => [ry, from, to])  // same shape; angled just swaps draw axis below
    : LOG_ROWS

  for (const [ry, from, to] of rows) {
    for (let gx = from; gx <= to; gx++) {
      const c = ry === -1 ? '#6b4a30' : '#4a3222'
      if (o.angled) bp(ry, gx, c)  // transpose for a vertical-ish log
      else bp(gx, ry, c)
    }
  }
  // Cut end cap (rings) at one tip
  const capC = '#7a5a3a'
  if (o.angled) { bp(0, -6, capC); bp(-1, -6, capC); bp(1, -6, capC) }
  else { bp(6, 0, capC); bp(6, -1, capC); bp(6, 1, capC) }
}
