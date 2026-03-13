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
    balloons: {},  // id → {id, player_id, text, x, y, floatY}
    falling: {},   // id → {text, x, currentY, targetY, pile_item}
    pile: [],          // [{id, text, player_name, x, y}]
    pileLayout: new Map(), // id → {x, y, angle} — client-side display positions
    hoveredBalloon: null,
    autoPopped: new Set(),  // balloon ids already sent an auto-pop to avoid spam
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
      const x = 100 + Math.random() * (window.innerWidth - 200)
      const y = window.innerHeight - 130
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
            msg.balloons.map(b => [b.id, { ...b, floatY: b.y }])
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
          s.balloons[b.id] = { ...b, floatY: b.y }
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
            s.autoPopped.delete(msg.balloon_id)
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

      // Background
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Subtle pixel dot grid
      ctx.fillStyle = 'rgba(255,255,255,0.025)'
      for (let gx = 0; gx < canvas.width; gx += P * 8)
        for (let gy = 0; gy < canvas.height; gy += P * 8)
          ctx.fillRect(gx, gy, P, P)

      // Floor (screen-space — always anchored to bottom of viewport)
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.fillRect(0, canvas.height - P * 2, canvas.width, P)

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

      // ── Move local player toward click target ──
      if (s.moveTarget && s.myId && s.players[s.myId]) {
        const p  = s.players[s.myId]
        const dx = s.moveTarget.x - p.x
        const dy = s.moveTarget.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < SPEED) {
          // Arrived
          p.x = s.moveTarget.x
          p.y = s.moveTarget.y
          s.moveTarget = null
          s.walkTick   = 0
          sendWS({ event: 'move', x: p.x, y: p.y })
        } else {
          // Step toward target
          if (dx !== 0) s.facingDir = dx > 0 ? 1 : -1
          p.x += (dx / dist) * SPEED
          p.y += (dy / dist) * SPEED
          s.walkTick++

          // Throttle WS to ~30fps
          const now = Date.now()
          if (now - s.lastSentMove > 33) {
            sendWS({ event: 'move', x: p.x, y: p.y })
            s.lastSentMove = now
          }
        }
      }

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
      for (const b of Object.values(s.balloons)) {
        b.floatY -= 0.35
        // Auto-pop when fully off the top of the screen
        if (b.floatY < -P * 8 && !s.autoPopped.has(b.id)) {
          s.autoPopped.add(b.id)
          sendWS({ event: 'pop', balloon_id: b.id })
          continue
        }
        drawBalloon(ctx, b.x, b.floatY, b.player_id, s.hoveredBalloon === b.id)
        drawHoverBubble(ctx, b.x, b.floatY, b.text, b.player_id)
      }

      // ── Janitor NPC ──
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

        const npcMoving = !!npc.targetId && npc.pickupPause === 0
        const npcFrame  = npcMoving ? Math.floor(npc.walkTick / 6) % 4 : 0
        drawStickman(ctx, npc.x, npc.y, 'Jani', false, 'npc-janitor', npcFrame, npc.facingDir, !npcMoving)
      }

      // ── Stickmen ──
      // 4-frame cycle: 6 game-frames per animation-frame = ~10 steps/sec at 60fps
      const myMoving = !!s.moveTarget
      const myWalkFrame = myMoving ? Math.floor(s.walkTick / 6) % 4 : 0
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
        drawStickman(ctx, p.x, p.y, p.name, isMe, p.id, frame, dir, idle)
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
