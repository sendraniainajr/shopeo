"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound, ChevronRight, Check, Info } from "lucide-react";
import {
  api,
  euro,
  paymentLabel,
  fulfillmentLabel,
  type Order,
} from "../../lib/api";
import { Photo, Badge, Empty, Loading, ErrorBox } from "../ui";
import { Totals } from "./Storefront";
import type { Shared } from "../types";

export function Orders({ shared: s }: { shared: Shared }) {
  const [orders, setOrders] = useState<Order[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (s.user)
      api<Order[]>("/orders")
        .then(setOrders)
        .catch((e) => setError(e.message));
  }, [s.user]);
  if (!s.user)
    return (
      <div className="container">
        <Empty
          title="Vos commandes"
          text="Connectez-vous pour retrouver vos commandes."
          href="/compte"
          action="Se connecter"
        />
      </div>
    );
  return (
    <div className="container orders-page">
      <h1>Mes commandes</h1>
      <p className="greeting">
        <UserRound size={20} />
        Bonjour {s.user.name}
      </p>
      <ErrorBox message={error} />
      {!orders && !error ? (
        <Loading />
      ) : orders?.length ? (
        <div className="orders-list">
          {orders.map((o) => (
            <article className="order-card" key={o.id}>
              <div className="order-card-heading">
                <div>
                  <h2>Commande #{o.number}</h2>
                  <small>
                    {new Date(o.created_at * 1000).toLocaleDateString("fr-FR")}
                  </small>
                </div>
                <Badge
                  tone={
                    o.fulfillment === "cancelled"
                      ? "danger"
                      : o.fulfillment === "shipped"
                        ? "success"
                        : "info"
                  }
                >
                  {fulfillmentLabel[o.fulfillment]}
                </Badge>
              </div>
              <p>
                Total : <strong>{euro(o.total)}</strong>
              </p>
              <div className="order-card-bottom">
                <div className="order-thumbnails">
                  {o.items.slice(0, 3).map((i, n) => (
                    <Photo key={n} image={i.image} name={i.name} />
                  ))}
                </div>
                <Link href={"/commandes/" + o.id} className="button outline">
                  Voir le détail
                  <ChevronRight size={17} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Votre première commande vous attend"
          text="Vos commandes de démonstration apparaîtront ici."
        />
      )}
    </div>
  );
}
export function OrderDetail({
  shared: s,
  id,
  confirmation = false,
}: {
  shared: Shared;
  id: string;
  confirmation?: boolean;
}) {
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (s.user)
      api<Order>("/orders/" + id)
        .then(setOrder)
        .catch((e) => setError(e.message));
  }, [s.user, id]);
  if (!s.user)
    return (
      <Empty
        title="Connectez-vous"
        text="Cette commande est accessible à son propriétaire."
        href="/compte"
        action="Se connecter"
      />
    );
  if (error)
    return (
      <div className="container">
        <ErrorBox message={error} />
        <Link href="/commandes">Mes commandes</Link>
      </div>
    );
  if (!order) return <Loading />;
  return (
    <div className="container confirmation-page">
      {confirmation && order.payment === "paid" && (
        <div className="confirmation-head">
          <span className="success-circle">
            <Check size={43} />
          </span>
          <h1>Commande confirmée</h1>
          <p>Merci {s.user.name}, votre commande est enregistrée.</p>
          <Badge tone="success">Paiement simulé accepté</Badge>
        </div>
      )}
      <div className="order-detail-card">
        <div className="section-title">
          <h2>Commande #{order.number}</h2>
          <Badge tone={order.payment === "paid" ? "success" : "neutral"}>
            {paymentLabel[order.payment]}
          </Badge>
        </div>
        {order.items.map((i, n) => (
          <div className="mini-product large" key={n}>
            <Photo image={i.image} name={i.name} />
            <div>
              <strong>{i.name}</strong>
              <small>
                {i.variant} · Quantité : {i.quantity}
              </small>
            </div>
            <strong>{euro(i.price * i.quantity)}</strong>
          </div>
        ))}
        <Totals subtotal={order.subtotal} shipping={order.shipping} />
        <div className="order-address">
          <h3>Livraison simulée</h3>
          <p>
            {order.address.name}
            <br />
            {order.address.street}
            <br />
            {order.address.postal} {order.address.city}
          </p>
          <Badge tone="info">{fulfillmentLabel[order.fulfillment]}</Badge>
        </div>
        <Link
          href={confirmation ? "/commandes/" + order.id : "/commandes"}
          className="button full"
        >
          {confirmation ? "Voir ma commande" : "Toutes mes commandes"}
        </Link>
        <p className="quiet-note">
          <Info size={16} />
          Aucun débit réel · Aucun colis expédié
        </p>
      </div>
    </div>
  );
}
