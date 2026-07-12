import { P } from '../constants'
import { snap } from '../pixel'
import { hashStr, seededRand } from '../rng'

export function drawPond(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const step = P * 2
  const maxR = o.r * (1 + o.a1 + o.a2)
  ctx.fillStyle = '#1f3a44'
  for (let dy = -maxR; dy <= maxR; dy += step) {
    for (let dx = -maxR; dx <= maxR; dx += step) {
      const dist  = Math.sqrt(dx * dx + dy * dy)
      const theta = Math.atan2(dy, dx)
      const wobble = 1 + o.a1 * Math.sin(o.f1 * theta + o.p1) + o.a2 * Math.sin(o.f2 * theta + o.p2)
      if (dist > o.r * wobble) continue
      ctx.fillRect(cx + dx, cy + dy, step, step)
    }
  }
  // A few lighter "shine" blocks for texture
  ctx.fillStyle = 'rgba(180,220,230,0.25)'
  for (let i = 0; i < 5; i++) {
    const a = (hashStr(o.seed + i) % 360) * Math.PI / 180
    const rr = o.r * 0.5 * seededRand(o.seed + 'shine' + i)
    ctx.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, step, step)
  }
}

// True if (px, py) falls inside a pond's actual wobbled outline (not just
// its bounding box) — used to slow the player down while swimming.
export function isInPond(pond, px, py) {
  const dx = px - pond.cx, dy = py - pond.cy
  const dist  = Math.sqrt(dx * dx + dy * dy)
  const theta = Math.atan2(dy, dx)
  const wobble = 1 + pond.a1 * Math.sin(pond.f1 * theta + pond.p1) + pond.a2 * Math.sin(pond.f2 * theta + pond.p2)
  return dist <= pond.r * wobble
}

export function isInAnyPond(decor, px, py) {
  for (const o of decor) {
    if (o.type === 'pond' && isInPond(o, px, py)) return true
  }
  return false
}
