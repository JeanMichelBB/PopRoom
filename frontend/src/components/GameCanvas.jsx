import { useEffect, useRef, useState, useCallback } from 'react'
import MessageInput from './MessageInput'

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

// Draw one pixel-art "pixel" at grid offset (gx, gy) from base (bx, by)
function pp(ctx, bx, by, gx, gy, color) {
  ctx.fillStyle = color
  ctx.fillRect(snap(bx) + gx * P, snap(by) + gy * P, P, P)
}

// ── Pixel stickman — 4-frame walk cycle ──────────────────────────────────────
// walkFrame 0,2 = stride (feet spread)  |  walkFrame 1,3 = mid-step (feet passing)
// dir: 1 = facing right, -1 = facing left
function drawStickman(ctx, cx, cy, name, isMe, id, walkFrame, dir) {
  const col = isMe ? '#ffffff' : playerColor(id)
  const f   = dir ?? 1

  // Body bobs UP one pixel during mid-stride frames (1 & 3)
  const bob = (walkFrame % 2 === 1) ? -P : 0
  const ay  = cy + bob  // adjusted y

  // Head (3×3 block)
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -14; dy <= -12; dy++)
      pp(ctx, cx, ay, dx, dy, col)

  // Body (center column, rows -11 to -6)
  for (let dy = -11; dy <= -6; dy++)
    pp(ctx, cx, ay, 0, dy, col)

  // Arms — inner pixels always present; tips swing opposite to front leg
  // frame 0: right front → left arm swings forward (tip dips)
  // frame 2: left front  → right arm tip dips
  const lTipOff = (walkFrame === 0 || walkFrame === 1) ?  1 : -1
  const rTipOff = -lTipOff
  pp(ctx, cx, ay, -2, -9 + lTipOff, col)  // left arm tip
  pp(ctx, cx, ay, -1, -9,            col)
  pp(ctx, cx, ay,  0, -9,            col)
  pp(ctx, cx, ay,  1, -9,            col)
  pp(ctx, cx, ay,  2, -9 + rTipOff, col)  // right arm tip

  // ── Legs ──────────────────────────────────────────────────────────────────
  if (walkFrame % 2 === 0) {
    // STRIDE FRAME — front foot extended, back foot trailing
    //   Front foot: diagonal forward + toe pixel
    pp(ctx, cx, ay,  1*f, -5, col)
    pp(ctx, cx, ay,  2*f, -4, col)
    pp(ctx, cx, ay,  3*f, -3, col)
    pp(ctx, cx, ay,  4*f, -3, col)  // toe pointing forward

    //   Back foot: trailing + heel lifting off ground
    pp(ctx, cx, ay, -1*f, -5, col)
    pp(ctx, cx, ay, -2*f, -4, col)
    pp(ctx, cx, ay, -2*f, -3, col)
    pp(ctx, cx, ay, -3*f, -2, col)  // heel raised
  } else {
    // MID-STRIDE FRAME — feet passing under body
    //   Front foot descending (about to land, toe down)
    pp(ctx, cx, ay,  1*f, -5, col)
    pp(ctx, cx, ay,  1*f, -4, col)
    pp(ctx, cx, ay,  2*f, -3, col)
    pp(ctx, cx, ay,  2*f, -2, col)  // toe touching down

    //   Back foot pushing off (toes still on ground)
    pp(ctx, cx, ay, -1*f, -5, col)
    pp(ctx, cx, ay, -1*f, -4, col)
    pp(ctx, cx, ay, -1*f, -3, col)
    pp(ctx, cx, ay, -2*f, -3, col)  // toe push-off
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

function drawBalloon(ctx, x, y, playerId, hovered = false) {
  const cx  = snap(x)
  const cy  = snap(y)
  const col = playerColor(playerId)

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

// ── Mountain pile layout ──────────────────────────────────────────────────────
// Returns [{xOff, yOff}] for N items arranged in a pyramid.
// Bottom row is widest; each row above narrows by one, with increasing jitter
// so the pile looks like it can barely stay balanced.
function getMountainPositions(N) {
  if (N === 0) return []

  const ITEM_W = P * 7   // item is 7px wide — items touch with no gap
  const ITEM_H = P * 3   // item is 3px tall — rows sit flush on each other

  // Smallest triangle base that holds N items  (base*(base+1)/2 >= N)
  let base = 1
  while (base * (base + 1) / 2 < N) base++

  const positions = []
  let placed = 0, row = 0, rowSize = base

  while (placed < N) {
    const inRow = Math.min(rowSize, N - placed)
    for (let col = 0; col < inRow; col++) {
      // Center this row within the base row width
      const xOff = (col - (rowSize - 1) / 2) * ITEM_W
      const idx = positions.length
      // x jitter grows with height — deterministic, no per-frame wiggle
      const jitter = Math.sin(idx * 7.3 + row * 13.7) * row * P * 0.8
      // Angle: floor items nearly flat, higher items increasingly tilted
      const maxAngle = Math.min(Math.PI / 4, row * (Math.PI / 10) + Math.PI / 18)
      const angle = Math.sin(idx * 5.1 + row * 9.3) * maxAngle
      positions.push({ xOff: xOff + jitter, yOff: -row * ITEM_H, angle })
      placed++
    }
    row++
    rowSize--
    if (rowSize <= 0) break
  }

  return positions
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
    pile: [],      // [{id, text, player_name, x}]
    hoveredBalloon: null,
    autoPopped: new Set(),  // balloon ids already sent an auto-pop to avoid spam
    moveTarget: null,   // {x, y} — where the local player is walking to
    walkTick: 0,        // increments each frame while moving
    facingDir: 1,       // 1 = right, -1 = left
    lastSentMove: 0,
  })
  const rafRef = useRef(null)
  const [connected, setConnected] = useState(false)

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
        case 'balloon_popped': {
          const b = s.balloons[msg.balloon_id]
          if (b) {
            const landY = msg.pile_item?.y ?? (b.y + 70)
            s.falling[msg.balloon_id] = {
              ...b,
              currentY:  b.floatY,
              targetY:   landY,
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

    // ── Mouse events ──
    const onMouseDown = (e) => {
      const mx = e.clientX, my = e.clientY

      // Balloon click → pop (priority)
      for (const [bid, b] of Object.entries(s.balloons)) {
        if (isInBalloon(mx, my, b.x, b.floatY)) {
          sendWS({ event: 'pop', balloon_id: bid })
          return
        }
      }

      // Canvas click → walk to that position
      s.moveTarget = { x: mx, y: my }
    }

    const onMouseMove = (e) => {
      const mx = e.clientX, my = e.clientY
      s.hoveredBalloon = null
      for (const [bid, b] of Object.entries(s.balloons)) {
        if (isInBalloon(mx, my, b.x, b.floatY)) {
          s.hoveredBalloon = bid
          break
        }
      }
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)

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

      // Floor
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.fillRect(0, canvas.height - P * 2, canvas.width, P)

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

      // ── Pile (mountain shape) ──
      // Group items by 2D proximity, then draw each group as a pyramid
      const buckets = {}
      for (const item of s.pile) {
        const kx = Math.round(item.x / (P * 22))
        const ky = Math.round(item.y / (P * 22))
        const key = `${kx}_${ky}`
        if (!buckets[key]) buckets[key] = []
        buckets[key].push(item)
      }
      for (const items of Object.values(buckets)) {
        // Base center: average x, max y (lowest screen position = floor of pile)
        const cx = items.reduce((s, i) => s + i.x, 0) / items.length
        const cy = Math.max(...items.map(i => i.y))
        const positions = getMountainPositions(items.length)
        for (let i = 0; i < items.length; i++) {
          const { xOff, yOff, angle } = positions[i]
          drawPileItem(ctx, cx + xOff, cy + yOff, items[i].text, angle)
        }
      }

      // ── Falling balloons ──
      const toDelete = []
      for (const [bid, fb] of Object.entries(s.falling)) {
        fb.currentY += (fb.targetY - fb.currentY) * 0.15
        drawBalloon(ctx, fb.x, fb.currentY, fb.player_id)
        if (Math.abs(fb.currentY - fb.targetY) < 1.5) {
          if (fb.pile_item) s.pile.push(fb.pile_item)
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

      // ── Stickmen ──
      // 4-frame cycle: 6 game-frames per animation-frame = ~10 steps/sec at 60fps
      const myWalkFrame = s.moveTarget ? Math.floor(s.walkTick / 6) % 4 : 0
      for (const p of Object.values(s.players)) {
        const isMe = p.id === s.myId
        let frame, dir
        if (isMe) {
          frame = myWalkFrame
          dir   = s.facingDir
        } else {
          // Animate other players for 700ms after their last received move event
          const moving = Date.now() - (p.lastMoved ?? 0) < 700
          frame = moving ? Math.floor(Date.now() / 100) % 4 : 0
          dir   = p.facingDir ?? 1
        }
        drawStickman(ctx, p.x, p.y, p.name, isMe, p.id, frame, dir)
      }

      canvas.style.cursor = s.hoveredBalloon ? 'pointer' : 'default'

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      cancelAnimationFrame(rafRef.current)
      ws.close()
    }
  }, [playerName, sendWS])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
      {!connected && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          color: '#ff6b6b', fontFamily: FONT, fontSize: 8,
          background: 'rgba(0,0,0,0.75)', padding: '8px 16px',
          letterSpacing: 1, border: '2px solid #ff6b6b',
        }}>
          connecting...
        </div>
      )}
      <MessageInput onSend={(text) => sendRef.current?.(text)} />
    </div>
  )
}
