import uuid
import os
import json
import asyncio
import pymysql
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import text as sql_text
from database.connection import engine, SessionLocal, DATABASE_URL
from database.models import PoppedBalloon, Base

DB_HOST = os.getenv("DB_HOST")
DB_ROOT_PASSWORD = os.getenv("DB_ROOT_PASSWORD")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

# ── In-memory state ──────────────────────────────────────────────────────────
players: dict = {}      # conn_id → {id, name, x, y}
balloons: dict = {}     # balloon_id → {id, player_id, player_name, text, x, y}
connections: dict = {}  # conn_id → WebSocket


def init_database():
    conn = pymysql.connect(host=DB_HOST, user="root", password=DB_ROOT_PASSWORD)
    with conn.cursor() as cursor:
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}`")
        cursor.execute(f"CREATE USER IF NOT EXISTS '{DB_USER}'@'%' IDENTIFIED BY '{DB_PASSWORD}'")
        cursor.execute(f"GRANT ALL PRIVILEGES ON `{DB_NAME}`.* TO '{DB_USER}'@'%'")
        cursor.execute("FLUSH PRIVILEGES")
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    Base.metadata.create_all(bind=engine)
    # Migrate: add y column if the table already existed without it
    with engine.connect() as conn:
        try:
            conn.execute(sql_text(
                "ALTER TABLE popped_balloons ADD COLUMN y FLOAT NOT NULL DEFAULT 400.0"
            ))
            conn.commit()
        except Exception:
            pass  # column already exists
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def broadcast(message: dict, exclude_id: str = None):
    dead = []
    for conn_id, ws in list(connections.items()):
        if conn_id == exclude_id:
            continue
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(conn_id)
    for conn_id in dead:
        connections.pop(conn_id, None)
        players.pop(conn_id, None)


async def ping_loop(conn_id: str, websocket: WebSocket):
    """Send a ping every 30s to keep the connection alive through Cloudflare."""
    try:
        while conn_id in connections:
            await asyncio.sleep(30)
            if conn_id in connections:
                await websocket.send_json({"event": "ping"})
    except Exception:
        pass


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    conn_id = str(uuid.uuid4())
    connections[conn_id] = websocket
    asyncio.create_task(ping_loop(conn_id, websocket))

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            event = data.get("event")

            if event == "pong":
                continue

            if event == "join":
                player = {
                    "id": conn_id,
                    "name": str(data.get("name", "Anonymous"))[:20],
                    "x": float(data.get("x", 400)),
                    "y": float(data.get("y", 400)),
                }
                players[conn_id] = player

                db = SessionLocal()
                pile_rows = (
                    db.query(PoppedBalloon)
                    .order_by(PoppedBalloon.popped_at.desc())
                    .limit(100)
                    .all()
                )
                pile = [
                    {"id": p.id, "text": p.text, "player_name": p.player_name, "x": p.x, "y": p.y}
                    for p in reversed(pile_rows)
                ]
                db.close()

                await websocket.send_json({
                    "event": "init",
                    "your_id": conn_id,
                    "players": list(players.values()),
                    "balloons": list(balloons.values()),
                    "pile": pile,
                })

                await broadcast(
                    {"event": "player_joined", "player": player},
                    exclude_id=conn_id,
                )

            elif event == "move":
                if conn_id in players:
                    players[conn_id]["x"] = float(data.get("x", 0))
                    players[conn_id]["y"] = float(data.get("y", 0))
                    await broadcast({
                        "event": "player_moved",
                        "player_id": conn_id,
                        "x": players[conn_id]["x"],
                        "y": players[conn_id]["y"],
                    })

            elif event == "message":
                if conn_id in players:
                    p = players[conn_id]
                    text = str(data.get("text", ""))[:80].strip()
                    if not text:
                        continue
                    balloon_id = str(uuid.uuid4())
                    balloon = {
                        "id": balloon_id,
                        "player_id": conn_id,
                        "player_name": p["name"],
                        "text": text,
                        "x": p["x"],
                        "y": p["y"] - 70,
                    }
                    balloons[balloon_id] = balloon
                    await broadcast({"event": "new_balloon", "balloon": balloon})

            elif event == "pop":
                balloon_id = data.get("balloon_id")
                if balloon_id and balloon_id in balloons:
                    balloon = balloons.pop(balloon_id)

                    db = SessionLocal()
                    # balloon["y"] = player.y - 70, so +70 restores foot position
                    land_y = balloon["y"] + 70
                    pile_item = PoppedBalloon(
                        id=str(uuid.uuid4()),
                        text=balloon["text"],
                        player_name=balloon["player_name"],
                        x=balloon["x"],
                        y=land_y,
                        popped_at=datetime.utcnow(),
                    )
                    db.add(pile_item)
                    db.commit()
                    db.refresh(pile_item)
                    pile_data = {
                        "id": pile_item.id,
                        "text": pile_item.text,
                        "player_name": pile_item.player_name,
                        "x": pile_item.x,
                        "y": pile_item.y,
                    }
                    db.close()

                    await broadcast({
                        "event": "balloon_popped",
                        "balloon_id": balloon_id,
                        "pile_item": pile_data,
                    })

    except WebSocketDisconnect:
        connections.pop(conn_id, None)
        players.pop(conn_id, None)
        await broadcast({"event": "player_left", "player_id": conn_id})
