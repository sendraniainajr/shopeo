import hashlib
import json
import secrets
from fastapi import HTTPException
from sqlalchemy import select, update
from .models import Product, Variant, Order, OrderItem, Outbox, Audit, now


def product_json(p):
    return {
        "id": p.id,
        "name": p.name,
        "category": p.category,
        "price": p.price,
        "description": p.description,
        "compatibility": p.compatibility,
        "image": p.image,
        "archived": p.archived,
        "variants": [
            {
                "id": v.id,
                "label": v.label,
                "color": v.color,
                "available": v.stock - v.reserved,
                "stock": v.stock,
            }
            for v in p.variants
        ],
    }


def order_json(o):
    return {
        "id": o.id,
        "number": o.number,
        "subtotal": o.subtotal,
        "shipping": o.shipping,
        "total": o.total,
        "currency": o.currency,
        "payment": o.payment,
        "fulfillment": o.fulfillment,
        "created_at": o.created_at,
        "address": o.address,
        "items": [
            {
                "name": i.name,
                "variant": i.variant,
                "price": i.price,
                "quantity": i.quantity,
                "image": i.image,
                "product_id": i.product_id,
            }
            for i in o.items
        ],
    }


def expire_orders(db):
    pending = db.scalars(
        select(Order)
        .where(Order.payment == "pending", Order.expires_at < now())
        .with_for_update()
    ).all()
    for order in pending:
        settle(db, order, "abandon")


def create_order(db, user, body, key):
    expire_orders(db)
    payload = body.model_dump()
    fingerprint = hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode()
    ).hexdigest()
    existing = db.scalar(
        select(Order).where(Order.user_id == user.id, Order.key == key)
    )
    if existing:
        if existing.request_hash != fingerprint:
            raise HTTPException(
                409,
                "Cette référence de commande a déjà été utilisée avec un autre panier.",
            )
        return existing
    combined = {}
    for line in body.items:
        combined[line.variant_id] = combined.get(line.variant_id, 0) + line.quantity
    if any(q > 10 for q in combined.values()):
        raise HTTPException(422, "Maximum 10 exemplaires par variante.")
    order = Order(
        number="SHP-" + secrets.token_hex(4).upper(),
        user_id=user.id,
        key=key,
        request_hash=fingerprint,
        subtotal=0,
        total=0,
        address=body.address.model_dump(),
        expires_at=now() + 900,
    )
    db.add(order)
    db.flush()
    subtotal = 0
    for variant_id, quantity in sorted(combined.items()):
        variant = db.get(Variant, variant_id)
        product = db.get(Product, variant.product_id) if variant else None
        if not product or product.archived:
            raise HTTPException(409, "Un produit n’est plus disponible.")
        reserved = db.execute(
            update(Variant)
            .where(
                Variant.id == variant_id, Variant.stock - Variant.reserved >= quantity
            )
            .values(reserved=Variant.reserved + quantity)
            .execution_options(synchronize_session=False)
        )
        if reserved.rowcount != 1:
            raise HTTPException(409, f"Stock insuffisant pour {product.name}.")
        order.items.append(
            OrderItem(
                variant_id=variant_id,
                product_id=product.id,
                name=product.name,
                variant=variant.label,
                price=product.price,
                quantity=quantity,
                image=product.image,
            )
        )
        subtotal += product.price * quantity
    order.subtotal = subtotal
    order.shipping = 490
    order.total = subtotal + order.shipping
    db.flush()
    return order


def settle(db, order, outcome):
    if order.payment != "pending":
        return order
    success = outcome == "success" and order.expires_at >= now()
    for item in order.items:
        values = {"reserved": Variant.reserved - item.quantity}
        if success:
            values["stock"] = Variant.stock - item.quantity
        db.execute(
            update(Variant)
            .where(Variant.id == item.variant_id, Variant.reserved >= item.quantity)
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        if success:
            variant = db.scalar(
                select(Variant)
                .where(Variant.id == item.variant_id)
                .execution_options(populate_existing=True)
            )
            if variant.stock <= 3 and not variant.low_alerted:
                variant.low_alerted = True
                db.add(
                    Outbox(
                        kind="stock.low",
                        payload={
                            "variant_id": variant.id,
                            "product": item.name,
                            "remaining": variant.stock,
                        },
                    )
                )
    order.payment = (
        "paid" if success else ("failed" if outcome == "decline" else "abandoned")
    )
    order.fulfillment = "awaiting" if success else "cancelled"
    if success:
        db.add(
            Outbox(
                kind="order.paid",
                payload={"order_id": order.id, "number": order.number},
            )
        )
    db.add(
        Audit(
            actor=order.user_id,
            action="payment.simulated." + order.payment,
            target=order.id,
        )
    )
    db.flush()
    return order


def cancel_order(db, order, actor):
    if order.fulfillment == "shipped":
        raise HTTPException(409, "Une commande expédiée ne peut plus être annulée ici.")
    if order.fulfillment == "cancelled":
        return
    if order.payment == "pending":
        settle(db, order, "abandon")
    elif order.payment == "paid":
        for item in order.items:
            db.execute(
                update(Variant)
                .where(Variant.id == item.variant_id)
                .values(stock=Variant.stock + item.quantity, low_alerted=False)
                .execution_options(synchronize_session=False)
            )
        order.payment = "refunded"
    order.fulfillment = "cancelled"
    db.add(Audit(actor=actor, action="order.cancel", target=order.id))
