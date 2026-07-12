import { P, FONT } from './constants'
import { snap, playerColor } from './pixel'

// ── Real balloon (oval pixel-art shape, text hidden until hover) ──────────────
// Oval rows: [rowOffset, fromX, toX]
export const BALLOON_ROWS = [
  [-4, -2,  2],
  [-3, -3,  3],
  [-2, -4,  4],
  [-1, -4,  4],
  [ 0, -4,  4],
  [ 1, -3,  3],
  [ 2, -2,  2],
]
// Shine pixels (top-left highlight)
export const BALLOON_SHINE = [[-3, -2], [-2, -3], [-2, -2], [-2, -1]]  // [gy, gx]

export function drawBalloon(ctx, x, y, playerId, hovered = false, angle = 0) {
  const cx  = snap(x)
  const cy  = snap(y)
  const col = playerColor(playerId)

  if (angle) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.translate(-cx, -cy)
  }

  const bp = (gx, gy, c) => {
    ctx.fillStyle = c
    ctx.fillRect(cx + gx * P, cy + gy * P, P, P)
  }

  // On hover: draw a 1-pixel white outline just outside the oval
  if (hovered) {
    ctx.save()
    ctx.globalAlpha = 0.5
    for (const [gy, from, to] of BALLOON_ROWS) {
      bp(from - 1, gy, '#ffffff')
      bp(to   + 1, gy, '#ffffff')
    }
    bp(0, -5, '#ffffff')  // top cap
    bp(0,  4, '#ffffff')  // bottom cap
    ctx.restore()
  }

  // Body
  for (const [gy, from, to] of BALLOON_ROWS)
    for (let gx = from; gx <= to; gx++) bp(gx, gy, col)

  // Shine
  ctx.save()
  ctx.globalAlpha = 0.45
  for (const [gy, gx] of BALLOON_SHINE) bp(gx, gy, '#ffffff')
  ctx.restore()

  // Knot
  bp(-1, 3, col); bp(0, 3, col); bp(1, 3, col)
  bp( 0, 4, col)

  // Short string (3 pixels below knot)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  for (let i = 0; i < 3; i++)
    ctx.fillRect(cx, cy + (5 + i) * P, P, P)

  if (angle) ctx.restore()
}

// ── Hover bubble (speech bubble shown when mouse is over a balloon) ───────────
export function drawHoverBubble(ctx, x, y, text, playerId) {
  const col = playerColor(playerId)
  ctx.font = `6px ${FONT}`
  const tw = ctx.measureText(text).width
  const bw = Math.ceil((tw + P * 6) / P) * P
  const bh = P * 7
  const bx = snap(x - bw / 2)
  // Position the bubble above the balloon top (row -4 = cy - 4*P)
  const by = snap(y - P * 4 - bh - P * 3)

  // Dark fill
  ctx.fillStyle = '#111111'
  ctx.fillRect(bx + P, by + P, bw - P * 2, bh - P * 2)

  // Colored border
  ctx.fillStyle = col
  ctx.fillRect(bx,          by,          bw, P)
  ctx.fillRect(bx,          by + bh - P, bw, P)
  ctx.fillRect(bx,          by,          P,  bh)
  ctx.fillRect(bx + bw - P, by,          P,  bh)

  // Text
  ctx.fillStyle = '#ffffff'
  ctx.font = `6px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, snap(x), snap(by + bh / 2))

  // Arrow pointing down toward the balloon (pixel art ▼)
  const ax = snap(x)
  const ay = by + bh
  ctx.fillStyle = col
  ctx.fillRect(ax - P, ay,       P * 3, P)  // 3-wide base
  ctx.fillRect(ax,     ay + P,   P,     P)  // 1-wide tip
}

// Circular hit test matching the oval balloon (~4.5 pixel-art radii)
export function isInBalloon(mx, my, x, y) {
  const dx = mx - x, dy = my - y
  return Math.sqrt(dx * dx + dy * dy) < P * 4.5
}
