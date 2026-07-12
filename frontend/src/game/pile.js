import { P, FONT } from './constants'
import { snap } from './pixel'
import { hashStr } from './rng'

// ── Pixel pile item (deflated balloon, drawn with rotation) ──────────────────
export function drawPileItem(ctx, x, y, text, angle = 0) {
  const hue = hashStr(text) % 360
  const col  = `hsl(${hue},40%,40%)`
  const colL = `hsl(${hue},40%,60%)`

  ctx.save()
  ctx.translate(snap(x), snap(y))
  ctx.rotate(angle)

  // Local pixel helper — draws at grid offset from rotated origin
  const lp = (gx, gy, c) => {
    ctx.fillStyle = c
    ctx.fillRect(gx * P, gy * P, P, P)
  }

  for (let dx = -3; dx <= 3; dx++) lp(dx,  0, col)   // middle row (widest)
  for (let dx = -2; dx <= 2; dx++) lp(dx, -1, colL)  // top row (lighter)
  for (let dx = -2; dx <= 2; dx++) lp(dx,  1, col)   // bottom row

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = `4px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.length > 7 ? text.slice(0, 5) + '…' : text, 0, 0)

  ctx.restore()
}

// ── Natural pile layout ───────────────────────────────────────────────────────
// Each item gets a seeded-random x scatter and rotation, then stacks on top of
// whatever is already beneath it at that x. Layout is stored in a Map so it's
// computed once per item and stays stable across frames.

export function placePileItem(item, layoutMap, x, y) {
  if (layoutMap.has(item.id)) return
  if (x === undefined) {
    // init path — scatter randomly around server position
    const theta  = Math.random() * Math.PI * 2
    const radius = 20 + Math.random() * 80
    x = (item.x ?? 0) + Math.cos(theta) * radius
    y = (item.y ?? 0) + Math.sin(theta) * radius
  }
  const angle = (Math.random() - 0.5) * (Math.PI / 1.2)
  layoutMap.set(item.id, { x, y, angle })
}
