import { P } from '../constants'
import { snap } from '../pixel'
import { hashStr } from '../rng'

// ── Rabbit — hops between nearby points around its home. Needs real
// per-frame state (unlike the fireflies/birds) because it has to react to
// the player's live position: normal slow ambient hopping most of the
// time, but a fast hop straight away from the player when they get close.
const RABBIT_WANDER_R     = 18
const RABBIT_FLEE_R       = 70
const RABBIT_FLEE_HOP_DUR = 0.22
const RABBIT_IDLE_HOP_DUR = 0.45

export function createRabbitState(o) {
  return {
    seed: o.seed, homeCx: o.cx, homeCy: o.cy,
    x: o.cx, y: o.cy,
    hopFrom: { x: o.cx, y: o.cy }, hopTo: { x: o.cx, y: o.cy },
    hopStart: 0, hopDuration: 0, pauseUntil: 0,
    hopArc: 0, dir: 1,
  }
}

// Mutates `r` in place. `nowSec` is a monotonically increasing clock in
// seconds (e.g. Date.now()/1000); playerX/playerY may be null if no local
// player is known yet.
export function updateRabbit(r, nowSec, playerX, playerY) {
  const distToPlayer = playerX == null ? Infinity : Math.hypot(playerX - r.x, playerY - r.y)
  const fleeing = distToPlayer < RABBIT_FLEE_R
  const elapsed = nowSec - r.hopStart

  if (elapsed < r.hopDuration) {
    const t = elapsed / r.hopDuration
    const ease = 1 - Math.pow(1 - t, 2)
    r.x = r.hopFrom.x + (r.hopTo.x - r.hopFrom.x) * ease
    r.y = r.hopFrom.y + (r.hopTo.y - r.hopFrom.y) * ease
    r.hopArc = Math.sin(t * Math.PI) * (fleeing ? 7 : 5)
    return
  }
  r.hopArc = 0
  if (!fleeing && nowSec < r.pauseUntil) return  // idle pause between ambient hops

  r.hopFrom = { x: r.x, y: r.y }
  if (fleeing) {
    // Hop directly away from the player, with a little jitter so several
    // hops in a row don't look like they're moving on rails.
    const awayAngle = Math.atan2(r.y - playerY, r.x - playerX)
    const jitter = (Math.random() - 0.5) * 0.6
    const dist = 24 + Math.random() * 10
    const tx = r.x + Math.cos(awayAngle + jitter) * dist
    const ty = r.y + Math.sin(awayAngle + jitter) * dist
    r.dir = tx >= r.x ? 1 : -1
    r.hopTo = { x: tx, y: ty }
    r.hopDuration = RABBIT_FLEE_HOP_DUR
    r.pauseUntil = 0  // no pause between flee hops — keep moving while scared
    // Home follows the rabbit while it flees, so once it settles down it
    // resumes wandering around wherever it ended up — not back at the
    // original spot, which would just walk it straight back to the player.
    r.homeCx = tx
    r.homeCy = ty
  } else {
    // Ambient wander, bounded around the home point (not cumulative from
    // the current position) so it can't drift arbitrarily far over time.
    const angle = Math.random() * Math.PI * 2
    const dist  = Math.random() * RABBIT_WANDER_R
    const tx = r.homeCx + Math.cos(angle) * dist
    const ty = r.homeCy + Math.sin(angle) * dist
    r.dir = tx >= r.x ? 1 : -1
    r.hopTo = { x: tx, y: ty }
    r.hopDuration = RABBIT_IDLE_HOP_DUR
    r.pauseUntil = nowSec + 1.5 + Math.random() * 1.5
  }
  r.hopStart = nowSec
}

export function drawRabbitAt(ctx, r) {
  const cx = snap(r.x), cy = snap(r.y - r.hopArc)
  const hue = hashStr(r.seed) % 30  // brown/gray/white-ish variance
  const col  = `hsl(${20 + hue}, 25%, ${38 + (hue % 15)}%)`
  const ear  = `hsl(${20 + hue}, 20%, 28%)`
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P * r.dir, cy + gy * P, P, P) }

  // body
  bp(0, 0, col); bp(1, 0, col)
  bp(0, -1, col); bp(1, -1, col)
  // head
  bp(1, -2, col)
  // ears
  bp(1, -3, ear); bp(2, -3, ear)
  // tail
  bp(-1, 0, '#e8e0d0')
}

// ── Bird — slow lazy loop around its home point, flies over land and water alike ──
export function drawBird(ctx, o, t) {
  const period = 12 + (hashStr(o.seed) % 400) / 100  // 12-16s per full loop
  const angle  = ((t + o.phase) / period) * Math.PI * 2
  const radius = 220
  const x = o.cx + Math.cos(angle) * radius
  const y = o.cy + Math.sin(angle) * radius * 0.5  // flattened ellipse flight path

  const flap = Math.sin(t * 8 + o.phase)
  const cx = snap(x), cy = snap(y)
  ctx.fillStyle = 'rgba(20,20,20,0.8)'
  ctx.fillRect(cx, cy - P, P, P)  // body peak
  ctx.fillRect(cx - P * (1 + Math.abs(flap)), cy, P, P)  // left wing
  ctx.fillRect(cx + P * (1 + Math.abs(flap)), cy, P, P)  // right wing
}
