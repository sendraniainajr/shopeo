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
    if SCHEMA and not connection.dialect.has_schema(connection, SCHEMA):
        raise RuntimeError(
            "Le schéma privé doit être provisionné par le propriétaire de la base "
            "avant les migrations. Voir api/provision.sql et README.md. "
            "Le compte migrator ne reçoit pas de droit CREATE sur toute la base."
        )
    connection.commit()
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        version_table_schema=SCHEMA,
    )
    with context.begin_transaction():
        context.run_migrations()
