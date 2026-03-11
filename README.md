# PopRoom

A real-time multiplayer shared canvas where users control pixel-art stickmen, send floating message balloons, and pop each other's balloons — which fall to the floor and pile up in a mountain.

![PopRoom](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Pixel-art stickmen** — 4-frame walk animation, click anywhere to move
- **Real balloons** — oval pixel-art balloons float upward with a speech bubble showing the message
- **Pop mechanic** — click a balloon to pop it; it falls and lands in a pile where the sender was standing
- **Mountain pile** — popped balloons stack in a pyramid with angles and jitter, persisted in the database
- **Auto-pop** — balloons that float off the top of the screen pop automatically
- **Multiplayer** — all players see each other in real time via WebSockets
- **Persistent pile** — the balloon pile is saved to MySQL so new users see it when they join
- **Auto-rejoin** — name is saved in localStorage, skips the join screen on reload

## Stack

| Layer    | Tech                        |
|----------|-----------------------------|
| Frontend | React + Vite + Canvas API   |
| Backend  | Python FastAPI + WebSockets |
| Database | MySQL 8.0                   |
| Infra    | Docker + Docker Compose     |

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.12+ (for local backend dev)

### Run with Docker

```bash
git clone https://github.com/JeanMichelBB/PopRoom.git
cd PopRoom
cp .env.example .env   # edit credentials if needed
docker-compose up --build
```

- Frontend: http://localhost:3001
- Backend WS: ws://localhost:8001/ws

### Local Development

**Frontend**
```bash
cd frontend
npm install
npm run dev   # http://localhost:3001
```

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

## WebSocket Protocol

| Direction        | Event            | Payload                                    |
|------------------|------------------|--------------------------------------------|
| Client → Server  | `join`           | `{name, x, y}`                             |
| Client → Server  | `move`           | `{x, y}`                                   |
| Client → Server  | `message`        | `{text}`                                   |
| Client → Server  | `pop`            | `{balloon_id}`                             |
| Server → Client  | `init`           | `{your_id, players[], balloons[], pile[]}` |
| Server → Client  | `player_joined`  | `{player}`                                 |
| Server → Client  | `player_left`    | `{player_id}`                              |
| Server → Client  | `player_moved`   | `{player_id, x, y}`                        |
| Server → Client  | `new_balloon`    | `{balloon}`                                |
| Server → Client  | `balloon_popped` | `{balloon_id, pile_item}`                  |

## Project Structure

```
PopRoom/
├── docker-compose.yml
├── .env
├── backend/
│   ├── main.py               # WebSocket server, in-memory game state
│   ├── database/
│   │   ├── connection.py     # SQLAlchemy engine
│   │   └── models.py         # PoppedBalloon table
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.jsx
        └── components/
            ├── JoinScreen.jsx
            ├── GameCanvas.jsx  # Canvas loop, stickmen, balloons, pile
            └── MessageInput.jsx
```

## License

MIT
