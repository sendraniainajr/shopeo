from alembic import context
import os
from sqlalchemy import create_engine
from shopeo.db import engine, Base, SCHEMA
from shopeo import models

url = os.environ.get("MIGRATION_DATABASE_URL")
if url:
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    engine = create_engine(
        url, connect_args={"prepare_threshold": None, "connect_timeout": 20}
    )
with engine.connect() as connection:
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        version_table_schema=SCHEMA,
    )
    with context.begin_transaction():
        context.run_migrations()
