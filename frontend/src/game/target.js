import { pp } from './pixel'

// ── Target marker (pulsing diamond where user clicked) ───────────────────────
export function drawTarget(ctx, x, y) {
  const alpha = 0.35 + 0.25 * Math.sin(Date.now() / 140)
  const col = `rgba(255,255,255,${alpha})`
  pp(ctx, x, y,  0, -2, col)  // top
  pp(ctx, x, y, -1, -1, col)
  pp(ctx, x, y,  1, -1, col)
  pp(ctx, x, y, -2,  0, col)
  pp(ctx, x, y,  0,  0, col)  // center
  pp(ctx, x, y,  2,  0, col)
  pp(ctx, x, y, -1,  1, col)
  pp(ctx, x, y,  1,  1, col)
  pp(ctx, x, y,  0,  2, col)  // bottom
}
