import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "3306")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("DB_ROOT_PASSWORD", "test")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import database.connection as db_conn

# Swap the real MySQL engine for an in-memory SQLite one shared across
# connections, so tests never need a live database.
_test_engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
db_conn.engine = _test_engine
db_conn.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)

import main as app_module

app_module.init_database = lambda: None  # skip MySQL user/db provisioning
app_module.engine = _test_engine
app_module.SessionLocal = db_conn.SessionLocal

from database.models import Base

Base.metadata.create_all(bind=_test_engine)


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    with TestClient(app_module.app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_state():
    app_module.players.clear()
    app_module.balloons.clear()
    app_module.connections.clear()
    yield
    app_module.players.clear()
    app_module.balloons.clear()
    app_module.connections.clear()


@pytest.fixture(autouse=True)
def _clean_pile_table():
    yield
    db = app_module.SessionLocal()
    db.query(app_module.PoppedBalloon).delete()
    db.commit()
    db.close()
