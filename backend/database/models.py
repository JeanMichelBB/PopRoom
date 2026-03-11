from sqlalchemy import Column, String, Float, DateTime
from datetime import datetime
from .connection import Base


class PoppedBalloon(Base):
    __tablename__ = "popped_balloons"

    id = Column(String(36), primary_key=True)
    text = Column(String(500), nullable=False)
    player_name = Column(String(100), nullable=False)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False, default=400.0)
    popped_at = Column(DateTime, default=datetime.utcnow)
