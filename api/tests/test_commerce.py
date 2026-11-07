import hashlib, hmac, json, os, time
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from sqlalchemy import select
from shopeo.main import app
from shopeo.db import SessionLocal, engine
from shopeo.models import Variant, Order, Outbox, Message, Ticket, Receipt
from shopeo.automation import process_once
from conftest import post, login, order, ADDRESS


def test_catalog_and_health(client):
    assert len(client.get("/api/products").json()) == 12
    assert client.get("/api/health").json()["database"] == engine.dialect.name
    assert client.get("/api/products/missing").status_code == 404


def test_csrf_and_origin(client):
    assert client.post("/api/auth/demo/customer", json={}).status_code == 403
    assert (
        post(client, "/auth/demo/customer", Origin="https://evil.example").status_code
        == 403
    )
    assert post(client, "/auth/demo/customer").status_code == 200


def test_auth_and_admin_boundary(client):
    assert client.get("/api/orders").status_code == 401
    login(client)
    assert client.get("/api/admin/overview").status_code == 403
    assert post(client, "/auth/logout").status_code == 204
    assert client.get("/api/orders").status_code == 401


def test_server_price_and_idempotency(client):
    login(client)
    body = {
        "items": [{"variant_id": "support-aluminium-0", "quantity": 1}],
        "address": ADDRESS,
        "total": 1,
    }
    assert (
        post(client, "/orders", body, **{"Idempotency-Key": "testkey123"}).status_code
        == 422
    )
    first = order(client, key="same-key-123").json()
    second = order(client, key="same-key-123").json()
    assert first["id"] == second["id"]
    assert first["total"] == 4390
    assert order(client, quantity=2, key="same-key-123").status_code == 409


def test_payment_replay_stock_and_outbox(client):
    login(client)
    o = order(client).json()
    for _ in range(2):
        assert (
            post(
                client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"}
            ).json()["payment"]
            == "paid"
        )
    with SessionLocal() as db:
        assert db.get(Variant, "support-aluminium-0").stock == 17
        assert db.get(Variant, "support-aluminium-0").reserved == 0
        assert (
            len(db.scalars(select(Outbox).where(Outbox.kind == "order.paid")).all())
            == 1
        )


def test_decline_and_abandon_release_stock(client):
    login(client)
    for result in ["decline", "abandon"]:
        o = order(client).json()
        post(client, f"/orders/{o['id']}/simulate-payment", {"outcome": result})
    with SessionLocal() as db:
        v = db.get(Variant, "support-aluminium-0")
        assert v.stock == 18 and v.reserved == 0
        assert not db.scalars(select(Outbox).where(Outbox.kind == "order.paid")).all()


def test_expired_payment_does_not_oversell(client):
    login(client)
    o = order(client).json()
    with SessionLocal.begin() as db:
        db.get(Order, o["id"]).expires_at = int(time.time()) - 1
    result = post(
        client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"}
    ).json()
    assert result["payment"] == "abandoned"
    with SessionLocal() as db:
        assert db.get(Variant, "support-aluminium-0").stock == 18


def test_insufficient_stock_rolls_back_whole_order(client):
    login(client)
    result = post(
        client,
        "/orders",
        {
            "items": [
                {"variant_id": "coque-mate-0", "quantity": 2},
                {"variant_id": "support-ecran-0", "quantity": 3},
            ],
            "address": ADDRESS,
        },
        **{"Idempotency-Key": "insufficient-123"},
    )
    assert result.status_code == 409
    with SessionLocal() as db:
        assert db.get(Variant, "coque-mate-0").reserved == 0
        assert not db.scalars(select(Order)).all()


def test_cannot_read_another_customer_order(client):
    login(client)
    o = order(client).json()
    post(client, "/auth/logout")
    response = post(
        client,
        "/auth/register",
        {
            "name": "Autre Client",
            "email": "autre@example.com",
            "password": "long-password-demo-123",
        },
    )
    assert response.status_code == 201
    assert client.get("/api/orders/" + o["id"]).status_code == 404
    assert (
        post(
            client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"}
        ).status_code
        == 404
    )


def test_worker_outage_and_deduplication(client):
    login(client)
    o = order(client).json()
    post(client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"})
    assert client.get("/api/orders/" + o["id"]).json()["payment"] == "paid"
    process_once()
    process_once()
    with SessionLocal() as db:
        assert len(db.scalars(select(Message)).all()) == 1
        e = db.scalar(select(Outbox))
        assert e.state == "done"
        e.state = "pending"
        db.commit()
    process_once()
    with SessionLocal() as db:
        assert len(db.scalars(select(Message)).all()) == 1


def test_low_stock_and_supervised_support(client):
    login(client)
    response = post(
        client,
        "/support",
        {
            "subject": "Compatibilité produit",
            "message": "Ce support convient-il à mon ordinateur 14 pouces ?",
        },
    )
    assert response.status_code == 201
    process_once()
    with SessionLocal() as db:
        t = db.get(Ticket, response.json()["id"])
        assert t.state == "draft" and "11 à 16" in t.draft
        assert not db.scalars(select(Message)).all()
    login(client, "admin")
    for _ in range(2):
        assert (
            post(
                client,
                f"/admin/tickets/{response.json()['id']}/approve",
                {"draft": "Réponse vérifiée par notre équipe."},
            ).status_code
            == 200
        )
    with SessionLocal() as db:
        assert len(db.scalars(select(Message)).all()) == 1


def test_cancel_is_idempotent_and_transitions_valid(client):
    login(client)
    o = order(client).json()
    post(client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"})
    login(client, "admin")
    assert (
        post(client, f"/admin/orders/{o['id']}/state", {"state": "shipped"}).status_code
        == 409
    )
    for _ in range(2):
        assert (
            post(
                client, f"/admin/orders/{o['id']}/state", {"state": "cancelled"}
            ).status_code
            == 200
        )
    with SessionLocal() as db:
        assert db.get(Variant, "support-aluminium-0").stock == 18
        assert db.get(Order, o["id"]).payment == "refunded"


def test_signed_integration_rejects_tampering_and_replay_is_safe(client, monkeypatch):
    secret = "test-secret-" + ("a" * 40)
    monkeypatch.setenv("AUTOMATION_SECRET", secret)
    login(client)
    o = order(client).json()
    post(client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"})
    with SessionLocal() as db:
        e = db.scalar(select(Outbox))
        body = json.dumps(
            {"id": e.id, "kind": e.kind, "payload": e.payload}, separators=(",", ":")
        )
    timestamp = str(int(time.time()))
    signature = hmac.new(
        secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    headers = {
        "content-type": "application/json",
        "x-shopeo-timestamp": timestamp,
        "x-shopeo-signature": signature,
    }
    assert (
        client.post(
            "/api/integrations/process", content=body + " ", headers=headers
        ).status_code
        == 401
    )
    for _ in range(2):
        assert (
            client.post(
                "/api/integrations/process", content=body, headers=headers
            ).status_code
            == 200
        )
    with SessionLocal() as db:
        assert len(db.scalars(select(Message)).all()) == 1


def test_failed_delivery_retains_event(client, monkeypatch):
    login(client)
    o = order(client).json()
    post(client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"})
    monkeypatch.setenv("N8N_WEBHOOK_URL", "http://127.0.0.1:1/no-service")
    monkeypatch.setenv("AUTOMATION_SECRET", "b" * 40)
    process_once()
    with SessionLocal() as db:
        e = db.scalar(select(Outbox))
        assert e.state == "retry" and e.attempts == 1
        assert db.get(Order, o["id"]).payment == "paid"


def test_concurrent_last_item(client):
    if engine.dialect.name != "postgresql":
        return
    with SessionLocal.begin() as db:
        db.get(Variant, "support-ecran-0").stock = 1

    def buy(number):
        with TestClient(app) as c:
            c.get("/api/auth/session")
            post(
                c,
                "/auth/register",
                {
                    "name": "Client Concurrent",
                    "email": f"concurrent{number}@example.com",
                    "password": "long-password-12345",
                },
            )
            return order(c, variant="support-ecran-0").status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(buy, [1, 2]))
    assert sorted(results) == [201, 409]
    with SessionLocal() as db:
        v = db.get(Variant, "support-ecran-0")
        assert v.stock == 1 and v.reserved == 1


def test_low_stock_alert_not_repeated(client):
    login(client)
    for _ in range(2):
        o = order(client, variant="organiseur-cables-0").json()
        post(client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"})
    with SessionLocal() as db:
        assert (
            len(db.scalars(select(Outbox).where(Outbox.kind == "stock.low")).all()) == 1
        )


def test_rate_limit_persists_in_database(client):
    for _ in range(8):
        assert (
            post(
                client,
                "/auth/login",
                {"email": "none@example.com", "password": "incorrect"},
            ).status_code
            == 401
        )
    assert (
        post(
            client,
            "/auth/login",
            {"email": "none@example.com", "password": "incorrect"},
        ).status_code
        == 429
    )


def test_catalog_admin_changes_and_variant(client):
    login(client, "admin")
    body = {
        "name": "Produit de test",
        "category": "Bureau",
        "price": 1600,
        "description": "Description fictive de notre produit.",
        "compatibility": "Usage de démonstration",
        "image": 0,
        "archived": False,
    }
    response = post(client, "/admin/products", body)
    assert response.status_code == 201
    slug = response.json()["id"]
    assert (
        post(
            client,
            f"/admin/products/{slug}/variants",
            {"label": "Variante noire", "color": "black"},
        ).status_code
        == 201
    )
    assert len(client.get("/api/products/" + slug).json()["variants"]) == 2
    body["archived"] = True
    assert (
        post(client, "/admin/products/" + slug, body, method="PUT").status_code == 200
    )
    assert client.get("/api/products/" + slug).status_code == 404


def test_password_reset_single_use_revokes_sessions(client):
    login(client)
    assert (
        post(client, "/auth/forgot", {"email": "alex@shopeo.test"}).status_code == 200
    )
    with SessionLocal() as db:
        token = db.scalar(
            select(Message).where(Message.subject == "Récupération d’accès")
        ).body.split("token=")[1]
    body = {"token": token, "password": "changed-password-for-test-123"}
    assert post(client, "/auth/reset", body).status_code == 200
    assert client.get("/api/orders").status_code == 401
    assert post(client, "/auth/reset", body).status_code == 400


def test_hosted_simulation_does_not_need_admin_shortcuts(client, monkeypatch):
    from shopeo import main

    login(client)
    o = order(client).json()
    monkeypatch.setattr(main, "LOCAL_DEMO", False)
    assert post(client, "/auth/demo/admin").status_code == 404
    assert (
        post(
            client, f"/orders/{o['id']}/simulate-payment", {"outcome": "success"}
        ).json()["payment"]
        == "paid"
    )
