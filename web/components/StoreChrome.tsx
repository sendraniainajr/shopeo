"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, ShoppingCart, UserRound, Menu, X } from "lucide-react";
import { Logo } from "./ui";
import type { Shared } from "./types";

export function Header({ shared: s }: { shared: Shared }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false),
    [q, setQ] = useState("");
  const path = usePathname();
  useEffect(() => setMenu(false), [path]);
  function search(e: FormEvent) {
    e.preventDefault();
    router.push("/catalogue?q=" + encodeURIComponent(q));
    setMenu(false);
  }
  return (
    <>
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <div className="demo-strip">
        Boutique de démonstration <span>— aucun achat réel</span>
      </div>
      <header className="header">
        <div className="header-main container">
          <button
            className="icon-button mobile-menu"
            aria-label="Ouvrir le menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <Logo />
          <form className="search-field" onSubmit={search}>
            <Search size={20} />
            <input
              aria-label="Rechercher un accessoire"
              placeholder="Rechercher un accessoire"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="sr-only" type="submit">
              Rechercher
            </button>
          </form>
          <nav className="desktop-nav" aria-label="Catégories">
            {["Smartphone", "Ordinateur", "Bureau"].map((c) => (
              <Link key={c} href={"/catalogue?categorie=" + c}>
                {c}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <Link
              href="/compte"
              className="icon-button"
              aria-label="Mon compte"
            >
              <UserRound />
              <span className="desktop-label">
                {s.user ? s.user.name.split(" ")[0] : ""}
              </span>
            </Link>
            <Link
              href="/panier"
              className="icon-button cart-icon"
              aria-label={`Panier, ${s.cart.reduce((n, l) => n + l.quantity, 0)} articles`}
            >
              <ShoppingCart />
              {s.cart.length > 0 && (
                <span className="cart-count">
                  {s.cart.reduce((n, l) => n + l.quantity, 0)}
                </span>
              )}
            </Link>
          </div>
        </div>
        <form className="mobile-search container" onSubmit={search}>
          <Search size={18} />
          <input
            aria-label="Rechercher sur mobile"
            placeholder="Rechercher un accessoire"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        {menu && (
          <nav className="mobile-drawer" aria-label="Navigation mobile">
            <Link href="/catalogue" onClick={() => setMenu(false)}>
              Tous les accessoires
            </Link>
            {["Smartphone", "Ordinateur", "Bureau"].map((c) => (
              <Link
                key={c}
                href={"/catalogue?categorie=" + c}
                onClick={() => setMenu(false)}
              >
                {c}
              </Link>
            ))}
            <Link href="/commandes">Mes commandes</Link>
            <Link href="/assistance">Assistance</Link>
          </nav>
        )}
      </header>
    </>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-main">
        <div>
          <Logo />
          <p>Les essentiels de votre quotidien connecté.</p>
        </div>
        <nav aria-label="Pied de page">
          <Link href="/catalogue">Les accessoires</Link>
          <Link href="/assistance">FAQ & assistance</Link>
          <Link href="/commandes">Mes commandes</Link>
          <Link href="/admin">Administration</Link>
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Shopeo</span>
        <span>Projet de démonstration · Produits et commandes fictifs</span>
      </div>
    </footer>
  );
}
