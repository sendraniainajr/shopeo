import os
from pathlib import Path
from uuid import uuid4
import pytest

runtime = Path(__file__).resolve().parents[2] / ".runtime"
if os.environ.get("SHOPEO_TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["SHOPEO_TEST_DATABASE_URL"]
elif (runtime / "database.env").exists():
    from sqlalchemy import create_engine, text

    base = (runtime / "database.env").read_text().strip().split("=", 1)[1]
    control = create_engine(base, isolation_level="AUTOCOMMIT")
    with control.connect() as conn:
        if not conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname='shopeo_test'")
        ).scalar():
            conn.execute(text("CREATE DATABASE shopeo_test"))
    control.dispose()
    os.environ["DATABASE_URL"] = base.rsplit("/", 1)[0] + "/shopeo_test"
else:
    os.environ["DATABASE_URL"] = "sqlite:///" + str(
        runtime / ("test-" + uuid4().hex + ".db")
    )
os.environ["SEED_DEMO"] = "1"
os.environ["LOCAL_DEMO"] = "1"
os.environ.pop("N8N_WEBHOOK_URL", None)
from fastapi.testclient import TestClient
from shopeo.main import app
from shopeo.db import Base, engine
from shopeo.security import _attempts


@pytest.fixture(autouse=True)
def isolated_db():
    assert engine.url.database.endswith(
        "shopeo_test"
    ) or "/test-" in engine.url.database.replace("\\", "/")
    Base.metadata.drop_all(engine)
    _attempts.clear()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        c.get("/api/auth/session")
        yield c


def post(client, path, body=None, method="POST", **headers):
    return client.request(
        method,
        "/api" + path,
        json=body or {},
        headers={
            "X-Shopeo-CSRF": client.cookies.get("shopeo_csrf"),
            "Origin": "http://127.0.0.1:3100",
            **headers,
        },
    )


def login(client, role="customer"):
    assert post(client, "/auth/demo/" + role).status_code == 200


ADDRESS = {
    "name": "Client Test",
    "street": "10 rue fictive",
    "postal": "75011",
    "city": "Paris",
    "country": "France",
}


def order(client, variant="support-aluminium-0", quantity=1, key=None):
    return post(
        client,
        "/orders",
        {"items": [{"variant_id": variant, "quantity": quantity}], "address": ADDRESS},
        **{"Idempotency-Key": key or uuid4().hex},
    )
