import { P } from '../constants'
import { snap } from '../pixel'
import { hashStr, seededRand } from '../rng'

export function drawMushroom(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = hashStr(o.seed) % 360
  ctx.fillStyle = '#e8dcc8'
  ctx.fillRect(cx - P / 2, cy - P, P, P)  // stem
  ctx.fillStyle = `hsl(${hue}, 55%, 45%)`
  ctx.fillRect(cx - P, cy - 2 * P, P * 2, P)  // cap
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillRect(cx - P / 2, cy - 2 * P, P / 2, P / 2)  // cap spot
}

export function drawGrassTuft(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue   = 95 + (hashStr(o.seed) % 20)
  const shade = seededRand(o.seed + 'shade')
  ctx.fillStyle = `hsl(${hue}, ${35 + shade * 15}%, ${20 + shade * 14}%)`
  ctx.fillRect(cx, cy - P, P, P)
  if (seededRand(o.seed + 'b2') > 0.4) ctx.fillRect(cx - P, cy, P, P)
  if (seededRand(o.seed + 'b3') > 0.4) ctx.fillRect(cx + P, cy, P, P)
}

export function drawFern(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = 100 + (hashStr(o.seed) % 20)
  const col = `hsl(${hue}, 45%, 32%)`
  ctx.fillStyle = col
  ctx.fillRect(cx, cy - 3 * P, P, P)
  ctx.fillRect(cx - P, cy - 2 * P, P, P)
  ctx.fillRect(cx + P, cy - 2 * P, P, P)
  ctx.fillRect(cx - P, cy - P, P, P)
  ctx.fillRect(cx + P, cy - P, P, P)
  ctx.fillRect(cx - 2 * P, cy, P, P)
  ctx.fillRect(cx + 2 * P, cy, P, P)
}

export function drawFlower(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = hashStr(o.seed) % 360
  ctx.fillStyle = '#3a6b2a'
  ctx.fillRect(cx, cy, P, P)  // stem
  ctx.fillStyle = `hsl(${hue}, 70%, 65%)`
  ctx.fillRect(cx - P / 2, cy - P, P, P)  // bloom
}

export function drawDirtPatch(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  ctx.fillStyle = 'rgba(90,70,45,0.35)'
  const blobs = [[0, 0, 4], [-3, 1, 3], [3, -1, 3], [1, 2, 2], [-2, -2, 2]]
  for (const [dx, dy, r] of blobs) {
    ctx.fillRect(cx + dx * P - r * P / 2, cy + dy * P - r * P / 2, r * P, r * P)
  }
}

export function drawFirefly(ctx, o, t) {
  const drift = 14
  const x = o.cx + Math.cos(t * 0.6 + o.phase) * drift
  const y = o.cy + Math.sin(t * 0.5 + o.phase * 1.3) * drift - 20  // float at head height
  const alpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + o.phase))
  ctx.fillStyle = `rgba(255,244,150,${alpha * 0.4})`
  ctx.fillRect(snap(x) - P, snap(y) - P, P * 3, P * 3)  // soft outer glow
  ctx.fillStyle = `rgba(255,255,220,${alpha})`
  ctx.fillRect(snap(x), snap(y), P, P)  // bright core
}
