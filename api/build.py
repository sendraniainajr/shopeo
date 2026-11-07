import os
from pathlib import Path
from alembic import command
from alembic.config import Config

if not os.environ.get("DATABASE_URL"):
    raise RuntimeError("DATABASE_URL doit être configurée avant le déploiement.")
command.upgrade(Config(str(Path(__file__).parent / "alembic.ini")), "head")
from shopeo.seed import seed, bootstrap_admin

seed(accounts_enabled=False)
bootstrap_admin()
if os.environ.get("DATABASE_SCHEMA") == "shopeo":
    from sqlalchemy import create_engine, text
    from shopeo.db import Base

    url = os.environ.get("MIGRATION_DATABASE_URL")
    if not url:
        raise RuntimeError("Le compte de migration distinct est requis.")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    migration_engine = create_engine(url, connect_args={"prepare_threshold": None})
    with migration_engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            name = 'shopeo."' + table.name + '"'
            conn.execute(text("ALTER TABLE " + name + " ENABLE ROW LEVEL SECURITY"))
            conn.execute(
                text("DROP POLICY IF EXISTS backend_runtime_access ON " + name)
            )
            conn.execute(
                text(
                    "CREATE POLICY backend_runtime_access ON "
                    + name
                    + " TO shopeo_runtime USING (true) WITH CHECK (true)"
                )
            )
        for table in ["sessions", "reset_tokens", "rate_buckets"]:
            conn.execute(
                text('GRANT DELETE ON shopeo."' + table + '" TO shopeo_runtime')
            )
        conn.execute(
            text("ALTER TABLE shopeo.alembic_version ENABLE ROW LEVEL SECURITY")
        )
    migration_engine.dispose()
print("Migrations appliquées et catalogue de démonstration initialisé.")
