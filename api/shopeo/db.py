import os
from pathlib import Path
from sqlalchemy import create_engine, event, MetaData
from sqlalchemy.pool import NullPool
import re
from sqlalchemy.orm import DeclarativeBase, sessionmaker

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = Path(
    os.environ.get(
        "SHOPEO_RUNTIME_DIR",
        "/tmp/shopeo" if os.environ.get("VERCEL") else str(ROOT / ".runtime"),
    )
)
RUNTIME.mkdir(exist_ok=True)
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{RUNTIME / 'shopeo.db'}")
if os.environ.get("VERCEL") and not DATABASE_URL.startswith("postgres"):
    raise RuntimeError(
        "Une base PostgreSQL persistante est requise pour ce déploiement."
    )
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
SCHEMA = os.environ.get("DATABASE_SCHEMA") or None
if SCHEMA and not re.fullmatch(r"[a-z][a-z0-9_]{0,40}", SCHEMA):
    raise RuntimeError("Schéma de base invalide.")
connect_args = (
    {"check_same_thread": False, "timeout": 20}
    if DATABASE_URL.startswith("sqlite")
    else {"prepare_threshold": None, "connect_timeout": 15}
)
pool_options = {"poolclass": NullPool} if os.environ.get("VERCEL") else {}
engine = create_engine(
    DATABASE_URL, pool_pre_ping=True, connect_args=connect_args, **pool_options
)
if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def sqlite_config(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
