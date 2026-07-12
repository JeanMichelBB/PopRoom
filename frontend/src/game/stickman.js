import { P, FONT } from './constants'
import { pp, snap, playerColor } from './pixel'

// ── Pixel stickman — 4-frame walk cycle ──────────────────────────────────────
// walkFrame 0,2 = stride (feet spread)  |  walkFrame 1,3 = mid-step (feet passing)
// dir: 1 = facing right, -1 = facing left
export function drawStickman(ctx, cx, cy, name, isMe, id, walkFrame, dir, idle = false) {
  const col = isMe ? '#ffffff' : playerColor(id)
  const f   = dir ?? 1

  // Body bobs UP one pixel during mid-stride frames (1 & 3), never when idle
  const bob = (!idle && walkFrame % 2 === 1) ? -P : 0
  const ay  = cy + bob

  // Head (3×3 block)
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -14; dy <= -12; dy++)
      pp(ctx, cx, ay, dx, dy, col)

  // Body (center column, rows -11 to -6)
  for (let dy = -11; dy <= -6; dy++)
    pp(ctx, cx, ay, 0, dy, col)

  if (idle) {
    // ── IDLE POSE — arms down at sides, feet side by side ──────────────────
    // Arms hanging straight down (tips level, no swing)
    pp(ctx, cx, ay, -2, -9, col)
    pp(ctx, cx, ay, -1, -9, col)
    pp(ctx, cx, ay,  0, -9, col)
    pp(ctx, cx, ay,  1, -9, col)
    pp(ctx, cx, ay,  2, -9, col)

    // Left leg — straight down, foot flat
    pp(ctx, cx, ay, -1, -5, col)
    pp(ctx, cx, ay, -1, -4, col)
    pp(ctx, cx, ay, -1, -3, col)
    pp(ctx, cx, ay, -2, -3, col)  // left foot

    // Right leg — straight down, foot flat
    pp(ctx, cx, ay,  1, -5, col)
    pp(ctx, cx, ay,  1, -4, col)
    pp(ctx, cx, ay,  1, -3, col)
    pp(ctx, cx, ay,  2, -3, col)  // right foot
  } else {
    // ── WALK FRAMES — arms swing, feet stride ──────────────────────────────
    const lTipOff = (walkFrame === 0 || walkFrame === 1) ?  1 : -1
    const rTipOff = -lTipOff
    pp(ctx, cx, ay, -2, -9 + lTipOff, col)
    pp(ctx, cx, ay, -1, -9,            col)
    pp(ctx, cx, ay,  0, -9,            col)
    pp(ctx, cx, ay,  1, -9,            col)
    pp(ctx, cx, ay,  2, -9 + rTipOff, col)

    if (walkFrame % 2 === 0) {
      // STRIDE FRAME — front foot extended, back foot trailing
      pp(ctx, cx, ay,  1*f, -5, col)
      pp(ctx, cx, ay,  2*f, -4, col)
      pp(ctx, cx, ay,  3*f, -3, col)
      pp(ctx, cx, ay,  4*f, -3, col)  // toe forward

      pp(ctx, cx, ay, -1*f, -5, col)
      pp(ctx, cx, ay, -2*f, -4, col)
      pp(ctx, cx, ay, -2*f, -3, col)
      pp(ctx, cx, ay, -3*f, -2, col)  // heel raised
    } else {
      // MID-STRIDE FRAME — feet passing under body
      pp(ctx, cx, ay,  1*f, -5, col)
      pp(ctx, cx, ay,  1*f, -4, col)
      pp(ctx, cx, ay,  2*f, -3, col)
      pp(ctx, cx, ay,  2*f, -2, col)  // toe touching down

      pp(ctx, cx, ay, -1*f, -5, col)
      pp(ctx, cx, ay, -1*f, -4, col)
      pp(ctx, cx, ay, -1*f, -3, col)
      pp(ctx, cx, ay, -2*f, -3, col)  // toe push-off
    }
  }

  // Name tag above head
  ctx.fillStyle = col
  ctx.font = `4px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.globalAlpha = isMe ? 1 : 0.8
  ctx.fillText(name, snap(cx), snap(ay) - 15 * P)
  ctx.globalAlpha = 1
}
