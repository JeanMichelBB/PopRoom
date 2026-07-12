import { useEffect, useRef, useState, useCallback } from 'react'
import MessageInput from './MessageInput'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, WS_URL, FONT, SPEED, PARK_CELL } from '../game/constants'
import { drawStickman } from '../game/stickman'
import { drawTarget } from '../game/target'
import { drawBalloon, drawHoverBubble, isInBalloon } from '../game/balloon'
import { drawPileItem, placePileItem } from '../game/pile'
import { drawTree } from '../game/park/trees'
import { drawBush } from '../game/park/bushes'
import { drawRock } from '../game/park/rocks'
import { drawStump } from '../game/park/stumps'
import { drawLog } from '../game/park/logs'
import { drawPond, isInAnyPond } from '../game/park/pond'
import { drawMushroom, drawGrassTuft, drawFern, drawFlower, drawDirtPatch, drawFirefly } from '../game/park/decor'
import { PARK_OBSTACLES, PARK_DECOR, isBlocked } from '../game/park/generate'
import { isOutsideIsland, drawOceanMask, drawCliffMask } from '../game/park/island'

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

    const POS_KEY = `poproom_last_pos_${playerName}`
    const NPC_POS_KEY = 'poproom_npc_pos'

    ws.onopen = () => {
      // Resume at the last known position if we have one saved (e.g. from a
      // page reload); otherwise spawn scattered within the shared clearing
      // (the empty center cells of PARK_OBSTACLES) so every client's park
      // layout lines up.
      let x, y
      const saved = localStorage.getItem(POS_KEY)
      if (saved) {
        try {
          ;({ x, y } = JSON.parse(saved))
        } catch { /* fall through to random spawn below */ }
      }
      if (x === undefined || y === undefined) {
        x = (Math.random() - 0.5) * (PARK_CELL * 1.4)
        y = (Math.random() - 0.5) * (PARK_CELL * 1.4)
      }
      s.parkObstacles = PARK_OBSTACLES
      s.parkDecor = PARK_DECOR
      // Center the camera on the spawn point immediately so a reload doesn't
      // start at world origin and visibly race across the map to catch up.
      s.camX = x - canvas.width  / 2
      s.camY = y - canvas.height / 2
      sendWS({ event: 'join', name: playerName, x, y })
      setConnected(true)
    }

    // Save the last known position right before the page unloads so a
    // reload can resume from the same spot instead of a fresh random one.
    // Same for the janitor NPC — otherwise it respawns next to the player
    // on every reload instead of staying wherever it wandered off to.
    const onBeforeUnload = () => {
      const p = s.players[s.myId]
      if (p) localStorage.setItem(POS_KEY, JSON.stringify({ x: p.x, y: p.y }))
      if (s.npc) localStorage.setItem(NPC_POS_KEY, JSON.stringify({ x: s.npc.x, y: s.npc.y }))
    }
    window.addEventListener('beforeunload', onBeforeUnload)

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

      // ── Ocean (everything outside the island's coastline) ──
      // Drawn right after the camera transform, before anything else, so it
      // sits under the whole park. Land is the default ground fill — this
      // only needs to mask the visible water.
      {
        const viewCX  = s.camX + canvas.width  / 2
        const viewCY  = s.camY + canvas.height / 2
        const halfW   = canvas.width  / (2 * s.zoom)
        const halfH   = canvas.height / (2 * s.zoom)
        drawOceanMask(ctx, viewCX, viewCY, halfW, halfH, s.zoom)
        drawCliffMask(ctx, viewCX, viewCY, halfW, halfH, s.zoom)
      }

      // ── Flat ground decor (pond, dirt patches, mushrooms, ferns, flowers) ──
      // Drawn early since these are too low-profile to need occlusion
      // sorting against players. Fireflies are drawn later, on top.
      {
        const viewCX  = s.camX + canvas.width  / 2
        const viewCY  = s.camY + canvas.height / 2
        const marginX = canvas.width  / (2 * s.zoom) + 150
        const marginY = canvas.height / (2 * s.zoom) + 150
        // Fine ground clutter (1-3px each) is invisible once zoomed out far
        // enough, and there's a lot of it (grass alone is ~45% fill on a
        // fine grid) — skip drawing it entirely below this zoom rather than
        // paying for thousands of fillRect calls nobody can see.
        const showFineDecor = s.zoom >= 0.5
        for (const o of s.parkDecor) {
          if (o.type === 'firefly') continue  // drawn later, on top
          if (Math.abs(o.cx - viewCX) > marginX || Math.abs(o.cy - viewCY) > marginY) continue
          if (o.type === 'pond') { drawPond(ctx, o); continue }
          if (!showFineDecor) continue
          if (o.type === 'grass') drawGrassTuft(ctx, o)
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

        // Swimming — standing in water (a pond, or the open ocean past the
        // island's coastline) slows movement instead of blocking it
        const inWater = isInAnyPond(s.parkDecor, p.x, p.y) || isOutsideIsland(p.x, p.y)
        const speed = inWater ? SPEED * 0.35 : SPEED

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

      // Lazy-init: resume at its last known spot if saved (so a reload
      // doesn't yank it back next to the player); otherwise spawn offscreen
      // near the floor once we know where the player is.
      if (!s.npc && s.myId && s.players[s.myId]) {
        let npcX, npcY
        const savedNpc = localStorage.getItem(NPC_POS_KEY)
        if (savedNpc) {
          try {
            ;({ x: npcX, y: npcY } = JSON.parse(savedNpc))
          } catch { /* fall through to relative spawn below */ }
        }
        if (npcX === undefined || npcY === undefined) {
          const p = s.players[s.myId]
          npcX = p.x - 200
          npcY = p.y
        }
        s.npc = { x: npcX, y: npcY, walkTick: 0, facingDir: 1, targetId: null, pickupPause: 0 }
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
      onBeforeUnload()  // also save on unmount, not just full page reload
      window.removeEventListener('beforeunload', onBeforeUnload)
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
