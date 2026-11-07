"use client";
import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { api, type Product, type User, type CartLine } from "../lib/api";
import { Loading, ErrorBox, Toast } from "./ui";
import { Header, Footer } from "./StoreChrome";
import {
  Home,
  Catalog,
  ProductDetail,
  Cart,
  Checkout,
} from "./pages/Storefront";
import { Account } from "./pages/Account";
import { Orders, OrderDetail } from "./pages/Orders";
import { Support } from "./pages/Support";
import { Admin } from "./admin/Admin";
import { Empty } from "./ui";
import MobileNav from "./MobileNav";
import type { Shared } from "./types";
export default function Shopeo() {
  const path = usePathname();
  const [products, setProducts] = useState<Product[]>([]),
    [cart, setCart] = useState<CartLine[]>([]),
    [user, setUser] = useState<User | null>(null),
    [demo, setDemo] = useState(false),
    [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([
      api<Product[]>("/products"),
      api<{ user: User | null; demo: boolean }>("/auth/session"),
    ]);
    setProducts(p);
    setUser(s.user);
    setDemo(s.demo);
  }, []);
  useEffect(() => {
    let valid = true;
    try {
      const data = JSON.parse(localStorage.getItem("shopeo-cart") || "[]");
      if (Array.isArray(data))
        setCart(
          data.filter(
            (l: CartLine) =>
              typeof l.productId === "string" &&
              typeof l.variantId === "string" &&
              Number.isInteger(l.quantity) &&
              l.quantity >= 1 &&
              l.quantity <= 10,
          ),
        );
    } catch {}
    setLoaded(true);
    refresh()
      .then(() => valid && setReady(true))
      .catch((e) => valid && setError(e.message));
    return () => {
      valid = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (loaded) localStorage.setItem("shopeo-cart", JSON.stringify(cart));
  }, [cart, loaded]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function add(p: Product, variant?: string, quantity = 1) {
    const v =
      p.variants.find((v) => v.id === variant) ||
      p.variants.find((v) => v.available > 0);
    if (!v || v.available < 1) {
      setToast("Cette variante est indisponible.");
      return;
    }
    setCart((old) => {
      const found = old.find((l) => l.variantId === v.id);
      return found
        ? old.map((l) =>
            l.variantId === v.id
              ? {
                  ...l,
                  quantity: Math.min(v.available, 10, l.quantity + quantity),
                }
              : l,
          )
        : [
            ...old,
            {
              productId: p.id,
              variantId: v.id,
              quantity: Math.min(quantity, v.available, 10),
            },
          ];
    });
    setToast("Ajouté au panier");
  }
  const shared: Shared = {
    products,
    cart,
    user,
    demo,
    add,
    setCart,
    notify: setToast,
    refresh,
    setUser,
  };
  if (error)
    return (
      <>
        <Header shared={shared} />
        <main className="container">
          <ErrorBox message={error} />
          <p>Vérifiez que l’API Shopeo est démarrée.</p>
          <button className="button" onClick={() => location.reload()}>
            Réessayer
          </button>
        </main>
      </>
    );
  if (!ready) return <Loading />;
  let content;
  if (path.startsWith("/admin")) content = <Admin shared={shared} />;
  else if (path === "/") content = <Home shared={shared} />;
  else if (path === "/catalogue") content = <Catalog shared={shared} />;
  else if (path.startsWith("/produit/"))
    content = (
      <ProductDetail key={path} shared={shared} slug={path.split("/")[2]} />
    );
  else if (path === "/panier") content = <Cart shared={shared} />;
  else if (path === "/commande") content = <Checkout shared={shared} />;
  else if (path.startsWith("/confirmation/"))
    content = (
      <OrderDetail shared={shared} id={path.split("/")[2]} confirmation />
    );
  else if (path.startsWith("/commandes/"))
    content = <OrderDetail shared={shared} id={path.split("/")[2]} />;
  else if (path === "/commandes") content = <Orders shared={shared} />;
  else if (path === "/assistance") content = <Support shared={shared} />;
  else if (path.startsWith("/compte")) content = <Account shared={shared} />;
  else
    content = (
      <Empty
        title="Page introuvable"
        text="Cette page n’existe pas."
        href="/"
        action="Retour à l’accueil"
      />
    );
  return (
    <>
      {!path.startsWith("/admin") && <Header shared={shared} />}
      <main id="contenu">{content}</main>
      {!path.startsWith("/admin") && (
        <>
          <Footer />
          <MobileNav />
        </>
      )}
      <Toast message={toast} close={() => setToast("")} />
    </>
  );
}
