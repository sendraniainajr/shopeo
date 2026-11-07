"""Encrypted local backup; restore verification only targets shopeo_restore_test."""

import json
import os
import sys
import time
from pathlib import Path
from cryptography.fernet import Fernet
from sqlalchemy import create_engine, select, text, delete
import run  # Loads private local environment without printing it.
from shopeo.db import Base, engine, RUNTIME
from shopeo import models

secrets_dir = RUNTIME / "secrets"
secrets_dir.mkdir(exist_ok=True)
backups = RUNTIME / "backups"
backups.mkdir(exist_ok=True)
key_path = secrets_dir / "backup.key"
if not key_path.exists():
    key_path.write_bytes(Fernet.generate_key())
cipher = Fernet(key_path.read_bytes())


def backup():
    data = {}
    with engine.connect().execution_options(
        isolation_level="REPEATABLE READ"
        if engine.dialect.name == "postgresql"
        else "SERIALIZABLE"
    ) as conn:
        with conn.begin():
            for table in Base.metadata.sorted_tables:
                data[table.name] = [
                    dict(row) for row in conn.execute(select(table)).mappings()
                ]
    destination = backups / f"shopeo-{int(time.time())}.fernet"
    destination.write_bytes(
        cipher.encrypt(json.dumps({"version": 1, "tables": data}).encode())
    )
    print("Sauvegarde chiffrée créée : " + str(destination))
    return destination


def verify(path):
    payload = json.loads(cipher.decrypt(path.read_bytes()))
    if engine.dialect.name != "postgresql":
        raise RuntimeError("La vérification de restauration nécessite PostgreSQL.")
    url = engine.url.set(database="shopeo_restore_test")
    assert url.database == "shopeo_restore_test"
    control = create_engine(engine.url, isolation_level="AUTOCOMMIT")
    with control.connect() as conn:
        if not conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname='shopeo_restore_test'")
        ).scalar():
            conn.execute(text("CREATE DATABASE shopeo_restore_test"))
    control.dispose()
    restored = create_engine(url)
    Base.metadata.create_all(restored)
    with restored.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(delete(table))
        for table in Base.metadata.sorted_tables:
            rows = payload["tables"][table.name]
            if rows:
                conn.execute(table.insert(), rows)
    with restored.connect() as conn:
        counts = {
            table.name: len(conn.execute(select(table)).all())
            for table in Base.metadata.sorted_tables
        }
    assert all(counts[name] == len(rows) for name, rows in payload["tables"].items())
    restored.dispose()
    print(
        "Restauration vérifiée dans shopeo_restore_test : "
        + str(sum(counts.values()))
        + " enregistrements, "
        + str(len(counts))
        + " tables. La base source est inchangée."
    )


if __name__ == "__main__":
    file = backup()
    if "--verify" in sys.argv:
        verify(file)
