"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Smartphone,
  Laptop,
  LampDesk,
  ChevronRight,
  SlidersHorizontal,
  ShoppingCart,
  Trash2,
  ArrowLeft,
  Info,
  UserRound,
  Check,
  ShieldCheck,
  X,
} from "lucide-react";
import { api, send, euro, type Order } from "../../lib/api";
import { Photo, Quantity, ProductCard, Empty, ErrorBox } from "../ui";
import type { Shared } from "../types";

export function Home({ shared: s }: { shared: Shared }) {
  return (
    <div className="container home">
      <section className="hero">
        <div className="hero-copy">
          <h1>Les essentiels de votre quotidien connecté.</h1>
          <p>
            Des accessoires pratiques et élégants pour votre smartphone, votre
            ordinateur et votre espace de travail.
          </p>
          <Link href="/catalogue" className="button hero-cta">
            Découvrir la collection
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="hero-assistant">
          <span className="assistant-greeting">Bonjour !</span>
          <img
            src="/images/assistant.png"
            alt="L’assistant Shopeo vous souhaite la bienvenue"
            width="420"
            height="460"
          />
          <span className="assistant-caption">
            De petits accessoires.
            <br />
            De grandes idées au quotidien.
          </span>
        </div>
      </section>
      <section className="selection">
        <div className="section-title">
          <h2>Notre sélection</h2>
          <Link href="/catalogue">
            Tout découvrir <ArrowRight size={17} />
          </Link>
        </div>
        <div className="product-grid home-grid">
          {s.products.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} onAdd={s.add} />
          ))}
        </div>
      </section>
      <section className="categories" aria-label="Explorer les catégories">
        {[
          {
            name: "Smartphone",
            text: "Protégez et équipez votre mobile.",
            icon: Smartphone,
          },
          {
            name: "Ordinateur",
            text: "Des accessoires qui simplifient votre quotidien.",
            icon: Laptop,
          },
          {
            name: "Bureau",
            text: "Un espace de travail plus pratique et organisé.",
            icon: LampDesk,
          },
        ].map((c) => (
          <Link
            className="category-tile"
            key={c.name}
            href={"/catalogue?categorie=" + c.name}
          >
            <span className="category-icon">
              <c.icon />
            </span>
            <div>
              <h3>{c.name}</h3>
              <p>{c.text}</p>
            </div>
            <ChevronRight size={20} />
          </Link>
        ))}
      </section>
      <section className="home-note">
        <ShieldCheck />
        <div>
          <h3>Explorez Shopeo en toute simplicité.</h3>
          <p>
            Consultez les compatibilités, choisissez vos accessoires et testez
            une commande sans aucun débit réel.
          </p>
        </div>
        <Link href="/assistance">Une question ?</Link>
      </section>
    </div>
  );
}

export function Catalog({ shared: s }: { shared: Shared }) {
  const params = useSearchParams();
  const [categories, setCategories] = useState<string[]>([]),
    [available, setAvailable] = useState(false),
    [min, setMin] = useState(""),
    [max, setMax] = useState(""),
    [sort, setSort] = useState("relevance"),
    [page, setPage] = useState(1),
    [filters, setFilters] = useState(false);
  const query = params.get("q") || "";
  const category = params.get("categorie");
  useEffect(() => {
    setCategories(category ? [category] : []);
    setPage(1);
  }, [category, query]);
  let list = s.products.filter(
    (p) =>
      (!categories.length || categories.includes(p.category)) &&
      (!query ||
        `${p.name} ${p.description}`
          .toLocaleLowerCase("fr")
          .includes(query.toLocaleLowerCase("fr"))) &&
      (!available || p.variants.some((v) => v.available > 0)) &&
      (!min || p.price >= Number(min) * 100) &&
      (!max || p.price <= Number(max) * 100),
  );
  if (sort === "price-up") list.sort((a, b) => a.price - b.price);
  if (sort === "price-down") list.sort((a, b) => b.price - a.price);
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(list.length / 6));
  const shown = list.slice(
    (Math.min(page, pages) - 1) * 6,
    Math.min(page, pages) * 6,
  );
  function clear() {
    setCategories([]);
    setAvailable(false);
    setMin("");
    setMax("");
    setPage(1);
  }
  return (
    <div className="container catalog">
      <div className="breadcrumb">
        <Link href="/">Accueil</Link>
        <ChevronRight size={13} />
        Les accessoires
      </div>
      <div className="catalog-layout">
        <aside className={"filter-panel " + (filters ? "is-open" : "")}>
          <h2>
            Filtres{" "}
            <button
              className="icon-button mobile-only"
              onClick={() => setFilters(false)}
              aria-label="Fermer les filtres"
            >
              <X />
            </button>
          </h2>
          <fieldset>
            <legend>Catégorie</legend>
            {["Smartphone", "Ordinateur", "Bureau"].map((c) => (
              <label className="check-label" key={c}>
                <input
                  type="checkbox"
                  checked={categories.includes(c)}
                  onChange={(e) => {
                    setCategories(
                      e.target.checked
                        ? [...categories, c]
                        : categories.filter((x) => x !== c),
                    );
                    setPage(1);
                  }}
                />
                {c}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Disponibilité</legend>
            <label className="check-label">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => {
                  setAvailable(e.target.checked);
                  setPage(1);
                }}
              />
              En stock
            </label>
          </fieldset>
          <fieldset>
            <legend>Prix</legend>
            <div className="price-inputs">
              <input
                type="number"
                min="0"
                aria-label="Prix minimum en euros"
                placeholder="Min. (€)"
                value={min}
                onChange={(e) => {
                  setMin(e.target.value);
                  setPage(1);
                }}
              />
              <span>–</span>
              <input
                type="number"
                min="0"
                aria-label="Prix maximum en euros"
                placeholder="Max. (€)"
                value={max}
                onChange={(e) => {
                  setMax(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </fieldset>
          <button
            className="button full"
            onClick={() => {
              setFilters(false);
              setPage(1);
            }}
          >
            Appliquer les filtres
          </button>
          <button className="text-button full muted" onClick={clear}>
            Réinitialiser
          </button>
        </aside>
        <section className="catalog-results">
          <div className="catalog-heading">
            <div>
              <h1>{query ? "Résultats de recherche" : "Les accessoires"}</h1>
              <p>
                {list.length} produit{list.length !== 1 ? "s" : ""}
                {query && ` pour « ${query} »`}
              </p>
            </div>
            <label className="sort-label">
              <span className="sr-only">Trier les produits</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                <option value="relevance">Trier par : pertinence</option>
                <option value="price-up">Prix croissant</option>
                <option value="price-down">Prix décroissant</option>
                <option value="name">Nom du produit</option>
              </select>
            </label>
          </div>
          <button
            className="button outline mobile-only filter-trigger"
            onClick={() => setFilters(!filters)}
          >
            <SlidersHorizontal size={17} />
            Filtres
          </button>
          {shown.length ? (
            <>
              <div className="product-grid catalog-grid">
                {shown.map((p) => (
                  <ProductCard key={p.id} product={p} onAdd={s.add} />
                ))}
              </div>
              <nav className="pagination" aria-label="Pages du catalogue">
                <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Précédent
                </button>
                {Array.from({ length: pages }, (_, i) => (
                  <button
                    key={i}
                    aria-current={page === i + 1 ? "page" : undefined}
                    className={page === i + 1 ? "active" : ""}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Suivant
                </button>
              </nav>
            </>
          ) : (
            <Empty
              title="Aucun accessoire trouvé"
              text="Essayez d’autres filtres ou une autre recherche."
            />
          )}
        </section>
      </div>
    </div>
  );
}

export function ProductDetail({
  shared: s,
  slug,
}: {
  shared: Shared;
  slug: string;
}) {
  const p = s.products.find((p) => p.id === slug);
  const [variant, setVariant] = useState(""),
    [quantity, setQuantity] = useState(1),
    [tab, setTab] = useState("Description");
  if (!p)
    return (
      <Empty
        title="Produit introuvable"
        text="Ce produit n’est plus disponible dans le catalogue."
      />
    );
  const selected = p.variants.find((v) => v.id === variant) || p.variants[0];
  return (
    <div className="container product-detail">
      <div className="breadcrumb">
        <Link href="/">Accueil</Link>
        <ChevronRight size={13} />
        <Link href={"/catalogue?categorie=" + p.category}>{p.category}</Link>
        <ChevronRight size={13} />
        {p.name}
      </div>
      <div className="product-detail-grid">
        <section className="gallery">
          <div className="gallery-thumbs">
            <div className="thumb selected">
              <Photo image={p.image} name={p.name} />
            </div>
          </div>
          <Photo image={p.image} name={p.name} className="main-product-photo" />
        </section>
        <section className="product-info">
          <span className="eyebrow">{p.category}</span>
          <h1>{p.name}</h1>
          <p className="detail-price">{euro(p.price)}</p>
          <p className="description">{p.description}</p>
          <fieldset className="variant-picker">
            <legend>Variante</legend>
            <div>
              {p.variants.map((v) => (
                <button
                  key={v.id}
                  className={v.id === selected.id ? "chosen" : ""}
                  onClick={() => {
                    setVariant(v.id);
                    setQuantity(1);
                  }}
                >
                  <span className={"color-dot " + v.color} />
                  {v.label}
                </button>
              ))}
            </div>
          </fieldset>
          <p
            className={
              "availability " +
              (selected.available ? "available" : "unavailable")
            }
          >
            <span />
            {selected.available ? "En stock" : "Rupture de stock"}
          </p>
          <div className="quantity-line">
            <strong>Quantité</strong>
            <Quantity
              value={quantity}
              max={Math.min(10, selected.available)}
              onChange={setQuantity}
            />
          </div>
          <button
            className="button full add-detail"
            disabled={!selected.available}
            onClick={() => s.add(p, selected.id, quantity)}
          >
            <ShoppingCart size={22} />
            Ajouter au panier
          </button>
          <div className="compatibility">
            <Laptop size={19} />
            {p.compatibility}
          </div>
        </section>
      </div>
      <section className="product-tabs">
        <div role="tablist" aria-label="Informations produit">
          {["Description", "Compatibilité", "Livraison"].map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="tab-content" role="tabpanel">
          {tab === "Description"
            ? p.description
            : tab === "Compatibilité"
              ? p.compatibility
              : "Livraison standard simulée : 4,90 €. Aucun colis réel n’est envoyé. Les conditions commerciales réelles ne s’appliquent pas à cette démonstration."}
        </div>
      </section>
      <section className="related">
        <div className="section-title">
          <h2>À découvrir aussi</h2>
          <Link href="/catalogue">
            Tous les accessoires <ArrowRight size={16} />
          </Link>
        </div>
        <div className="product-grid home-grid">
          {s.products
            .filter((x) => x.id !== p.id)
            .slice(0, 4)
            .map((x) => (
              <ProductCard key={x.id} product={x} onAdd={s.add} />
            ))}
        </div>
      </section>
    </div>
  );
}

function cartRows(s: Shared) {
  return s.cart.flatMap((line) => {
    const p = s.products.find((p) => p.id === line.productId);
    const v = p?.variants.find((v) => v.id === line.variantId);
    return p && v ? [{ line, p, v }] : [];
  });
}
export function Cart({ shared: s }: { shared: Shared }) {
  const rows = cartRows(s);
  const subtotal = rows.reduce((n, r) => n + r.p.price * r.line.quantity, 0);
  if (!rows.length)
    return (
      <div className="container">
        <Empty
          title="Panier vide"
          text="Votre panier est vide. Découvrez les accessoires Shopeo."
        />
      </div>
    );
  return (
    <div className="container cart-page">
      <div className="breadcrumb">
        <Link href="/">Accueil</Link>
        <ChevronRight size={13} />
        Panier
      </div>
      <h1>
        Votre panier{" "}
        <span className="heading-count">
          {s.cart.reduce((n, l) => n + l.quantity, 0)} articles
        </span>
      </h1>
      <div className="cart-layout">
        <div className="cart-lines">
          {rows.map(({ line, p, v }) => (
            <article className="cart-row" key={line.variantId}>
              <Link href={"/produit/" + p.id}>
                <Photo image={p.image} name={p.name} />
              </Link>
              <div className="cart-product">
                <Link href={"/produit/" + p.id}>{p.name}</Link>
                <span>{v.label}</span>
                <strong>{euro(p.price)}</strong>
                {line.quantity > v.available && (
                  <small className="error-text">
                    Stock disponible : {v.available}. Ajustez votre quantité.
                  </small>
                )}
              </div>
              <Quantity
                value={line.quantity}
                max={Math.min(10, v.available)}
                onChange={(q) =>
                  s.setCart(
                    s.cart.map((x) =>
                      x.variantId === line.variantId
                        ? { ...x, quantity: q }
                        : x,
                    ),
                  )
                }
              />
              <button
                className="icon-button remove"
                aria-label={"Supprimer " + p.name}
                onClick={() =>
                  s.setCart(
                    s.cart.filter((x) => x.variantId !== line.variantId),
                  )
                }
              >
                <Trash2 size={18} />
                <span>Supprimer</span>
              </button>
            </article>
          ))}
          <Link href="/catalogue" className="back-shopping">
            <ArrowLeft size={16} />
            Continuer mes achats
          </Link>
        </div>
        <div className="summary-card">
          <h2>Récapitulatif</h2>
          <Totals subtotal={subtotal} />
          <Link href="/commande" className="button full">
            Passer la commande
            <ArrowRight size={18} />
          </Link>
          <p className="quiet-note">
            <Info size={15} />
            Aucun débit réel
          </p>
        </div>
      </div>
    </div>
  );
}
export function Totals({
  subtotal,
  shipping = 490,
}: {
  subtotal: number;
  shipping?: number;
}) {
  return (
    <div className="totals">
      <div>
        <span>Sous-total</span>
        <span>{euro(subtotal)}</span>
      </div>
      <div>
        <span>Livraison simulée</span>
        <span>{euro(shipping)}</span>
      </div>
      <div className="total">
        <strong>Total</strong>
        <strong>{euro(subtotal + shipping)}</strong>
      </div>
    </div>
  );
}

export function Checkout({ shared: s }: { shared: Shared }) {
  const router = useRouter();
  const rows = cartRows(s);
  const [outcome, setOutcome] = useState("success"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Order | null>(null);
  const [address, setAddress] = useState({
    name: "",
    street: "",
    postal: "",
    city: "",
    country: "France",
  });
  const [key, setKey] = useState("");
  useEffect(() => setKey(crypto.randomUUID()), []);
  const subtotal = rows.reduce((n, r) => n + r.p.price * r.line.quantity, 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const o =
        pending ||
        (await api<Order>("/orders", {
          ...send({
            items: rows.map((r) => ({
              variant_id: r.v.id,
              quantity: r.line.quantity,
            })),
            address,
          }),
          headers: { "Idempotency-Key": key },
        }));
      setPending(o);
      const result = await api<Order>(
        `/orders/${o.id}/simulate-payment`,
        send({ outcome }),
      );
      if (result.payment === "paid") {
        s.setCart([]);
        await s.refresh();
        router.push("/confirmation/" + result.id);
      } else {
        setPending(null);
        setKey(crypto.randomUUID());
        await s.refresh();
        setError(
          result.payment === "failed"
            ? "Paiement refusé. Aucun débit réel. Vous pouvez réessayer."
            : "Paiement abandonné. Votre panier a été conservé.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!s.user)
    return (
      <div className="container">
        <Empty
          title="Connectez-vous pour commander"
          text="Votre panier sera conservé pendant la connexion."
          href="/compte?retour=/commande"
          action="Se connecter"
        />
      </div>
    );
  if (!rows.length)
    return (
      <div className="container">
        <Empty
          title="Votre panier est vide"
          text="Ajoutez un accessoire avant de passer une commande."
        />
      </div>
    );
  return (
    <div className="container checkout-page">
      <h1>Finaliser la commande</h1>
      <ol className="steps">
        <li className="complete">
          <span>
            <Check size={14} />
          </span>
          Compte
        </li>
        <li className="active">
          <span>2</span>Livraison
        </li>
        <li>
          <span>3</span>Paiement
        </li>
      </ol>
      <p className="info-banner">
        <UserRound size={18} />
        Connecté avec {s.user.name} · compte de démonstration
      </p>
      <ErrorBox message={error} />
      <form onSubmit={submit} className="checkout-layout">
        <div className="checkout-forms">
          <section className="panel">
            <h2>Adresse de livraison</h2>
            <p className="muted">
              Utilisez uniquement des coordonnées fictives.
            </p>
            <div className="form-grid">
              <label className="span-2">
                Nom complet
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  value={address.name}
                  onChange={(e) =>
                    setAddress({ ...address, name: e.target.value })
                  }
                />
              </label>
              <label className="span-2">
                Adresse
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={address.street}
                  onChange={(e) =>
                    setAddress({ ...address, street: e.target.value })
                  }
                />
              </label>
              <label>
                Code postal
                <input
                  required
                  minLength={2}
                  maxLength={15}
                  value={address.postal}
                  onChange={(e) =>
                    setAddress({ ...address, postal: e.target.value })
                  }
                />
              </label>
              <label>
                Ville
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={address.city}
                  onChange={(e) =>
                    setAddress({ ...address, city: e.target.value })
                  }
                />
              </label>
              <label className="span-2">
                Pays
                <select value="France" onChange={() => {}}>
                  <option>France</option>
                </select>
              </label>
            </div>
          </section>
          <section className="panel">
            <h2>Mode de livraison</h2>
            <label className="radio-option selected">
              <input type="radio" checked readOnly name="delivery" />
              Livraison standard — simulation<strong>4,90 €</strong>
            </label>
          </section>
          <section className="panel">
            <h2>Paiement (simulation)</h2>
            <p className="info-banner">
              <Info size={16} />
              Aucun débit réel
            </p>
            {[
              ["success", "Succès"],
              ["decline", "Refus"],
              ["abandon", "Abandon"],
            ].map(([value, label]) => (
              <label
                className={
                  "radio-option " + (outcome === value ? "selected" : "")
                }
                key={value}
              >
                <input
                  type="radio"
                  name="outcome"
                  checked={outcome === value}
                  value={value}
                  onChange={() => setOutcome(value)}
                />
                {label}
              </label>
            ))}
          </section>
        </div>
        <aside className="summary-card">
          <h2>Votre commande</h2>
          {rows.map((r) => (
            <div className="mini-product" key={r.v.id}>
              <Photo image={r.p.image} name={r.p.name} />
              <div>
                <strong>{r.p.name}</strong>
                <small>
                  {r.v.label} · Qté : {r.line.quantity}
                </small>
              </div>
              <strong>{euro(r.p.price * r.line.quantity)}</strong>
            </div>
          ))}
          <Totals subtotal={subtotal} />
          <button className="button full" disabled={busy || !key}>
            {busy ? "Traitement en cours…" : "Simuler le paiement"}
          </button>
          <p className="quiet-note">Produits et livraison fictifs</p>
        </aside>
      </form>
    </div>
  );
}
