import { P, COLORS } from './constants'
import { hashStr } from './rng'

export function snap(v) { return Math.round(v / P) * P }

export function playerColor(id) {
  return COLORS[hashStr(id) % COLORS.length]
}

// Draw one pixel-art "pixel" at grid offset (gx, gy) from base (bx, by)
export function pp(ctx, bx, by, gx, gy, color) {
  ctx.fillStyle = color
  ctx.fillRect(snap(bx) + gx * P, snap(by) + gy * P, P, P)
}
