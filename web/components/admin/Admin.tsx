"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Boxes,
  Headphones,
  Zap,
  Settings,
  LogOut,
  RefreshCw,
  Pencil,
  Plus,
  ShieldCheck,
  ArrowLeft,
  X,
  UserRound,
  Info,
  Menu,
} from "lucide-react";
import {
  api,
  send,
  euro,
  paymentLabel,
  fulfillmentLabel,
  type User,
  type Product,
  type Overview,
  type Ticket,
} from "../../lib/api";
import { Logo, Photo, Badge, Loading, ErrorBox } from "../ui";
import type { Shared } from "../types";
import { VariantControls } from "./VariantControls";

export function Admin({ shared: s }: { shared: Shared }) {
  const router = useRouter();
  const [section, setSection] = useState("overview"),
    [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Product | null>(null),
    [create, setCreate] = useState(false),
    [menu, setMenu] = useState(false),
    [orderQuery, setOrderQuery] = useState(""),
    [paymentFilter, setPaymentFilter] = useState("");
  const reload = useCallback(async () => {
    if (s.user?.role === "admin") {
      setData(await api<Overview>("/admin/overview"));
      setError("");
    }
  }, [s.user]);
  useEffect(() => {
    reload().catch((e) => setError(e.message));
    if (s.user?.role === "admin") {
      const id = setInterval(() => reload().catch(() => {}), 6000);
      return () => clearInterval(id);
    }
  }, [reload, s.user]);
  async function act(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await api(path, send(body, method));
      await reload();
      await s.refresh();
      s.notify("Modification enregistrée");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!s.user || s.user.role !== "admin")
    return (
      <div className="container admin-gate">
        <Logo />
        <ShieldCheck size={45} />
        <h1>Administration Shopeo</h1>
        <p>L’accès est réservé aux administrateurs.</p>
        <Link className="button" href="/compte">
          Se connecter
        </Link>
        {s.demo && (
          <button
            className="button outline"
            onClick={async () => {
              try {
                const u = await api<User>("/auth/demo/admin", send({}));
                s.setUser(u);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Ouvrir l’administration démo
          </button>
        )}
        <ErrorBox message={error} />
        <Link href="/">Retour à la boutique</Link>
      </div>
    );
  if (!data) return <Loading />;
  const nav = [
    ["overview", "Vue d’ensemble", LayoutDashboard],
    ["products", "Produits", Package],
    ["orders", "Commandes", ShoppingCart],
    ["stock", "Stock", Boxes],
    ["support", "Assistance", Headphones],
    ["events", "Automatisations", Zap],
    ["settings", "Paramètres", Settings],
  ] as const;
  const low = data.products.flatMap((p) =>
    p.variants.filter((v) => v.stock <= 3).map((v) => ({ p, v })),
  );
  const visibleOrders =
    section === "orders"
      ? data.orders.filter(
          (order) =>
            (!paymentFilter || order.payment === paymentFilter) &&
            (order.number + " " + order.customer)
              .toLocaleLowerCase("fr")
              .includes(orderQuery.toLocaleLowerCase("fr")),
        )
      : data.orders;
  function OrdersTable() {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Commande</th>
              <th>Client fictif</th>
              <th>Paiement</th>
              <th>Préparation</th>
              <th>Total</th>
              {section === "orders" && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {visibleOrders.slice(0, section === "orders" ? 100 : 5).map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={"/commandes/" + o.id}>#{o.number}</Link>
                </td>
                <td>{o.customer}</td>
                <td>
                  <Badge
                    tone={
                      o.payment === "paid"
                        ? "success"
                        : o.payment === "failed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {paymentLabel[o.payment]}
                  </Badge>
                </td>
                <td>
                  <Badge
                    tone={
                      o.fulfillment === "cancelled"
                        ? "danger"
                        : o.fulfillment === "awaiting"
                          ? "warning"
                          : "success"
                    }
                  >
                    {fulfillmentLabel[o.fulfillment]}
                  </Badge>
                </td>
                <td>{euro(o.total)}</td>
                {section === "orders" && (
                  <td>
                    <div className="table-actions">
                      {o.payment === "paid" && o.fulfillment === "awaiting" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            act("/admin/orders/" + o.id + "/state", {
                              state: "prepared",
                            })
                          }
                        >
                          Préparer
                        </button>
                      )}
                      {o.payment === "paid" && o.fulfillment === "prepared" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            act("/admin/orders/" + o.id + "/state", {
                              state: "shipped",
                            })
                          }
                        >
                          Expédier
                        </button>
                      )}
                      {!["shipped", "cancelled"].includes(o.fulfillment) && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            act("/admin/orders/" + o.id + "/state", {
                              state: "cancelled",
                            })
                          }
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.orders.length && (
          <p className="table-empty">
            Les commandes apparaîtront après votre premier achat simulé.
          </p>
        )}
      </div>
    );
  }
  function EventsPanel() {
    return (
      <>
        <p className="panel-caption">
          Mode : {data?.integration_mode}. Les statuts reflètent les traitements
          enregistrés.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Automatisation</th>
                <th>Statut</th>
                <th>Référence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.events.map((e) => (
                <tr key={e.id}>
                  <td>
                    {{
                      "order.paid": "Confirmation de commande",
                      "stock.low": "Alerte stock",
                      "support.created": "Brouillon assistance",
                    }[e.kind] || e.kind}
                    <small className="cell-small">
                      {e.mode === "n8n" ? "n8n" : "Simulateur local"} ·{" "}
                      {e.attempts} tentative(s)
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={
                        e.state === "done"
                          ? "success"
                          : e.state === "dead"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {
                        {
                          done: "Terminé",
                          pending: "En attente",
                          retry: "À relancer",
                          dead: "Échec",
                        }[e.state]
                      }
                    </Badge>
                    {e.error && (
                      <small className="cell-small error-text">{e.error}</small>
                    )}
                  </td>
                  <td>
                    <code title={e.id}>{e.id.slice(0, 10)}</code>
                  </td>
                  <td>
                    {e.state !== "done" && (
                      <button
                        className="button outline small"
                        disabled={busy}
                        onClick={() =>
                          act("/admin/events/" + e.id + "/retry", {})
                        }
                      >
                        Relancer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.events.length && (
          <p className="table-empty">
            Un achat ou une demande d’assistance déclenchera le premier
            événement.
          </p>
        )}
      </>
    );
  }
  function SupportPanel() {
    return (
      <>
        <p className="panel-caption">
          {data?.ai_mode} · Aucun envoi sans validation
        </p>
        {data?.tickets.length ? (
          data.tickets
            .filter((t) => section === "support" || t.state !== "sent")
            .slice(0, section === "support" ? 50 : 1)
            .map((t) => (
              <TicketEditor
                key={t.id}
                ticket={t}
                busy={busy}
                approve={(draft) =>
                  act("/admin/tickets/" + t.id + "/approve", { draft })
                }
              />
            ))
        ) : (
          <p className="table-empty">
            Les demandes clients et leurs brouillons apparaîtront ici.
          </p>
        )}
      </>
    );
  }
  return (
    <div className="admin-layout">
      <aside className={"admin-sidebar " + (menu ? "open" : "")}>
        <Logo />
        <p>Administration</p>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              className={section === key ? "active" : ""}
              key={key}
              onClick={() => {
                setSection(key);
                setMenu(false);
              }}
            >
              <Icon size={21} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/">
            <ArrowLeft size={18} />
            Voir la boutique
          </Link>
          <button
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              s.setUser(null);
              router.push("/compte");
            }}
          >
            <LogOut size={18} />
            Déconnexion
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <button
            className="icon-button admin-menu"
            aria-label="Menu administration"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div>
            <h1>
              {section === "overview"
                ? "Tableau de bord"
                : nav.find((n) => n[0] === section)?.[1]}
            </h1>
            <p>Boutique de démonstration</p>
          </div>
          <span className="environment">Environnement de démonstration</span>
          <button
            className="icon-button"
            aria-label="Actualiser"
            onClick={() => reload().catch((e) => setError(e.message))}
          >
            <RefreshCw size={18} />
          </button>
          <span className="avatar">AD</span>
        </header>
        <ErrorBox message={error} />
        {section === "overview" && (
          <>
            <section className="admin-stats">
              <h2>Données de démonstration</h2>
              <div>
                {[
                  {
                    label: "Commandes",
                    value: data.stats.orders,
                    icon: ShoppingCart,
                  },
                  {
                    label: "Total simulé",
                    value: euro(data.stats.total),
                    icon: LayoutDashboard,
                  },
                  {
                    label: "Stocks faibles",
                    value: data.stats.low_stock,
                    icon: Boxes,
                  },
                  {
                    label: "Tickets à traiter",
                    value: data.stats.tickets,
                    icon: Headphones,
                  },
                ].map((k) => (
                  <article key={k.label}>
                    <span className="stat-icon">
                      <k.icon size={25} />
                    </span>
                    <div>
                      <p>{k.label}</p>
                      <strong>{k.value}</strong>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <div className="admin-grid">
              <section className="admin-panel orders-panel">
                <h2>Commandes récentes</h2>
                {OrdersTable()}
              </section>
              <section className="admin-panel">
                <h2>Alertes de stock</h2>
                {low.map(({ p, v }) => (
                  <div className="stock-alert" key={v.id}>
                    <Photo image={p.image} name={p.name} />
                    <div>
                      <strong>{p.name}</strong>
                      <p>
                        {v.label} · Reste : {v.stock}
                      </p>
                    </div>
                    <button
                      className="button outline small"
                      onClick={() => setSection("stock")}
                    >
                      Voir le stock
                    </button>
                  </div>
                ))}
                {!low.length && <p>Aucune alerte de stock.</p>}
              </section>
              <section className="admin-panel">
                <h2>Automatisations</h2>
                {EventsPanel()}
              </section>
              <section className="admin-panel">
                <h2>Assistance IA · Brouillon à valider</h2>
                {SupportPanel()}
              </section>
            </div>
          </>
        )}
        {section === "orders" && (
          <section className="admin-panel">
            <h2>Toutes les commandes</h2>
            <div className="order-filters">
              <label>
                Rechercher une commande ou un client
                <input
                  type="search"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                />
              </label>
              <label>
                Paiement
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                >
                  <option value="">Tous les paiements</option>
                  <option value="pending">En attente</option>
                  <option value="paid">Payé</option>
                  <option value="failed">Refusé</option>
                  <option value="abandoned">Abandonné</option>
                  <option value="refunded">Remboursé</option>
                </select>
              </label>
            </div>
            {OrdersTable()}
          </section>
        )}
        {section === "events" && (
          <>
            <section className="admin-panel">
              <h2>Exécutions et reprise</h2>
              {EventsPanel()}
            </section>
            <section className="admin-panel">
              <h2>Boîte de messages simulés</h2>
              <p className="panel-caption">
                Ces messages sont capturés localement. Aucun email externe n’est
                envoyé.
              </p>
              {data.messages.map((m) => (
                <details className="message-item" key={m.id}>
                  <summary>
                    {m.subject}
                    <small>{m.recipient}</small>
                  </summary>
                  <p>{m.body}</p>
                </details>
              ))}
              {!data.messages.length && <p>Aucun message préparé.</p>}
            </section>
          </>
        )}
        {section === "support" && (
          <section className="admin-panel">
            <h2>Demandes clients</h2>
            {SupportPanel()}
          </section>
        )}
        {section === "products" && (
          <section className="admin-panel">
            <div className="section-title">
              <h2>Catalogue</h2>
              <button
                className="button small"
                onClick={() => {
                  setEditing(null);
                  setCreate(true);
                }}
              >
                <Plus size={16} />
                Ajouter un produit
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th>Prix</th>
                    <th>État</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="product-cell">
                          <Photo image={p.image} name={p.name} />
                          <strong>{p.name}</strong>
                        </div>
                      </td>
                      <td>{p.category}</td>
                      <td>{euro(p.price)}</td>
                      <td>
                        <Badge>{p.archived ? "Archivé" : "Publié"}</Badge>
                      </td>
                      <td>
                        <button
                          className="button outline small"
                          onClick={() => {
                            setEditing(p);
                            setCreate(false);
                          }}
                        >
                          <Pencil size={15} />
                          Modifier
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {section === "stock" && (
          <section className="admin-panel">
            <h2>Stock et variantes</h2>
            <p className="panel-caption">
              Chaque ajustement est enregistré avec son motif. Les réservations
              restent protégées.
            </p>
            {data.products.map((p) => (
              <div className="stock-product" key={p.id}>
                <div className="product-cell">
                  <Photo image={p.image} name={p.name} />
                  <h3>{p.name}</h3>
                </div>
                {p.variants.map((v) => (
                  <StockEditor
                    key={v.id}
                    variant={v}
                    busy={busy}
                    save={(stock, reason) =>
                      act("/admin/stock/" + v.id, { stock, reason })
                    }
                  />
                ))}
                <VariantControls product={p} busy={busy} save={act} />
              </div>
            ))}
          </section>
        )}
        {section === "settings" && (
          <>
            <section className="admin-panel">
              <h2>Configuration de la démonstration</h2>
              <dl className="settings-list">
                <dt>Paiements</dt>
                <dd>Simulateur local, aucun débit</dd>
                <dt>Automatisations</dt>
                <dd>{data.integration_mode}</dd>
                <dt>Assistance IA</dt>
                <dd>{data.ai_mode}</dd>
                <dt>Livraison</dt>
                <dd>France · 4,90 € simulés</dd>
                <dt>Devise</dt>
                <dd>EUR</dd>
              </dl>
              <p>
                Les secrets et les connexions se configurent côté serveur, hors
                du navigateur.
              </p>
            </section>
            <section className="admin-panel">
              <h2>Journal d’audit</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Objet</th>
                      <th>Détail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {new Date(a.created_at * 1000).toLocaleString(
                            "fr-FR",
                          )}
                        </td>
                        <td>{a.action}</td>
                        <td>
                          <code>{a.target.slice(0, 18)}</code>
                        </td>
                        <td>{a.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {(editing || create) && (
          <ProductEditor
            key={editing?.id || "new"}
            product={editing}
            busy={busy}
            close={() => {
              setEditing(null);
              setCreate(false);
            }}
            save={async (body) => {
              const ok = await act(
                editing ? "/admin/products/" + editing.id : "/admin/products",
                body,
                editing ? "PUT" : "POST",
              );
              if (ok) {
                setEditing(null);
                setCreate(false);
              }
              return ok;
            }}
          />
        )}
      </div>
    </div>
  );
}
function TicketEditor({
  ticket: t,
  busy,
  approve,
}: {
  ticket: Ticket;
  busy: boolean;
  approve: (s: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(t.draft || "");
  useEffect(() => setDraft(t.draft || ""), [t.draft]);
  return (
    <article className="ticket-editor">
      <div className="ticket-question">
        <UserRound size={23} />
        <div>
          <small>Question client · {t.customer}</small>
          <strong>{t.subject}</strong>
          <p>{t.message}</p>
        </div>
      </div>
      {t.draft ? (
        <>
          <label>
            Réponse proposée · simulation IA
            <textarea
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={t.state === "sent"}
              maxLength={3000}
            />
          </label>
          <p className="source">Source : {t.source}</p>
          {t.state === "sent" ? (
            <Badge tone="success">Réponse approuvée et préparée</Badge>
          ) : (
            <div className="ticket-actions">
              <span>
                <Info size={15} />
                Aucun envoi sans validation
              </span>
              <button
                className="button small"
                disabled={busy || draft.length < 10}
                onClick={() => approve(draft)}
              >
                Valider et envoyer
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="info-banner">
          Préparation du brouillon en attente du traitement.
        </p>
      )}
    </article>
  );
}
function StockEditor({
  variant: v,
  busy,
  save,
}: {
  variant: Product["variants"][number];
  busy: boolean;
  save: (n: number, r: string) => Promise<boolean>;
}) {
  const [stock, setStock] = useState(v.stock),
    [reason, setReason] = useState("");
  useEffect(() => setStock(v.stock), [v.stock]);
  return (
    <form
      className="stock-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save(stock, reason)) setReason("");
      }}
    >
      <span>
        {v.label}
        <small>Disponible : {v.available}</small>
      </span>
      <label>
        Stock
        <input
          type="number"
          min={0}
          max={100000}
          value={stock}
          onChange={(e) => setStock(Number(e.target.value))}
        />
      </label>
      <label>
        Motif
        <input
          required
          minLength={5}
          maxLength={200}
          value={reason}
          placeholder="Ex. réapprovisionnement"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button className="button outline small" disabled={busy}>
        Enregistrer
      </button>
    </form>
  );
}
function ProductEditor({
  product: p,
  busy,
  save,
  close,
}: {
  product: Product | null;
  busy: boolean;
  save: (body: unknown) => Promise<boolean>;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-editor-title"
        className="modal"
      >
        <div className="section-title">
          <h2 id="product-editor-title">
            {p ? "Modifier le produit" : "Nouveau produit"}
          </h2>
          <button className="icon-button" aria-label="Fermer" onClick={close}>
            <X />
          </button>
        </div>
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await save({
              name: f.get("name"),
              category: f.get("category"),
              price: Math.round(Number(f.get("price")) * 100),
              description: f.get("description"),
              compatibility: f.get("compatibility"),
              image: Number(f.get("image")),
              archived: f.get("archived") === "on",
            });
          }}
        >
          <label>
            Nom
            <input
              name="name"
              defaultValue={p?.name}
              required
              minLength={3}
              maxLength={120}
            />
          </label>
          <div className="form-grid">
            <label>
              Catégorie
              <select name="category" defaultValue={p?.category || "Bureau"}>
                <option>Smartphone</option>
                <option>Ordinateur</option>
                <option>Bureau</option>
              </select>
            </label>
            <label>
              Prix (€)
              <input
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                max="100000"
                defaultValue={p ? p.price / 100 : 19}
                required
              />
            </label>
          </div>
          <label>
            Description
            <textarea
              name="description"
              defaultValue={p?.description}
              required
              minLength={10}
              maxLength={3000}
              rows={3}
            />
          </label>
          <label>
            Compatibilité
            <input
              name="compatibility"
              defaultValue={p?.compatibility}
              required
              minLength={3}
              maxLength={200}
            />
          </label>
          <label>
            Visuel
            <select name="image" defaultValue={p?.image || 0}>
              {[
                "Support",
                "Housse",
                "Coque",
                "Organiseur",
                "Rehausseur",
                "Souris",
              ].map((name, i) => (
                <option value={i} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              name="archived"
              type="checkbox"
              defaultChecked={p?.archived}
            />
            Archiver ce produit
          </label>
          <button className="button full" disabled={busy}>
            Enregistrer le produit
          </button>
        </form>
        <p className="quiet-note">
          Les variantes existantes et leur stock sont conservés.
        </p>
      </section>
    </div>
  );
}
