"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { Headphones, Search, ChevronRight, Info } from "lucide-react";
import { api, send } from "../../lib/api";
import { ErrorBox, Badge } from "../ui";
import type { Shared } from "../types";

export function Support({ shared: s }: { shared: Shared }) {
  const [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tickets, setTickets] = useState<
      { id: string; subject: string; state: string; answer: string | null }[]
    >([]);
  const faqs = [
    [
      "Les produits sont-ils compatibles avec mon appareil ?",
      "Chaque fiche produit indique les modèles et les dimensions compatibles. Choisissez la bonne variante avant d’ajouter au panier.",
    ],
    [
      "Comment fonctionne la livraison (simulation) ?",
      "La livraison standard coûte 4,90 € dans cette démonstration. Aucun colis réel n’est envoyé.",
    ],
    [
      "Comment passer une commande ?",
      "Ajoutez vos accessoires au panier, connectez-vous, renseignez une adresse fictive et sélectionnez un résultat de paiement simulé.",
    ],
    [
      "Un paiement est-il réellement prélevé ?",
      "Non. Tous les paiements sont simulés et aucune carte bancaire réelle n’est demandée.",
    ],
  ];
  useEffect(() => {
    if (s.user)
      api<typeof tickets>("/support")
        .then(setTickets)
        .catch(() => {});
  }, [s.user]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget,
      f = new FormData(form);
    try {
      const r = await api<{ message: string }>(
        "/support",
        send({ subject: f.get("subject"), message: f.get("message") }),
      );
      setMessage(r.message);
      form.reset();
      setTickets(await api("/support"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container support-page">
      <div className="support-heading">
        <Headphones size={34} />
        <h1>
          Comment pouvons-nous
          <br className="desktop-only" /> vous aider ?
        </h1>
        <p className="muted">
          Une question sur un accessoire ou votre commande ?
        </p>
      </div>
      <div className="support-layout">
        <section>
          <div className="search-field faq-search">
            <Search size={18} />
            <input
              aria-label="Chercher dans la FAQ"
              placeholder="Chercher dans la FAQ"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {faqs
            .filter((f) =>
              f.join(" ").toLowerCase().includes(query.toLowerCase()),
            )
            .map(([q, a]) => (
              <details className="faq-item" key={q}>
                <summary>
                  {q}
                  <ChevronRight size={16} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          {query &&
            !faqs.some((f) =>
              f.join(" ").toLowerCase().includes(query.toLowerCase()),
            ) && <p>Aucune réponse trouvée. Contactez notre équipe.</p>}
        </section>
        <section className="panel">
          <h2>Nous contacter</h2>
          <ErrorBox message={error} />
          {message && (
            <div role="status" className="success-box">
              {message}
            </div>
          )}
          {s.user ? (
            <form className="stack-form" onSubmit={submit}>
              <label>
                Sujet
                <select name="subject">
                  <option>Compatibilité produit</option>
                  <option>Livraison simulée</option>
                  <option>Ma commande</option>
                  <option>Autre question</option>
                </select>
              </label>
              <label>
                Message
                <textarea
                  name="message"
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={5}
                  placeholder="Décrivez votre demande…"
                />
              </label>
              <button className="button full" disabled={busy}>
                {busy ? "Envoi…" : "Envoyer ma demande"}
              </button>
            </form>
          ) : (
            <>
              <p>Connectez-vous pour suivre votre demande.</p>
              <Link href="/compte" className="button">
                Se connecter
              </Link>
            </>
          )}
          <p className="quiet-note">
            <Info size={16} />
            Votre demande sera examinée par notre équipe.
          </p>
        </section>
      </div>
      {tickets.length > 0 && (
        <section className="my-tickets">
          <h2>Mes demandes</h2>
          {tickets.map((t) => (
            <article className="panel" key={t.id}>
              <div className="section-title">
                <h3>{t.subject}</h3>
                <Badge tone={t.state === "sent" ? "success" : "info"}>
                  {t.state === "sent"
                    ? "Réponse disponible"
                    : "En cours de traitement"}
                </Badge>
              </div>
              {t.answer && <p>{t.answer}</p>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
