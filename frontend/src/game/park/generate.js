import { P, PARK_CELL, PARK_EXTENT, PLAYER_R } from '../constants'
import { seededRand, hash2D } from '../rng'
import { isOutsideIsland } from './island'

// ── Park background (trees, bushes, rocks, stumps, logs, pond — all
// collidable — plus non-collidable decor: mushrooms, ferns, flowers, dirt
// patches, and ambient fireflies) ────────────────────────────────────────────

// Deterministic scattered park centered on the player's spawn point, with a
// clearing left open around the origin. Sparse + jittered so it reads as
// naturally placed rather than gridded. Returns { obstacles, decor } —
// obstacles block movement, decor is purely visual (too low-profile to need
// occlusion sorting against players).
export function buildParkObstacles(originX, originY) {
  const obstacles = []
  const decor = []

  // ── Lake — temporarily disabled. Set to true to bring back the single big
  // lake (5x the old per-pond radius, placed diagonally off-center so it
  // fits within the populated region without touching spawn or clipping
  // the world edge). isInPond/isInAnyPond and the swim-speed movement hook
  // are left in place either way since they're harmless with zero ponds. ──
  const LAKE_ENABLED = false
  const WORLD_EDGE = PARK_EXTENT * PARK_CELL  // true edge of the populated (tree/grass) region
  const ponds = []
  if (LAKE_ENABLED) {
    const seed = 'thelake'
    const baseR = PARK_CELL * 2.2       // midpoint of the old small-pond radius range
    const r = baseR * 5
    const a1 = 0.08, f1 = 2, p1 = hash2D(0, 0, 5) * Math.PI * 2
    const a2 = 0.03, f2 = 5, p2 = hash2D(0, 0, 8) * Math.PI * 2
    const maxR = r * (1 + a1 + a2)
    // Placed diagonally off-center so it's a discoverable landmark rather
    // than sitting right on top of spawn, while its far edge still stays
    // safely inside WORLD_EDGE.
    const dist = Math.min(WORLD_EDGE - maxR - 50, maxR + 400)
    const cx = originX + dist / Math.SQRT2
    const cy = originY + dist / Math.SQRT2
    ponds.push({ cx, cy, r, maxR, a1, f1, p1, a2, f2, p2, seed })
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
      if (isOutsideIsland(cx, cy)) continue  // no grass out in the ocean
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
      if (isOutsideIsland(cx, cy)) continue  // no forest content out in the ocean

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
      if (isOutsideIsland(cx, cy)) continue  // no dirt patches out in the ocean
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
      if (isOutsideIsland(fcx, fcy)) continue  // no fireflies out in the ocean
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

// Built once at a fixed world origin so every client sees the same map —
// obstacles must line up regardless of where each player happens to spawn.
export const { obstacles: PARK_OBSTACLES, decor: PARK_DECOR } = buildParkObstacles(0, 0)

// True if a player standing at (px, py) would overlap any obstacle
export function isBlocked(px, py, obstacles) {
  for (const o of obstacles) {
    if (px + PLAYER_R > o.x && px - PLAYER_R < o.x + o.w &&
        py + PLAYER_R > o.y && py - PLAYER_R < o.y + o.h) return true
  }
  return false
}
