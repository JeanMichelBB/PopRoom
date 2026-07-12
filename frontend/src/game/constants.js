export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 3
export const ZOOM_STEP = 0.15

export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8001/ws'

// ── Pixel art config ─────────────────────────────────────────────────────────
export const P    = 3     // each "pixel art pixel" = P×P real canvas pixels
export const FONT = '"Press Start 2P", monospace'
export const SPEED = 2.5  // pixels per frame toward click target

export const COLORS = ['#00ff88', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94', '#c3a6ff', '#ffd93d']

// ── Park background sizing ───────────────────────────────────────────────────
export const PARK_CELL   = 90   // scatter grid pitch (world units)
export const PARK_EXTENT = 30   // grid spans -30..30 cells each axis — covers well past any normal viewport, even zoomed out
export const PLAYER_R    = P * 3  // collision radius around player feet
