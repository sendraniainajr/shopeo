import hashlib
import hmac
import json
import os
import secrets
from contextlib import asynccontextmanager
from typing import Literal
import pyotp
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Request,
    Response,
    Header,
    BackgroundTasks,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session as DBSession
from .db import Base, engine, get_db, SessionLocal
from .models import (
    User,
    Session,
    ResetToken,
    Product,
    Variant,
    Order,
    Outbox,
    Ticket,
    Message,
    Audit,
    now,
)
from .security import (
    current_user,
    require_user,
    require_admin,
    csrf_cookie,
    login_session,
    public_user,
    password_ok,
    ph,
    digest,
    ensure_csrf,
    limit,
    LOCAL_DEMO,
    SECURE,
    COOKIE,
    PAYMENTS_SIMULATED,
)
from .commerce import (
    product_json,
    order_json,
    create_order,
    settle,
    cancel_order,
    expire_orders,
)
from .automation import consume, process_once
from .seed import seed


@asynccontextmanager
async def lifespan(app):
    if not LOCAL_DEMO and (
        not SECURE or not os.environ.get("DATABASE_URL", "").startswith("postgres")
    ):
        raise RuntimeError(
            "Configuration distante refusée : HTTPS et PostgreSQL requis."
        )
    if (
        os.environ.get("AUTO_CREATE_SCHEMA", "0" if os.environ.get("VERCEL") else "1")
        == "1"
    ):
        Base.metadata.create_all(engine)
    if os.environ.get("SEED_DEMO", "1") == "1" and LOCAL_DEMO:
        seed()
    yield


app = FastAPI(
    title="Shopeo API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if LOCAL_DEMO else None,
    redoc_url=None,
)


@app.middleware("http")
async def security_boundary(request, call_next):
    try:
        if int(request.headers.get("content-length", "0")) > 32768:
            return JSONResponse({"detail": "Requête trop volumineuse."}, 413)
        if (
            request.method in ["POST", "PUT", "PATCH", "DELETE"]
            and request.url.path != "/api/integrations/process"
        ):
            ensure_csrf(request)
        response = await call_next(request)
    except HTTPException as exc:
        response = JSONResponse({"detail": exc.detail}, exc.status_code)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(StrictBody):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)
    otp: str = Field(default="", max_length=10)


class Register(StrictBody):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=12, max_length=256)


class Address(StrictBody):
    name: str = Field(min_length=2, max_length=100)
    street: str = Field(min_length=3, max_length=200)
    postal: str = Field(min_length=2, max_length=15)
    city: str = Field(min_length=2, max_length=100)
    country: Literal["France"] = "France"


class CartLine(StrictBody):
    variant_id: str = Field(max_length=100)
    quantity: int = Field(ge=1, le=10)


class Checkout(StrictBody):
    items: list[CartLine] = Field(min_length=1, max_length=30)
    address: Address


class Payment(StrictBody):
    outcome: Literal["success", "decline", "abandon"]


class Support(StrictBody):
    subject: str = Field(min_length=3, max_length=140)
    message: str = Field(min_length=10, max_length=3000)


class Approval(StrictBody):
    draft: str = Field(min_length=10, max_length=3000)


class StockChange(StrictBody):
    stock: int = Field(ge=0, le=100000)
    reason: str = Field(min_length=5, max_length=200)


class ProductEdit(StrictBody):
    name: str = Field(min_length=3, max_length=120)
    category: Literal["Smartphone", "Ordinateur", "Bureau"]
    price: int = Field(gt=0, le=10000000)
    description: str = Field(min_length=10, max_length=3000)
    compatibility: str = Field(min_length=3, max_length=200)
    image: int = Field(ge=0, le=5)
    archived: bool = False


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "demo": LOCAL_DEMO,
        "database": engine.dialect.name,
        "automation": "n8n" if os.environ.get("N8N_WEBHOOK_URL") else "local",
        "ai": "modèle externe supervisé"
        if os.environ.get("AI_GATEWAY_URL")
        else "simulation supervisée",
    }


@app.get("/api/auth/session")
def session(request: Request, response: Response, user=Depends(current_user)):
    csrf_cookie(request, response)
    return {"user": public_user(user), "demo": LOCAL_DEMO}


@app.post("/api/auth/login")
def login(
    body: Login,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db, scope="function"),
):
    limit(request, "login", 8, 60)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    valid = password_ok(user.password_hash if user else None, body.password)
    if not user or not valid:
        raise HTTPException(401, "Identifiants incorrects.")
    if user.role == "admin" and (
        not user.totp_secret
        or not pyotp.TOTP(user.totp_secret).verify(body.otp, valid_window=1)
    ):
        raise HTTPException(401, "Code de double authentification requis ou incorrect.")
    login_session(db, user, response)
    db.add(Audit(actor=user.id, action="auth.login", target=user.id))
    return public_user(user)


@app.post("/api/auth/register", status_code=201)
def register(
    body: Register,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db, scope="function"),
):
    limit(request, "register", 5, 300)
    email = str(body.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(
            409, "Inscription impossible. Essayez la récupération d’accès."
        )
    user = User(email=email, name=body.name, password_hash=ph.hash(body.password))
    db.add(user)
    db.flush()
    login_session(db, user, response)
    return public_user(user)


@app.post("/api/auth/demo/{role}")
def demo(
    role: Literal["customer", "admin"],
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db, scope="function"),
):
    if not LOCAL_DEMO:
        raise HTTPException(404)
    limit(request, "demo", 20, 60)
    user = db.scalar(
        select(User).where(
            User.email
            == ("admin@shopeo.test" if role == "admin" else "alex@shopeo.test")
        )
    )
    if not user:
        raise HTTPException(503, "Comptes de démonstration indisponibles.")
    login_session(db, user, response)
    db.add(Audit(actor=user.id, action="auth.demo.local", target=user.id))
    return public_user(user)


@app.post("/api/auth/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db, scope="function"),
):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(Session).where(Session.token_hash == digest(token)))
    response.delete_cookie(COOKIE, path="/")


class Forgot(StrictBody):
    email: str = Field(min_length=3, max_length=254)


@app.post("/api/auth/forgot")
def forgot(
    body: Forgot, request: Request, db: DBSession = Depends(get_db, scope="function")
):
    limit(request, "forgot", 4, 300)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user:
        token = secrets.token_urlsafe(32)
        db.add(
            ResetToken(
                token_hash=digest(token), user_id=user.id, expires_at=now() + 1800
            )
        )
        db.add(
            Message(
                id=secrets.token_hex(16),
                recipient=user.email,
                subject="Récupération d’accès",
                body=(
                    "Lien de démonstration : "
                    + (
                        os.environ.get("PUBLIC_SITE_URL")
                        or (
                            "https://" + os.environ["VERCEL_PROJECT_PRODUCTION_URL"]
                            if os.environ.get("VERCEL_PROJECT_PRODUCTION_URL")
                            else "http://127.0.0.1:3100"
                        )
                    ).rstrip("/")
                    + f"/compte/reinitialiser?token={token}"
                ),
            )
        )
    return {
        "message": "Si un compte correspond à cette adresse, un lien de récupération a été préparé."
    }


class Reset(StrictBody):
    token: str = Field(min_length=20, max_length=100)
    password: str = Field(min_length=12, max_length=256)


@app.post("/api/auth/reset")
def reset(
    body: Reset, request: Request, db: DBSession = Depends(get_db, scope="function")
):
    limit(request, "reset", 8, 300)
    token = db.scalar(
        select(ResetToken)
        .where(ResetToken.token_hash == digest(body.token))
        .with_for_update()
    )
    if not token or token.used or token.expires_at < now():
        raise HTTPException(400, "Lien invalide ou expiré.")
    user = db.get(User, token.user_id)
    user.password_hash = ph.hash(body.password)
    token.used = True
    db.execute(delete(Session).where(Session.user_id == user.id))
    return {
        "message": "Mot de passe modifié. Connectez-vous avec le nouveau mot de passe."
    }


@app.get("/api/products")
def products(db: DBSession = Depends(get_db, scope="function")):
    expire_orders(db)
    return [
        product_json(p)
        for p in db.scalars(select(Product).where(Product.archived == False))
    ]


@app.get("/api/products/{slug}")
def product(slug: str, db: DBSession = Depends(get_db, scope="function")):
    expire_orders(db)
    p = db.get(Product, slug)
    if not p or p.archived:
        raise HTTPException(404, "Produit introuvable.")
    return product_json(p)


@app.post("/api/orders", status_code=201)
def checkout(
    body: Checkout,
    request: Request,
    idempotency_key: str = Header(min_length=8, max_length=100),
    user=Depends(require_user),
    db: DBSession = Depends(get_db, scope="function"),
):
    limit(request, "checkout", 20, 60)
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    return order_json(create_order(db, user, body, idempotency_key))


def owned_order(db, order_id, user, lock=False):
    statement = select(Order).where(Order.id == order_id)
    if lock:
        statement = statement.with_for_update()
    order = db.scalar(statement)
    if not order or (order.user_id != user.id and user.role != "admin"):
        raise HTTPException(404, "Commande introuvable.")
    return order


@app.post("/api/orders/{order_id}/simulate-payment")
def simulate(
    order_id: str,
    body: Payment,
    background: BackgroundTasks,
    user=Depends(require_user),
    db: DBSession = Depends(get_db, scope="function"),
):
    if not PAYMENTS_SIMULATED:
        raise HTTPException(404)
    order = owned_order(db, order_id, user, True)
    if os.environ.get("VERCEL") and not os.environ.get("N8N_WEBHOOK_URL"):
        background.add_task(process_once)
    return order_json(settle(db, order, body.outcome))


@app.get("/api/orders")
def orders(
    user=Depends(require_user), db: DBSession = Depends(get_db, scope="function")
):
    return [
        order_json(o)
        for o in db.scalars(
            select(Order)
            .where(Order.user_id == user.id)
            .order_by(Order.created_at.desc())
        )
    ]


@app.get("/api/orders/{order_id}")
def order(
    order_id: str,
    user=Depends(require_user),
    db: DBSession = Depends(get_db, scope="function"),
):
    return order_json(owned_order(db, order_id, user))


@app.post("/api/support", status_code=201)
def support(
    body: Support,
    request: Request,
    background: BackgroundTasks,
    user=Depends(require_user),
    db: DBSession = Depends(get_db, scope="function"),
):
    limit(request, "support", 5, 300)
    ticket = Ticket(user_id=user.id, subject=body.subject, message=body.message)
    db.add(ticket)
    db.flush()
    db.add(Outbox(kind="support.created", payload={"ticket_id": ticket.id}))
    if os.environ.get("VERCEL") and not os.environ.get("N8N_WEBHOOK_URL"):
        background.add_task(process_once)
    return {
        "id": ticket.id,
        "message": "Votre demande a été enregistrée. Notre équipe va la traiter.",
    }


@app.get("/api/support")
def my_tickets(
    user=Depends(require_user), db: DBSession = Depends(get_db, scope="function")
):
    return [
        {
            "id": t.id,
            "subject": t.subject,
            "message": t.message,
            "state": t.state,
            "answer": t.draft if t.state == "sent" else None,
        }
        for t in db.scalars(
            select(Ticket)
            .where(Ticket.user_id == user.id)
            .order_by(Ticket.created_at.desc())
        )
    ]


@app.get("/api/admin/overview")
def overview(
    user=Depends(require_admin), db: DBSession = Depends(get_db, scope="function")
):
    all_orders = db.scalars(select(Order).order_by(Order.created_at.desc())).all()
    tickets = db.scalars(select(Ticket).order_by(Ticket.created_at.desc())).all()
    catalog = db.scalars(select(Product)).all()
    events = db.scalars(
        select(Outbox).order_by(Outbox.created_at.desc()).limit(50)
    ).all()
    messages = db.scalars(
        select(Message).order_by(Message.created_at.desc()).limit(30)
    ).all()
    return {
        "stats": {
            "orders": len(all_orders),
            "total": sum(o.total for o in all_orders if o.payment == "paid"),
            "low_stock": sum(v.stock <= 3 for p in catalog for v in p.variants),
            "tickets": sum(t.state != "sent" for t in tickets),
        },
        "orders": [
            {**order_json(o), "customer": db.get(User, o.user_id).name}
            for o in all_orders
        ],
        "products": [product_json(p) for p in catalog],
        "tickets": [
            {
                "id": t.id,
                "subject": t.subject,
                "message": t.message,
                "draft": t.draft,
                "source": t.source,
                "state": t.state,
                "customer": db.get(User, t.user_id).name,
            }
            for t in tickets
        ],
        "events": [
            {
                "id": e.id,
                "kind": e.kind,
                "state": e.state,
                "attempts": e.attempts,
                "error": e.error,
                "mode": e.mode,
            }
            for e in events
        ],
        "messages": [
            {"id": m.id, "recipient": m.recipient, "subject": m.subject, "body": m.body}
            for m in messages
        ],
        "audit": [
            {
                "id": a.id,
                "action": a.action,
                "target": a.target,
                "detail": a.detail,
                "created_at": a.created_at,
            }
            for a in db.scalars(
                select(Audit).order_by(Audit.created_at.desc()).limit(30)
            )
        ],
        "integration_mode": "n8n"
        if os.environ.get("N8N_WEBHOOK_URL")
        else "Simulateur local",
        "ai_mode": "Modèle externe supervisé"
        if os.environ.get("AI_GATEWAY_URL")
        else "Simulation déterministe supervisée",
    }


@app.post("/api/admin/events/{event_id}/retry")
def retry(
    event_id: str,
    user=Depends(require_admin),
    db: DBSession = Depends(get_db, scope="function"),
):
    event = db.get(Outbox, event_id)
    if not event:
        raise HTTPException(404)
    if event.state == "done":
        raise HTTPException(409, "Cet événement est déjà terminé.")
    event.state = "pending"
    event.attempts = 0
    event.next_attempt = 0
    db.add(Audit(actor=user.id, action="event.retry", target=event.id))
    return {"ok": True}


@app.post("/api/admin/stock/{variant_id}")
def stock(
    variant_id: str,
    body: StockChange,
    user=Depends(require_admin),
    db: DBSession = Depends(get_db, scope="function"),
):
    variant = db.scalar(
        select(Variant).where(Variant.id == variant_id).with_for_update()
    )
    if not variant:
        raise HTTPException(404)
    if body.stock < variant.reserved:
        raise HTTPException(
            409, "Le stock ne peut pas être inférieur aux réservations actives."
        )
    old = variant.stock
    variant.stock = body.stock
    if body.stock > 3:
        variant.low_alerted = False
    db.add(
        Audit(
            actor=user.id,
            action="stock.adjust",
            target=variant_id,
            detail=f"{old} → {body.stock} : {body.reason}",
        )
    )
    return {"ok": True}


@app.put("/api/admin/products/{slug}")
def edit_product(
    slug: str,
    body: ProductEdit,
    user=Depends(require_admin),
    db: DBSession = Depends(get_db, scope="function"),
):
    p = db.get(Product, slug)
    if not p:
        raise HTTPException(404)
    for key, value in body.model_dump().items():
        setattr(p, key, value)
    db.add(Audit(actor=user.id, action="product.update", target=slug))
    return product_json(p)


class VariantEdit(StrictBody):
    label: str = Field(min_length=2, max_length=100)
    color: Literal["silver", "black", "gray", "blue", "white"] = "silver"


@app.post("/api/admin/products/{slug}/variants", status_code=201)
def add_variant(
    slug: str,
    body: VariantEdit,
    user=Depends(require_admin),
    db: DBSession = Depends(get_db, scope="function"),
):
    p = db.get(Product, slug)
    if not p:
        raise HTTPException(404)
    v = Variant(
        id=slug + "-" + secrets.token_hex(4),
        product_id=slug,
        label=body.label,
        color=body.color,
        stock=0,
    )
    db.add(v)
    db.add(Audit(actor=user.id, action="variant.create", target=v.id))
    return {"ok": True}


@app.put("/api/admin/variants/{variant_id}")
def edit_variant(
    variant_id: str,
    body: VariantEdit,
    user=Depends(require_admin),
    db: DBSession = Depends(get_db, scope="function"),
):
    v = db.get(Variant, variant_id)
    if not v:
        raise HTTPException(404)
    v.label = body.label
    v.color = body.color
    db.add(Audit(actor=user.id, action="variant.update", target=v.id))
    return {"ok": True}


@app.post("/api/admin/products", status_code=201)
def add_product(
    body: ProductEdit,
    user=Depends(require_admin),
    db: DBSession = Depends(get_db, scope="function"),
):
    p = Product(id="produit-" + secrets.token_hex(5), **body.model_dump())
    p.variants = [Variant(id=p.id + "-0", label="Standard", color="silver", stock=0)]
    db.add(p)
    db.flush()
    db.add(Audit(actor=user.id, action="product.create", target=p.id))
    return product_json(p)


class Fulfillment(StrictBody):
    state: Literal["prepared", "shipped", "cancelled"]


@app.post("/api/admin/orders/{order_id}/state")
def fulfillment(
    order_id: str,
    body: Fulfillment,
    user=Depends(require_admin),
    db: DBSession = Depends(get_db, scope="function"),
):
    o = owned_order(db, order_id, user, True)
    if body.state == "cancelled":
        cancel_order(db, o, user.id)
    elif (
        o.payment != "paid"
        or {"prepared": "awaiting", "shipped": "prepared"}[body.state] != o.fulfillment
    ):
        raise HTTPException(409, "Transition de commande non autorisée.")
    else:
        o.fulfillment = body.state
        db.add(Audit(actor=user.id, action="order." + body.state, target=o.id))
    return order_json(o)


@app.post("/api/admin/tickets/{ticket_id}/approve")
def approve(
    ticket_id: str,
    body: Approval,
    user=Depends(require_admin),
    db: DBSession = Depends(get_db, scope="function"),
):
    t = db.scalar(select(Ticket).where(Ticket.id == ticket_id).with_for_update())
    if not t:
        raise HTTPException(404)
    if t.state == "sent":
        return {"ok": True}
    if t.state != "draft":
        raise HTTPException(409, "Le brouillon n’est pas encore disponible.")
    t.draft = body.draft
    t.state = "sent"
    db.add(
        Message(
            id="ticket-" + t.id,
            recipient=db.get(User, t.user_id).email,
            subject=t.subject,
            body=t.draft,
        )
    )
    db.add(Audit(actor=user.id, action="support.approve", target=t.id))
    return {"ok": True}


@app.post("/api/integrations/process")
async def process_event(request: Request):
    raw = await request.body()
    if len(raw) > 32768:
        raise HTTPException(413)
    secret = os.environ.get("AUTOMATION_SECRET", "")
    timestamp = request.headers.get("x-shopeo-timestamp", "")
    signature = request.headers.get("x-shopeo-signature", "")
    if len(secret) < 32 or not timestamp.isdigit() or abs(now() - int(timestamp)) > 300:
        raise HTTPException(401, "Signature invalide.")
    expected = hmac.new(
        secret.encode(), timestamp.encode() + b"." + raw, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Signature invalide.")
    try:
        payload = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Événement invalide.")
    with SessionLocal.begin() as db:
        event = db.scalar(select(Outbox).where(Outbox.id == payload.get("id")))
        if (
            not event
            or event.kind != payload.get("kind")
            or event.payload != payload.get("payload")
        ):
            raise HTTPException(400, "Événement inconnu.")
        if engine.dialect.name == "postgresql":
            lock_id = int(hashlib.sha256(event.id.encode()).hexdigest()[:15], 16)
            db.execute(select(func.pg_advisory_xact_lock(lock_id)))
        consume(db, event)
        return {"processed": event.id}


@app.get("/api/integrations/dispatch")
def dispatch(authorization: str = Header(default="")):
    secret = os.environ.get("CRON_SECRET", "")
    if len(secret) < 32 or not hmac.compare_digest(authorization, "Bearer " + secret):
        raise HTTPException(401)
    process_once()
    return {"ok": True}
