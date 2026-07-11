import { useEffect, useRef, useState, useCallback } from 'react'
import MessageInput from './MessageInput'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 3
const ZOOM_STEP = 0.15

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8001/ws'

// ── Pixel art config ─────────────────────────────────────────────────────────
const P    = 3     // each "pixel art pixel" = P×P real canvas pixels
const FONT = '"Press Start 2P", monospace'
const SPEED = 2.5  // pixels per frame toward click target

const COLORS = ['#00ff88', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94', '#c3a6ff', '#ffd93d']

function hashStr(str) {
  let h = 0
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return Math.abs(h)
}

function playerColor(id) {
  return COLORS[hashStr(id) % COLORS.length]
}

function snap(v) { return Math.round(v / P) * P }

// Deterministic 0‥1 value from a string seed — FNV-1a, full 32-bit range
function seededRand(seed) {
  let h = 2166136261 >>> 0
  for (const c of String(seed)) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h / 0xFFFFFFFF
}

// Deterministic 0‥1 value from (bx, by, salt) via integer mixing (Murmur3-style
// finalizer). String-based hashes like seededRand don't diffuse well over very
// short, near-identical inputs (e.g. "pond_-1_0" vs "pond_-1_1") — that showed
// up as ponds banding along a single column instead of scattering naturally.
// Multiplying each coordinate by a large odd constant before mixing avoids it.
function hash2D(bx, by, salt) {
  let h = (Math.imul(bx, 374761393) + Math.imul(by, 668265263) + Math.imul(salt, 2246822519)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  h ^= h >>> 16
  return (h >>> 0) / 0xFFFFFFFF
}

// Draw one pixel-art "pixel" at grid offset (gx, gy) from base (bx, by)
function pp(ctx, bx, by, gx, gy, color) {
  ctx.fillStyle = color
  ctx.fillRect(snap(bx) + gx * P, snap(by) + gy * P, P, P)
}

// ── Pixel stickman — 4-frame walk cycle ──────────────────────────────────────
// walkFrame 0,2 = stride (feet spread)  |  walkFrame 1,3 = mid-step (feet passing)
// dir: 1 = facing right, -1 = facing left
function drawStickman(ctx, cx, cy, name, isMe, id, walkFrame, dir, idle = false) {
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

// ── Target marker (pulsing diamond where user clicked) ───────────────────────
function drawTarget(ctx, x, y) {
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

// ── Real balloon (oval pixel-art shape, text hidden until hover) ──────────────
// Oval rows: [rowOffset, fromX, toX]
const BALLOON_ROWS = [
  [-4, -2,  2],
  [-3, -3,  3],
  [-2, -4,  4],
  [-1, -4,  4],
  [ 0, -4,  4],
  [ 1, -3,  3],
  [ 2, -2,  2],
]
// Shine pixels (top-left highlight)
const BALLOON_SHINE = [[-3, -2], [-2, -3], [-2, -2], [-2, -1]]  // [gy, gx]

function drawBalloon(ctx, x, y, playerId, hovered = false, angle = 0) {
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
function drawHoverBubble(ctx, x, y, text, playerId) {
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
function isInBalloon(mx, my, x, y) {
  const dx = mx - x, dy = my - y
  return Math.sqrt(dx * dx + dy * dy) < P * 4.5
}

// ── Pixel pile item (deflated balloon, drawn with rotation) ──────────────────
function drawPileItem(ctx, x, y, text, angle = 0) {
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

// ── Park background (trees, bushes, rocks, stumps, logs, pond — all
// collidable — plus non-collidable decor: mushrooms, ferns, flowers, dirt
// patches, and ambient fireflies) ────────────────────────────────────────────
const PARK_CELL   = 90   // scatter grid pitch (world units)
const PARK_EXTENT = 30   // grid spans -30..30 cells each axis — covers well past any normal viewport, even zoomed out
const PLAYER_R    = P * 3  // collision radius around player feet

// Pixel-art silhouettes — [rowOffset, fromX, toX] technique, same as
// BALLOON_ROWS, kept blocky to match the rest of the art style.
function buildFirRows(height, maxHalfWidth) {
  const rows = []
  for (let i = 0; i < height; i++) {
    const ry = -(height - 1 - i)                // -(height-1) at tip .. 0 at base
    const t  = i / (height - 1)                 // 0 at tip .. 1 at base
    const halfW = Math.round(maxHalfWidth * t)
    rows.push([ry, -halfW, halfW])
  }
  return rows
}
const TREE_CANOPY_ROWS = buildFirRows(30, 10)  // 3x taller, 2x wider than original
const BUSH_ROWS = [
  [-2, -2, 2],
  [-1, -3, 3],
  [ 0, -3, 3],
  [ 1, -2, 2],
]
const ROCK_ROWS = [
  [-1, -2, 2],
  [ 0, -3, 3],
]
const STUMP_ROWS = [
  [-2, -2, 2],
  [-1, -2, 2],
  [ 0, -2, 2],
]
const LOG_ROWS = [
  [-1, -6, 6],
  [ 0, -6, 6],
]

// Deterministic scattered park centered on the player's spawn point, with a
// clearing left open around the origin. Sparse + jittered so it reads as
// naturally placed rather than gridded. Returns { obstacles, decor } —
// obstacles block movement, decor is purely visual (too low-profile to need
// occlusion sorting against players).
function buildParkObstacles(originX, originY) {
  const obstacles = []
  const decor = []

  // ── Ponds — rare, larger features placed on a coarser grid so they don't
  // tile like the small scatter items. Nearby cells skip normal decoration
  // so trees/bushes don't spawn inside the water. ──
  const WORLD_EDGE = PARK_EXTENT * PARK_CELL  // true edge of the populated (tree/grass) region
  const ponds = []
  const POND_BLOCK = PARK_CELL * 8
  const pondRange  = Math.ceil(WORLD_EDGE / POND_BLOCK) + 1
  for (let by = -pondRange; by <= pondRange; by++) {
    for (let bx = -pondRange; bx <= pondRange; bx++) {
      const seed = `pond_${bx}_${by}`
      if (hash2D(bx, by, 1) > 0.12) continue  // ~12% of coarse blocks get a pond
      const jx = (hash2D(bx, by, 2) - 0.5) * POND_BLOCK * 0.5
      const jy = (hash2D(bx, by, 3) - 0.5) * POND_BLOCK * 0.5
      const cx = originX + bx * POND_BLOCK + jx
      const cy = originY + by * POND_BLOCK + jy
      if (Math.abs(cx - originX) < 350 && Math.abs(cy - originY) < 350) continue  // keep spawn clear
      // Clamp to the actual populated region — the coarse block grid can
      // overshoot past where any trees/grass exist, which reads as "outside
      // the map" rather than scattered naturally through it.
      if (Math.abs(cx - originX) > WORLD_EDGE - 300 || Math.abs(cy - originY) > WORLD_EDGE - 300) continue
      const r = PARK_CELL * (1.8 + hash2D(bx, by, 4) * 0.8)
      // Radius wobble — two sine harmonics give an organic, non-circular
      // outline (a broad 2-3 lobe bulge plus finer irregularity) instead of
      // a perfect circle. Fixed per-pond so the shape is stable and
      // identical across every client.
      const a1 = 0.15 + hash2D(bx, by, 5) * 0.15
      const f1 = 2 + Math.floor(hash2D(bx, by, 6) * 2)       // 2-3 broad lobes
      const p1 = hash2D(bx, by, 7) * Math.PI * 2
      const a2 = 0.08 + hash2D(bx, by, 8) * 0.1
      const f2 = 4 + Math.floor(hash2D(bx, by, 9) * 3)       // 4-6 finer wobbles
      const p2 = hash2D(bx, by, 10) * Math.PI * 2
      const maxR = r * (1 + a1 + a2)
      ponds.push({ cx, cy, r, maxR, a1, f1, p1, a2, f2, p2, seed })
    }
  }
  for (const pond of ponds) {
    // Pond is decor only, not a hard obstacle — walking into water slows the
    // player down (see isInPond / the movement step) rather than blocking them.
    const o = { type: 'pond', cx: pond.cx, cy: pond.cy, r: pond.r, seed: pond.seed,
                a1: pond.a1, f1: pond.f1, p1: pond.p1, a2: pond.a2, f2: pond.f2, p2: pond.p2 }
    decor.push(o)
  }
  const nearAnyPond = (cx, cy) => ponds.some(p => {
    const dx = cx - p.cx, dy = cy - p.cy
    return Math.sqrt(dx * dx + dy * dy) < p.maxR + PARK_CELL
  })

  // ── Grass tufts — dense ground-level texture, fine grid, no collision.
  // Drawn as a base layer so mushrooms/flowers/dirt patches sit on top of it. ──
  const GRASS_CELL  = 32
  const grassRange  = Math.ceil((PARK_EXTENT * PARK_CELL) / GRASS_CELL)
  for (let gy = -grassRange; gy <= grassRange; gy++) {
    for (let gx = -grassRange; gx <= grassRange; gx++) {
      const seed = `grass_${gx}_${gy}`
      if (seededRand(seed) > 0.45) continue  // ~45% fill — dense but patchy, not solid
      const jx = (seededRand(seed + 'jx') - 0.5) * GRASS_CELL
      const jy = (seededRand(seed + 'jy') - 0.5) * GRASS_CELL
      const cx = originX + gx * GRASS_CELL + jx
      const cy = originY + gy * GRASS_CELL + jy
      if (nearAnyPond(cx, cy)) continue  // no grass floating on water
      decor.push({ type: 'grass', cx, cy, seed })
    }
  }

  for (let gy = -PARK_EXTENT; gy <= PARK_EXTENT; gy++) {
    // Stagger alternating rows by half a cell so the scatter doesn't read as
    // a visible grid (like brick/hex offset rather than straight columns)
    const rowOffset = (gy % 2 !== 0) ? PARK_CELL / 2 : 0

    for (let gx = -PARK_EXTENT; gx <= PARK_EXTENT; gx++) {
      if (Math.abs(gx) <= 1 && Math.abs(gy) <= 1) continue  // spawn clearing
      const seed = `park_${gx}_${gy}`
      const r = seededRand(seed)
      if (r < 0.45) continue  // most cells stay empty grass

      const jx = (seededRand(seed + 'jx') - 0.5) * (PARK_CELL * 0.95)
      const jy = (seededRand(seed + 'jy') - 0.5) * (PARK_CELL * 0.95)
      const cx = originX + gx * PARK_CELL + rowOffset + jx
      const cy = originY + gy * PARK_CELL + jy

      if (nearAnyPond(cx, cy)) continue  // keep pond edges clear

      // r in (0.45, 1.0]: tree 38% / bush 7% / rock 3% / stump 2% / log 1.5%
      // / mushroom 1% / fern 1% / flower 1.5% (decor)
      if (r < 0.83) {
        const tr = P * 2  // collision only at the trunk, so the canopy can overhang
        obstacles.push({ type: 'tree', cx, cy, seed, x: cx - tr, y: cy - tr, w: tr * 2, h: tr * 2 })
      } else if (r < 0.90) {
        const br = P * 3.5
        obstacles.push({ type: 'bush', cx, cy, seed, x: cx - br, y: cy - br, w: br * 2, h: br * 2 })
      } else if (r < 0.93) {
        const rr = P * 2.5
        obstacles.push({ type: 'rock', cx, cy, seed, x: cx - rr, y: cy - rr, w: rr * 2, h: rr * 2 })
      } else if (r < 0.95) {
        const sr = P * 2
        obstacles.push({ type: 'stump', cx, cy, seed, x: cx - sr, y: cy - sr, w: sr * 2, h: sr * 2 })
      } else if (r < 0.965) {
        const angled = seededRand(seed + 'rot') > 0.5
        const lw = angled ? P * 3 : P * 7
        const lh = angled ? P * 7 : P * 3
        obstacles.push({ type: 'log', cx, cy, seed, angled, x: cx - lw, y: cy - lh, w: lw * 2, h: lh * 2 })
      } else if (r < 0.975) {
        decor.push({ type: 'mushroom', cx, cy, seed })
      } else if (r < 0.985) {
        decor.push({ type: 'fern', cx, cy, seed })
      } else {
        decor.push({ type: 'flower', cx, cy, seed })
      }
    }
  }

  // ── Dirt patches — sparse worn-ground blotches, coarser grid, no collision ──
  const DIRT_BLOCK = PARK_CELL * 3
  const dirtRange  = Math.ceil(WORLD_EDGE / DIRT_BLOCK) + 1
  for (let by = -dirtRange; by <= dirtRange; by++) {
    for (let bx = -dirtRange; bx <= dirtRange; bx++) {
      const seed = `dirt_${bx}_${by}`
      if (hash2D(bx, by, 21) > 0.1) continue  // ~10% of blocks get a dirt patch
      const jx = (hash2D(bx, by, 22) - 0.5) * DIRT_BLOCK * 0.6
      const jy = (hash2D(bx, by, 23) - 0.5) * DIRT_BLOCK * 0.6
      const cx = originX + bx * DIRT_BLOCK + jx
      const cy = originY + by * DIRT_BLOCK + jy
      if (Math.abs(cx - originX) > WORLD_EDGE || Math.abs(cy - originY) > WORLD_EDGE) continue
      decor.push({ type: 'dirt', cx, cy, seed })
    }
  }

  // ── Fireflies — sparse ambient particles, animated per-frame, no collision ──
  const FIREFLY_BLOCK = PARK_CELL * 2.5
  const fireflyRange  = Math.ceil(WORLD_EDGE / FIREFLY_BLOCK) + 1
  for (let by = -fireflyRange; by <= fireflyRange; by++) {
    for (let bx = -fireflyRange; bx <= fireflyRange; bx++) {
      const seed = `firefly_${bx}_${by}`
      if (hash2D(bx, by, 31) > 0.15) continue  // ~15% of blocks get a firefly
      const jx = (hash2D(bx, by, 32) - 0.5) * FIREFLY_BLOCK
      const jy = (hash2D(bx, by, 33) - 0.5) * FIREFLY_BLOCK
      const fcx = originX + bx * FIREFLY_BLOCK + jx
      const fcy = originY + by * FIREFLY_BLOCK + jy
      if (Math.abs(fcx - originX) > WORLD_EDGE || Math.abs(fcy - originY) > WORLD_EDGE) continue
      decor.push({
        type: 'firefly', seed,
        cx: fcx,
        cy: fcy,
        phase: seededRand(seed + 'phase') * Math.PI * 2,
      })
    }
  }

  return { obstacles, decor }
}

function drawTree(ctx, o) {
  const cx = snap(o.cx), groundY = snap(o.cy)
  const hue = 95 + (hashStr(o.seed) % 30)
  const dark  = `hsl(${hue}, 32%, 18%)`
  const mid   = `hsl(${hue}, 38%, 26%)`
  const light = `hsl(${hue}, 42%, 34%)`
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, groundY + gy * P, P, P) }

  // Trunk
  ctx.fillStyle = '#4a3222'
  ctx.fillRect(cx - P, groundY - 2 * P, P * 2, P * 2)

  // Canopy, sat just above the trunk
  for (const [ry, from, to] of TREE_CANOPY_ROWS) {
    for (let gx = from; gx <= to; gx++) {
      const shade = seededRand(`${o.seed}_${ry}_${gx}`)
      bp(gx, ry - 2, shade > 0.7 ? light : shade > 0.35 ? mid : dark)
    }
  }
}

function drawBush(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = 95 + (hashStr(o.seed) % 25)
  const dark  = `hsl(${hue}, 28%, 16%)`
  const mid   = `hsl(${hue}, 34%, 24%)`
  const light = `hsl(${hue}, 38%, 32%)`
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, cy + gy * P, P, P) }

  for (const [ry, from, to] of BUSH_ROWS) {
    for (let gx = from; gx <= to; gx++) {
      const shade = seededRand(`${o.seed}_bush_${ry}_${gx}`)
      bp(gx, ry, shade > 0.7 ? light : shade > 0.35 ? mid : dark)
    }
  }
}

function drawRock(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = hashStr(o.seed) % 360
  const dark  = `hsl(${hue}, 8%, 30%)`
  const mid   = `hsl(${hue}, 8%, 40%)`
  const light = `hsl(${hue}, 8%, 52%)`
  const bp = (gx, gy, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * P, cy + gy * P, P, P) }

  for (const [ry, from, to] of ROCK_ROWS) {
    for (let gx = from; gx <= to; gx++) {
      const shade = seededRand(`${o.seed}_rock_${ry}_${gx}`)
      bp(gx, ry, shade > 0.75 ? light : shade > 0.35 ? mid : dark)
    }
  }
}

function drawStump(ctx, o) {
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

function drawLog(ctx, o) {
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

function drawPond(ctx, o) {
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

function drawMushroom(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = hashStr(o.seed) % 360
  ctx.fillStyle = '#e8dcc8'
  ctx.fillRect(cx - P / 2, cy - P, P, P)  // stem
  ctx.fillStyle = `hsl(${hue}, 55%, 45%)`
  ctx.fillRect(cx - P, cy - 2 * P, P * 2, P)  // cap
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillRect(cx - P / 2, cy - 2 * P, P / 2, P / 2)  // cap spot
}

function drawGrassTuft(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue   = 95 + (hashStr(o.seed) % 20)
  const shade = seededRand(o.seed + 'shade')
  ctx.fillStyle = `hsl(${hue}, ${35 + shade * 15}%, ${20 + shade * 14}%)`
  ctx.fillRect(cx, cy - P, P, P)
  if (seededRand(o.seed + 'b2') > 0.4) ctx.fillRect(cx - P, cy, P, P)
  if (seededRand(o.seed + 'b3') > 0.4) ctx.fillRect(cx + P, cy, P, P)
}

function drawFern(ctx, o) {
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

function drawFlower(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  const hue = hashStr(o.seed) % 360
  ctx.fillStyle = '#3a6b2a'
  ctx.fillRect(cx, cy, P, P)  // stem
  ctx.fillStyle = `hsl(${hue}, 70%, 65%)`
  ctx.fillRect(cx - P / 2, cy - P, P, P)  // bloom
}

function drawDirtPatch(ctx, o) {
  const cx = snap(o.cx), cy = snap(o.cy)
  ctx.fillStyle = 'rgba(90,70,45,0.35)'
  const blobs = [[0, 0, 4], [-3, 1, 3], [3, -1, 3], [1, 2, 2], [-2, -2, 2]]
  for (const [dx, dy, r] of blobs) {
    ctx.fillRect(cx + dx * P - r * P / 2, cy + dy * P - r * P / 2, r * P, r * P)
  }
}

function drawFirefly(ctx, o, t) {
  const drift = 14
  const x = o.cx + Math.cos(t * 0.6 + o.phase) * drift
  const y = o.cy + Math.sin(t * 0.5 + o.phase * 1.3) * drift - 20  // float at head height
  const alpha = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + o.phase))
  ctx.fillStyle = `rgba(255,244,150,${alpha * 0.4})`
  ctx.fillRect(snap(x) - P, snap(y) - P, P * 3, P * 3)  // soft outer glow
  ctx.fillStyle = `rgba(255,255,220,${alpha})`
  ctx.fillRect(snap(x), snap(y), P, P)  // bright core
}

// Built once at a fixed world origin so every client sees the same map —
// obstacles must line up regardless of where each player happens to spawn.
const { obstacles: PARK_OBSTACLES, decor: PARK_DECOR } = buildParkObstacles(0, 0)

// True if a player standing at (px, py) would overlap any obstacle
function isBlocked(px, py, obstacles) {
  for (const o of obstacles) {
    if (px + PLAYER_R > o.x && px - PLAYER_R < o.x + o.w &&
        py + PLAYER_R > o.y && py - PLAYER_R < o.y + o.h) return true
  }
  return false
}

// True if (px, py) falls inside a pond's actual wobbled outline (not just
// its bounding box) — used to slow the player down while swimming.
function isInPond(pond, px, py) {
  const dx = px - pond.cx, dy = py - pond.cy
  const dist  = Math.sqrt(dx * dx + dy * dy)
  const theta = Math.atan2(dy, dx)
  const wobble = 1 + pond.a1 * Math.sin(pond.f1 * theta + pond.p1) + pond.a2 * Math.sin(pond.f2 * theta + pond.p2)
  return dist <= pond.r * wobble
}

function isInAnyPond(decor, px, py) {
  for (const o of decor) {
    if (o.type === 'pond' && isInPond(o, px, py)) return true
  }
  return false
}

// ── Natural pile layout ───────────────────────────────────────────────────────
// Each item gets a seeded-random x scatter and rotation, then stacks on top of
// whatever is already beneath it at that x. Layout is stored in a Map so it's
// computed once per item and stays stable across frames.

function placePileItem(item, layoutMap, x, y) {
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function GameCanvas({ playerName }) {
  const canvasRef = useRef(null)
  const wsRef     = useRef(null)
  const sendRef   = useRef(null)
  const stateRef  = useRef({
    myId: null,
    players: {},   // id → {id, name, x, y}
    balloons: {},  // id → {id, player_id, text, x, y, floatY, createdAt}
    falling: {},   // id → {text, x, currentY, targetY, pile_item}
    pile: [],          // [{id, text, player_name, x, y}]
    pileLayout: new Map(), // id → {x, y, angle} — client-side display positions
    hoveredBalloon: null,
    moveTarget: null,   // {x, y} — where the local player is walking to
    walkTick: 0,        // increments each frame while moving
    facingDir: 1,       // 1 = right, -1 = left
    lastSentMove: 0,
    camX: 0,            // camera world offset X
    camY: 0,            // camera world offset Y
    zoom: 1,            // viewport zoom level (current, interpolated)
    zoomTarget: 1,      // zoom level we're animating toward
    resetting: false,   // true while auto-reset animation is running
    npc: null,          // lazy-initialized janitor bot
    parkObstacles: [],  // collidable park objects around spawn (trees, bushes, rocks, stumps, logs)
    parkDecor: [],      // non-collidable decor (pond, mushrooms, ferns, flowers, dirt patches, fireflies)
  })
  const rafRef     = useRef(null)
  const zoomReset  = useRef(null)
  const [connected, setConnected] = useState(false)
  const [zoomDisplay, setZoomDisplay] = useState(100)

  const sendWS = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify(data))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const s      = stateRef.current

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // ── WebSocket ──
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    sendRef.current = (text) => sendWS({ event: 'message', text })

    ws.onopen = () => {
      // Spawn scattered within the shared clearing (the empty center cells
      // of PARK_OBSTACLES) so every client's park layout lines up.
      const x = (Math.random() - 0.5) * (PARK_CELL * 1.4)
      const y = (Math.random() - 0.5) * (PARK_CELL * 1.4)
      s.parkObstacles = PARK_OBSTACLES
      s.parkDecor = PARK_DECOR
      sendWS({ event: 'join', name: playerName, x, y })
      setConnected(true)
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.event) {
        case 'ping':
          ws.send(JSON.stringify({ event: 'pong' }))
          return
        case 'init':
          s.myId    = msg.your_id
          s.players = Object.fromEntries(msg.players.map(p => [p.id, p]))
          s.balloons = Object.fromEntries(
            msg.balloons.map(b => [b.id, { ...b, floatY: b.y, createdAt: Date.now() }])
          )
          s.pile = msg.pile
          s.pileLayout.clear()
          for (const item of msg.pile) placePileItem(item, s.pileLayout)
          break
        case 'player_joined':
          s.players[msg.player.id] = msg.player
          break
        case 'player_left':
          delete s.players[msg.player_id]
          break
        case 'player_moved':
          if (s.players[msg.player_id]) {
            const p = s.players[msg.player_id]
            const dx = msg.x - p.x
            if (Math.abs(dx) > 0.5) p.facingDir = dx > 0 ? 1 : -1
            p.x = msg.x
            p.y = msg.y
            p.lastMoved = Date.now()
          }
          break
        case 'new_balloon': {
          const b = msg.balloon
          s.balloons[b.id] = { ...b, floatY: b.y, createdAt: Date.now() }
          break
        }
        case 'pile_item_cleaned': {
          s.pile       = s.pile.filter(i => i.id !== msg.pile_item_id)
          s.pileLayout.delete(msg.pile_item_id)
          break
        }
        case 'balloon_popped': {
          const b = s.balloons[msg.balloon_id]
          if (b) {
            const originX  = msg.pile_item?.x ?? b.x
            const originY  = msg.pile_item?.y ?? (b.y + 70)
            const theta    = Math.random() * Math.PI * 2
            const radius   = 20 + Math.random() * 80
            const targetX  = originX + Math.cos(theta) * radius
            const targetY  = originY + Math.sin(theta) * radius
            const maxAngle = (Math.random() < 0.5 ? 1 : -1) *
                             (Math.PI / 4 + Math.random() * Math.PI / 4)
            s.falling[msg.balloon_id] = {
              ...b,
              startX:    b.x,
              startY:    b.floatY,
              currentX:  b.x,
              currentY:  b.floatY,
              targetX,
              targetY,
              progress:  0,
              angle:     0,
              maxAngle,
              pile_item: msg.pile_item,
            }
            delete s.balloons[msg.balloon_id]
          }
          break
        }
      }
    }

    ws.onclose = () => setConnected(false)

    // ── Screen → world coordinate conversion ──
    // Transform: translate(w/2,h/2) -> scale(zoom) -> translate(-w/2,-h/2) -> translate(-camX,-camY)
    // Inverse:   wx = (sx - w/2) / zoom + w/2 + camX
    const toWorld = (sx, sy) => ({
      x: (sx - canvas.width  / 2) / s.zoom + canvas.width  / 2 + s.camX,
      y: (sy - canvas.height / 2) / s.zoom + canvas.height / 2 + s.camY,
    })

    // ── Mouse events ──
    const onMouseDown = (e) => {
      const { x: mx, y: my } = toWorld(e.clientX, e.clientY)

      // Balloon click → pop (priority)
      for (const [bid, b] of Object.entries(s.balloons)) {
        if (isInBalloon(mx, my, b.x, b.floatY)) {
          sendWS({ event: 'pop', balloon_id: bid })
          return
        }
      }

      // Canvas click → walk to that position (world coords)
      s.moveTarget = { x: mx, y: my }
    }

    const onMouseMove = (e) => {
      const { x: mx, y: my } = toWorld(e.clientX, e.clientY)
      s.hoveredBalloon = null
      for (const [bid, b] of Object.entries(s.balloons)) {
        if (isInBalloon(mx, my, b.x, b.floatY)) {
          s.hoveredBalloon = bid
          break
        }
      }
    }

    const applyZoom = (newZoom, pivotSx, pivotSy) => {
      const oldZoom = s.zoom
      s.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom))
      s.zoomTarget = s.zoom
      s.resetting = false
      // Shift camera so world point under pivot stays fixed
      const px = pivotSx - canvas.width  / 2
      const py = pivotSy - canvas.height / 2
      s.camX += px * (1 / oldZoom - 1 / s.zoom)
      s.camY += py * (1 / oldZoom - 1 / s.zoom)
      setZoomDisplay(Math.round(s.zoom * 100))
      // Smoothly animate back to 100% after 5 s of inactivity
      clearTimeout(zoomReset.current)
      zoomReset.current = setTimeout(() => { s.zoomTarget = 1; s.resetting = true }, 3000)
    }

    const onWheel = (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP
      applyZoom(s.zoom * factor, e.clientX, e.clientY)
    }

    const onKeyDown = (e) => {
      if (e.ctrlKey && (e.key === '0' || e.key === 'NumPad0')) {
        e.preventDefault()
        applyZoom(1, canvas.width / 2, canvas.height / 2)
      }
    }

    // ── Touch events (mobile) ──
    let lastTouchDist = null  // null = no active pinch

    const touchDist = (t1, t2) => {
      const dx = t1.clientX - t2.clientX
      const dy = t1.clientY - t2.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }
    const touchMid = (t1, t2) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    })

    const onTouchStart = (e) => {
      e.preventDefault()
      if (e.touches.length === 2) {
        lastTouchDist = touchDist(e.touches[0], e.touches[1])
      } else if (e.touches.length === 1) {
        lastTouchDist = null
        // Treat as tap/move — reuse mouse logic
        onMouseDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY })
      }
    }

    const onTouchMove = (e) => {
      e.preventDefault()
      if (e.touches.length === 2) {
        const newDist = touchDist(e.touches[0], e.touches[1])
        if (lastTouchDist !== null) {
          const { x: mx, y: my } = touchMid(e.touches[0], e.touches[1])
          applyZoom(s.zoom * (newDist / lastTouchDist), mx, my)
        }
        lastTouchDist = newDist
      } else if (e.touches.length === 1) {
        lastTouchDist = null
        onMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY })
      }
    }

    const onTouchEnd = (e) => {
      e.preventDefault()
      if (e.touches.length < 2) lastTouchDist = null
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('touchstart',  onTouchStart, { passive: false })
    canvas.addEventListener('touchmove',   onTouchMove,  { passive: false })
    canvas.addEventListener('touchend',    onTouchEnd,   { passive: false })
    window.addEventListener('keydown', onKeyDown)

    // ── Render loop ──
    const render = () => {
      ctx.imageSmoothingEnabled = false

      // Ground — visible forest-floor green instead of flat black
      ctx.fillStyle = '#1c3018'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      if (s.myId && s.players[s.myId]) {
        const p = s.players[s.myId]

        if (s.resetting) {
          // Animate zoom + camera back to player-centered 100%
          s.zoom += (s.zoomTarget - s.zoom) * 0.08
          if (Math.abs(s.zoom - s.zoomTarget) < 0.001) s.zoom = s.zoomTarget
          setZoomDisplay(Math.round(s.zoom * 100))

          const targetCamX = p.x - canvas.width  / 2
          const targetCamY = p.y - canvas.height / 2
          s.camX += (targetCamX - s.camX) * 0.08
          s.camY += (targetCamY - s.camY) * 0.08

          if (s.zoom === s.zoomTarget &&
              Math.abs(s.camX - targetCamX) < 0.5 &&
              Math.abs(s.camY - targetCamY) < 0.5) {
            s.camX = targetCamX
            s.camY = targetCamY
            s.resetting = false
          }
        } else {
          // Normal edge-follow
          const EDGE = 250
          const sx = (p.x - s.camX - canvas.width  / 2) * s.zoom + canvas.width  / 2
          const sy = (p.y - s.camY - canvas.height / 2) * s.zoom + canvas.height / 2
          const ox = Math.max(0, EDGE - Math.min(sx, canvas.width  - sx)) / EDGE
          const oy = Math.max(0, EDGE - Math.min(sy, canvas.height - sy)) / EDGE
          s.camX += (p.x - canvas.width  / 2 - s.camX) * ox * 0.05
          s.camY += (p.y - canvas.height / 2 - s.camY) * oy * 0.05
        }
      }

      // Apply camera + zoom transform for all world-space objects
      ctx.save()
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.scale(s.zoom, s.zoom)
      ctx.translate(-canvas.width / 2, -canvas.height / 2)
      ctx.translate(-Math.round(s.camX), -Math.round(s.camY))

      // ── Flat ground decor (pond, dirt patches, mushrooms, ferns, flowers) ──
      // Drawn early since these are too low-profile to need occlusion
      // sorting against players. Fireflies are drawn later, on top.
      {
        const viewCX  = s.camX + canvas.width  / 2
        const viewCY  = s.camY + canvas.height / 2
        const marginX = canvas.width  / (2 * s.zoom) + 150
        const marginY = canvas.height / (2 * s.zoom) + 150
        for (const o of s.parkDecor) {
          if (o.type === 'firefly') continue  // drawn later, on top
          if (Math.abs(o.cx - viewCX) > marginX || Math.abs(o.cy - viewCY) > marginY) continue
          if (o.type === 'pond') drawPond(ctx, o)
          else if (o.type === 'grass') drawGrassTuft(ctx, o)
          else if (o.type === 'dirt') drawDirtPatch(ctx, o)
          else if (o.type === 'mushroom') drawMushroom(ctx, o)
          else if (o.type === 'fern') drawFern(ctx, o)
          else if (o.type === 'flower') drawFlower(ctx, o)
        }
      }

      // ── Move local player toward click target ──
      if (s.moveTarget && s.myId && s.players[s.myId]) {
        const p  = s.players[s.myId]
        const dx = s.moveTarget.x - p.x
        const dy = s.moveTarget.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        // Swimming — standing in water slows movement instead of blocking it
        const speed = isInAnyPond(s.parkDecor, p.x, p.y) ? SPEED * 0.35 : SPEED

        if (dist < speed) {
          // Arrived
          if (!isBlocked(s.moveTarget.x, s.moveTarget.y, s.parkObstacles)) {
            p.x = s.moveTarget.x
            p.y = s.moveTarget.y
          }
          s.moveTarget = null
          s.walkTick   = 0
          sendWS({ event: 'move', x: p.x, y: p.y })
        } else {
          // Step toward target, sliding along walls on collision
          if (dx !== 0) s.facingDir = dx > 0 ? 1 : -1
          const stepX = (dx / dist) * speed
          const stepY = (dy / dist) * speed
          const nx = p.x + stepX
          const ny = p.y + stepY

          if (!isBlocked(nx, ny, s.parkObstacles)) {
            p.x = nx; p.y = ny
          } else if (!isBlocked(nx, p.y, s.parkObstacles)) {
            p.x = nx  // slide horizontally along the wall
          } else if (!isBlocked(p.x, ny, s.parkObstacles)) {
            p.y = ny  // slide vertically along the wall
          } else {
            // Fully boxed in — stop trying toward this target
            s.moveTarget = null
          }
          s.walkTick++

          // Throttle WS to ~30fps
          const now = Date.now()
          if (now - s.lastSentMove > 33) {
            sendWS({ event: 'move', x: p.x, y: p.y })
            s.lastSentMove = now
          }
        }
      }

      // ── Janitor NPC (position/logic only — drawn in the y-sorted pass below) ──
      const NPC_SPEED    = 1.0
      const NPC_PICKUP_R = 12

      // Lazy-init: spawn offscreen near the floor once we know where the player is
      if (!s.npc && s.myId && s.players[s.myId]) {
        const p = s.players[s.myId]
        s.npc = { x: p.x - 200, y: p.y, walkTick: 0, facingDir: 1, targetId: null, pickupPause: 0 }
      }

      if (s.npc) {
        const npc = s.npc

        // While pausing after a pickup, count down then resume
        if (npc.pickupPause > 0) {
          npc.pickupPause--
        } else {
          // Re-target if current target was removed
          if (npc.targetId && !s.pileLayout.has(npc.targetId)) npc.targetId = null

          // Pick nearest pile item
          if (!npc.targetId && s.pile.length > 0) {
            let nearest = null, nearestDist = Infinity
            for (const item of s.pile) {
              const pos = s.pileLayout.get(item.id)
              if (!pos) continue
              const dx = pos.x - npc.x, dy = pos.y - npc.y
              const d  = Math.sqrt(dx * dx + dy * dy)
              if (d < nearestDist) { nearestDist = d; nearest = item.id }
            }
            npc.targetId = nearest
          }

          if (npc.targetId) {
            const pos = s.pileLayout.get(npc.targetId)
            if (pos) {
              const dx   = pos.x - npc.x
              const dy   = pos.y - npc.y
              const dist = Math.sqrt(dx * dx + dy * dy)

              if (dist < NPC_PICKUP_R) {
                // Notify server → deletes from DB + broadcasts to all clients
                sendWS({ event: 'clean', pile_item_id: npc.targetId })
                npc.targetId    = null
                npc.walkTick    = 0
                npc.pickupPause = 30  // ~0.5 s pause
              } else {
                npc.facingDir = dx > 0 ? 1 : -1
                npc.x += (dx / dist) * NPC_SPEED
                npc.y += (dy / dist) * NPC_SPEED
                npc.walkTick++
              }
            }
          }
        }
      }

      // ── Y-sorted ground layer: trees, bushes, NPC, players ──
      // Draw order follows each entity's ground y so nearer things (larger y)
      // draw over farther things (smaller y) — this is what lets a tree
      // correctly hide a player standing behind it, and vice versa.
      const myMoving     = !!s.moveTarget
      const myWalkFrame  = myMoving ? Math.floor(s.walkTick / 6) % 4 : 0
      const groundLayer  = []

      // Viewport culling — with a large scattered world, most obstacles are
      // off-screen at any moment. Only draw the ones near the visible area
      // (plus a margin so tall canopies don't pop in right at the edge).
      const viewCX = s.camX + canvas.width  / 2
      const viewCY = s.camY + canvas.height / 2
      const marginX = canvas.width  / (2 * s.zoom) + 150
      const marginY = canvas.height / (2 * s.zoom) + 150

      const OBSTACLE_DRAW = { tree: drawTree, bush: drawBush, rock: drawRock, stump: drawStump, log: drawLog }
      for (const o of s.parkObstacles) {
        if (o.type === 'pond') continue  // already drawn in the flat decor pass
        if (Math.abs(o.cx - viewCX) > marginX || Math.abs(o.cy - viewCY) > marginY) continue
        const drawFn = OBSTACLE_DRAW[o.type]
        groundLayer.push({ y: o.cy, draw: () => drawFn(ctx, o) })
      }

      if (s.npc) {
        const npc = s.npc
        const npcMoving = !!npc.targetId && npc.pickupPause === 0
        const npcFrame  = npcMoving ? Math.floor(npc.walkTick / 6) % 4 : 0
        groundLayer.push({
          y: npc.y,
          draw: () => drawStickman(ctx, npc.x, npc.y, 'Jani', false, 'npc-janitor', npcFrame, npc.facingDir, !npcMoving),
        })
      }

      for (const p of Object.values(s.players)) {
        const isMe = p.id === s.myId
        let frame, dir, idle
        if (isMe) {
          idle  = !myMoving
          frame = myWalkFrame
          dir   = s.facingDir
        } else {
          const moving = Date.now() - (p.lastMoved ?? 0) < 700
          idle  = !moving
          frame = moving ? Math.floor(Date.now() / 100) % 4 : 0
          dir   = p.facingDir ?? 1
        }
        groundLayer.push({ y: p.y, draw: () => drawStickman(ctx, p.x, p.y, p.name, isMe, p.id, frame, dir, idle) })
      }

      groundLayer.sort((a, b) => a.y - b.y)
      for (const entry of groundLayer) entry.draw()

      // ── Target marker ──
      if (s.moveTarget) drawTarget(ctx, s.moveTarget.x, s.moveTarget.y)

      // ── Pile (natural scattered layout) ──
      for (const item of s.pile) {
        const pos = s.pileLayout.get(item.id)
        if (pos) drawPileItem(ctx, pos.x, pos.y, item.text, pos.angle)
      }

      // ── Falling balloons ──
      const toDelete = []
      for (const [bid, fb] of Object.entries(s.falling)) {
        // Advance along a straight line using shared progress (no spiral)
        fb.progress = Math.min(1, fb.progress + 0.018)
        const t = fb.progress * fb.progress  // ease-in: accelerates like gravity
        fb.currentX = fb.startX + (fb.targetX - fb.startX) * t
        fb.currentY = fb.startY + (fb.targetY - fb.startY) * t
        fb.angle    = fb.maxAngle * fb.progress
        drawBalloon(ctx, fb.currentX, fb.currentY, fb.player_id, false, fb.angle)
        if (fb.progress >= 1) {
          if (fb.pile_item) {
            s.pile.push(fb.pile_item)
            placePileItem(fb.pile_item, s.pileLayout, fb.targetX, fb.targetY)
          }
          toDelete.push(bid)
        }
      }
      for (const bid of toDelete) delete s.falling[bid]

      // ── Floating balloons (bubble always visible, outline appears on hover) ──
      const now = Date.now()
      for (const b of Object.values(s.balloons)) {
        b.floatY -= 0.35
        // Auto-pop after 20 seconds
        if (now - b.createdAt >= 20000) {
          sendWS({ event: 'pop', balloon_id: b.id })
          continue
        }
        drawBalloon(ctx, b.x, b.floatY, b.player_id, s.hoveredBalloon === b.id)
        drawHoverBubble(ctx, b.x, b.floatY, b.text, b.player_id)
      }

      // ── Fireflies (ambient, animated, drawn on top of everything) ──
      {
        const t = Date.now() / 1000
        for (const o of s.parkDecor) {
          if (o.type !== 'firefly') continue
          if (Math.abs(o.cx - viewCX) > marginX || Math.abs(o.cy - viewCY) > marginY) continue
          drawFirefly(ctx, o, t)
        }
      }

      ctx.restore() // end camera transform

      canvas.style.cursor = s.hoveredBalloon ? 'pointer' : 'default'

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove',  onTouchMove)
      canvas.removeEventListener('touchend',   onTouchEnd)
      clearTimeout(zoomReset.current)
      cancelAnimationFrame(rafRef.current)
      ws.close()
    }
  }, [playerName, sendWS])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated', touchAction: 'none' }} />
      {!connected && (
        <div
          onClick={() => window.location.reload()}
          style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            color: '#ff6b6b', fontFamily: FONT, fontSize: 8,
            background: 'rgba(0,0,0,0.75)', padding: '8px 16px',
            letterSpacing: 1, border: '2px solid #ff6b6b',
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          connecting... (tap to retry)
        </div>
      )}
      <div style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <MessageInput onSend={(text) => sendRef.current?.(text)} />
        {zoomDisplay !== 100 && (
          <span style={{
            position: 'absolute', left: '100%', top: '50%',
            transform: 'translateY(-50%)',
            marginLeft: 10,
            fontFamily: FONT, fontSize: 6,
            color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            {zoomDisplay}%
          </span>
        )}
      </div>
    </div>
  )
}
