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
- **Procedural island park** — deterministic, seeded scenery (trees, bushes, rocks, stumps, logs, a pond, ambient decor, wildlife) scattered around spawn with a clearing left open, plus an island/ocean/cliff mask at the edges

## Stack

| Layer    | Tech                        |
|----------|-----------------------------|
| Frontend | React + Vite + Canvas API   |
| Backend  | Python FastAPI + WebSockets |
| Database | MySQL 8.0                   |
| Infra    | Docker + Docker Compose     |

In production, this app connects to a shared MySQL instance — see [`shared-mysql`](https://github.com/JeanMichelBB/shared-mysql). It doesn't run its own database in k3s.

Backend also exposes Prometheus metrics (`/metrics`) via `prometheus-fastapi-instrumentator`, and ships OpenTelemetry traces (FastAPI + SQLAlchemy spans) over OTLP/gRPC when `TAILSCALE_IP_TSPI` is set — a no-op in local dev (`backend/tracing.py`).

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.12+ (for local backend dev)

### Run with Docker

```bash
git clone https://github.com/JeanMichelBB/PopRoom.git
cd PopRoom
```

Create a `.env` in the repo root (there's no `.env.example` checked in — `.env` is gitignored) with:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_ROOT_PASSWORD=<root password>
DB_NAME=poproom
DB_USER=poproom
DB_PASSWORD=<password>

VITE_WS_URL=ws://<host>:8001/ws
```

Then:

```bash
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

### Tests

```bash
cd backend
pytest
```

Tests run against an in-memory SQLite engine (swapped in via `tests/conftest.py`) — no live MySQL needed.

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
├── .github/workflows/deploy.yml   # CI: build, scan, push Docker images
├── k3s/                           # Kustomize manifests for k3s deployment
├── backend/
│   ├── main.py                    # WebSocket server, in-memory game state
│   ├── tracing.py                 # OpenTelemetry setup (no-op locally)
│   ├── database/
│   │   ├── connection.py          # SQLAlchemy engine
│   │   └── models.py              # PoppedBalloon table
│   ├── tests/                     # pytest suite (in-memory SQLite)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.jsx
        ├── global.css
        ├── components/
        │   ├── JoinScreen.jsx
        │   ├── GameCanvas.jsx     # Canvas loop, stickmen, balloons, pile
        │   └── MessageInput.jsx
        └── game/                  # Canvas draw/update logic, framework-free
            ├── stickman.js, balloon.js, pile.js, target.js
            ├── pixel.js, rng.js, constants.js
            └── park/              # Procedural island scenery
                ├── generate.js, island.js
                ├── trees.js, bushes.js, rocks.js, stumps.js, logs.js
                ├── boulders.js, pond.js, decor.js, wildlife.js
```

## CI/CD & Deployment

- **`.github/workflows/deploy.yml`** — on push to `main`, builds changed frontend/backend images (path-filtered), scans them with Trivy for critical CVEs, then pushes multi-arch (`amd64`/`arm64`) images to Docker Hub tagged `<run_number>-<sha>` and `latest`.
- **`k3s/`** — Kustomize manifests for the k3s deployment: `frontend-deployment.yaml`, `backend-deployment.yaml`, `ingress.yaml`, `networkpolicy.yaml` (pod-to-pod segmentation), `doppler-secret.yaml` / `secrets/` (env injection), and `image-updater.yaml` (automated image tag bumps, tie-broken by run number rather than build timestamp — see `6d12e07`). The frontend/backend image tags in `kustomization.yaml` are bumped automatically by CI on release.

## License

MIT
