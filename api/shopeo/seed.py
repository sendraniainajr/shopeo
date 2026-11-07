import json
import secrets
import os
import pyotp
from sqlalchemy import select
from .db import SessionLocal, RUNTIME
from .models import Product, Variant, User
from .security import ph

CATALOG = [
    (
        "support-aluminium",
        "Support aluminium",
        "Bureau",
        3900,
        0,
        "Surélevez votre ordinateur et retrouvez un bureau organisé. Une structure en aluminium, des patins antidérapants et une silhouette épurée.",
        "Ordinateurs de 11 à 16 pouces",
        [("Argent", "silver", 18), ("Noir", "black", 8)],
    ),
    (
        "housse-ordinateur",
        "Housse ordinateur",
        "Ordinateur",
        2900,
        1,
        "Une housse en tissu doux pour accompagner vos déplacements. Doublure protectrice et fermeture zippée.",
        "Choisir la taille correspondant à votre ordinateur",
        [("13 pouces · Gris", "gray", 14), ("15 pouces · Gris", "gray", 9)],
    ),
    (
        "coque-mate",
        "Coque mate",
        "Smartphone",
        1900,
        2,
        "Une finition mate et une prise en main agréable. Vérifiez le modèle de téléphone avant de commander.",
        "Modèles fictifs Shopeo Phone 14 et 15 uniquement",
        [("Phone 14 · Noir", "black", 12), ("Phone 15 · Bleu", "blue", 8)],
    ),
    (
        "organiseur-cables",
        "Organiseur de câbles",
        "Bureau",
        1200,
        3,
        "Rassemblez les petits câbles de votre quotidien dans un organiseur compact et souple.",
        "Câbles jusqu’à 5 mm de diamètre",
        [("Gris", "gray", 3), ("Noir", "black", 15)],
    ),
    (
        "rehausseur-ordinateur",
        "Rehausseur ordinateur",
        "Bureau",
        3400,
        4,
        "Créez de la place sur votre bureau avec ce rehausseur au design sobre. Un espace de rangement discret pour le clavier.",
        "Écrans jusqu’à 8 kg — dimensions à vérifier",
        [("Argent", "silver", 12), ("Noir", "black", 6)],
    ),
    (
        "souris-sans-fil",
        "Souris sans fil",
        "Ordinateur",
        2400,
        5,
        "Une souris compacte pour les tâches du quotidien. Connexion par récepteur USB, format ambidextre.",
        "Windows, macOS et Linux avec port USB-A",
        [("Noir", "black", 24), ("Blanc", "white", 12)],
    ),
    (
        "support-pliable",
        "Support pliable",
        "Bureau",
        2500,
        0,
        "Un support facile à ranger pour travailler où vous le souhaitez.",
        "Ordinateurs de 11 à 15 pouces",
        [("Argent", "silver", 10)],
    ),
    (
        "pochette-voyage",
        "Pochette de voyage",
        "Ordinateur",
        2200,
        1,
        "Gardez vos petits accessoires réunis pendant vos déplacements.",
        "Petits accessoires et câbles",
        [("Anthracite", "gray", 16)],
    ),
    (
        "coque-souple",
        "Coque souple",
        "Smartphone",
        1500,
        2,
        "Une protection souple pour votre téléphone de démonstration.",
        "Shopeo Phone 14 uniquement",
        [("Noir", "black", 16)],
    ),
    (
        "attaches-cables",
        "Attaches de câbles",
        "Bureau",
        800,
        3,
        "Un lot de cinq attaches réutilisables pour un bureau plus net.",
        "Câbles standards",
        [("Gris · lot de 5", "gray", 30)],
    ),
    (
        "support-ecran",
        "Support écran compact",
        "Bureau",
        4500,
        4,
        "Un format compact pour gagner en confort et en espace.",
        "Écran jusqu’à 6 kg",
        [("Argent", "silver", 2)],
    ),
    (
        "souris-compacte",
        "Souris compacte",
        "Ordinateur",
        1900,
        5,
        "Un petit format à glisser dans une housse.",
        "Port USB-A requis",
        [("Noir", "black", 20)],
    ),
]


def seed(accounts_enabled=True):
    with SessionLocal.begin() as db:
        if not db.scalar(select(Product.id).limit(1)):
            for (
                slug,
                name,
                category,
                price,
                image,
                description,
                compatibility,
                variants,
            ) in CATALOG:
                product = Product(
                    id=slug,
                    name=name,
                    category=category,
                    price=price,
                    image=image,
                    description=description,
                    compatibility=compatibility,
                )
                product.variants = [
                    Variant(id=f"{slug}-{i}", label=label, color=color, stock=stock)
                    for i, (label, color, stock) in enumerate(variants)
                ]
                db.add(product)
        if not accounts_enabled:
            return
        accounts = {}
        for role, name, email in [
            ("customer", "Alex", "alex@shopeo.test"),
            ("admin", "Administrateur", "admin@shopeo.test"),
        ]:
            if not db.scalar(select(User).where(User.email == email)):
                password = secrets.token_urlsafe(20)
                totp = pyotp.random_base32() if role == "admin" else None
                db.add(
                    User(
                        email=email,
                        name=name,
                        role=role,
                        password_hash=ph.hash(password),
                        totp_secret=totp,
                    )
                )
                accounts[role] = {
                    "email": email,
                    "password": password,
                    "totp_secret": totp,
                }
        if accounts:
            (RUNTIME / "local-accounts.json").write_text(
                json.dumps(accounts, indent=2), encoding="utf-8"
            )


def bootstrap_admin():
    email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").lower()
    password = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")
    totp = os.environ.get("BOOTSTRAP_ADMIN_TOTP_SECRET", "")
    if not email:
        return
    if len(password) < 20 or len(totp) < 32:
        raise RuntimeError("Configuration administrateur insuffisante.")
    with SessionLocal.begin() as db:
        if not db.scalar(select(User).where(User.email == email)):
            db.add(
                User(
                    email=email,
                    name="Administrateur",
                    role="admin",
                    password_hash=ph.hash(password),
                    totp_secret=totp,
                )
            )
