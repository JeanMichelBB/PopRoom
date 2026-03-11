# CLAUDE.md

## Project Overview

PopRoom is a real-time multiplayer shared canvas where users:
- Enter a name and join as a stickman
- Drag their stickman around the screen
- Send messages that appear as rising balloons above their head
- Click balloons to pop them — they fall to the floor and pile up
- The pile is persisted in MySQL so new users see it on join

## Services
- **Frontend**: React + Vite + Canvas API (`/frontend`) — port 3001
- **Backend**: Python FastAPI + WebSockets (`/backend`) — port 8001
- **Database**: MySQL 8.0 (popped balloon pile persistence)

## Development Commands

### Frontend (`/frontend`)
```bash
npm install
npm run dev      # http://localhost:3001
npm run build
```

### Backend (`/backend`)
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

### Docker (full stack)
```bash
docker-compose up --build
```

## WebSocket Protocol

**Client → Server**
| Event     | Payload                        |
|-----------|--------------------------------|
| `join`    | `{name, x, y}`                 |
| `move`    | `{x, y}`                       |
| `message` | `{text}`                       |
| `pop`     | `{balloon_id}`                 |

**Server → Client**
| Event            | Payload                                      |
|------------------|----------------------------------------------|
| `init`           | `{your_id, players[], balloons[], pile[]}`   |
| `player_joined`  | `{player}`                                   |
| `player_left`    | `{player_id}`                                |
| `player_moved`   | `{player_id, x, y}`                          |
| `new_balloon`    | `{balloon}`                                  |
| `balloon_popped` | `{balloon_id, pile_item}`                    |

## Database

Single table: `popped_balloons` — stores text, player_name, x position, timestamp.
Last 100 are loaded on `init` so joining users see the existing pile.

## Architecture Notes
- All game state (players, live balloons) is in-memory on the backend — no DB reads during gameplay except on join
- Balloon falling animation is client-side only; server only stores the final pile item
- Move events are throttled to ~30fps on the client before sending
