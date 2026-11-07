"use client";
import Link from "next/link";
import {
  ShoppingBag,
  ShoppingCart,
  Minus,
  Plus,
  LoaderCircle,
  X,
  Check,
  PackageOpen,
} from "lucide-react";
import type { Product } from "../lib/api";
import { euro } from "../lib/api";
export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Shopeo, accueil">
      <ShoppingBag strokeWidth={1.8} />
      <span>shopeo</span>
    </Link>
  );
}
export function Photo({
  image,
  name,
  className = "",
}: {
  image: number;
  name: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={name}
      className={"product-photo " + className}
      style={{
        backgroundPosition: `${(image % 3) * 50}% ${Math.floor(image / 3) * 100}%`,
      }}
    />
  );
}
export function Quantity({
  value,
  onChange,
  max = 10,
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <div className="quantity">
      <button
        type="button"
        aria-label="Diminuer la quantité"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
      >
        <Minus size={15} />
      </button>
      <span aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label="Augmenter la quantité"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
export function ProductCard({
  product,
  onAdd,
}: {
  product: Product;
  onAdd: (p: Product) => void;
}) {
  const available = product.variants.some((v) => v.available > 0);
  return (
    <article className="product-card">
      <Link href={"/produit/" + product.id} className="product-image-link">
        <Photo image={product.image} name={product.name} />
      </Link>
      <div className="product-card-body">
        <Link href={"/produit/" + product.id} className="product-name">
          {product.name}
        </Link>
        <span className="price">{euro(product.price)}</span>
        <button
          className="button outline small full"
          disabled={!available}
          onClick={() => onAdd(product)}
        >
          <ShoppingCart size={16} />
          {available ? "Ajouter au panier" : "Indisponible"}
        </button>
      </div>
    </article>
  );
}
export function Loading() {
  return (
    <div className="loading-page" role="status">
      <LoaderCircle className="spin" />
      Chargement…
    </div>
  );
}
export function Empty({
  title,
  text,
  href = "/catalogue",
  action = "Découvrir les accessoires",
}: {
  title: string;
  text: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty">
      <PackageOpen size={48} strokeWidth={1.3} />
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="button" href={href}>
        {action}
      </Link>
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error-box">
      {message}
    </div>
  ) : null;
}
export function Toast({
  message,
  close,
}: {
  message: string;
  close: () => void;
}) {
  return message ? (
    <div role="status" className="toast">
      <Check size={20} />
      {message}
      <button onClick={close} aria-label="Fermer la notification">
        <X size={18} />
      </button>
    </div>
  ) : null;
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
