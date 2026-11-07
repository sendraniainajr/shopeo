"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  LayoutGrid,
  ShoppingCart,
  Headphones,
  UserRound,
} from "lucide-react";
export default function MobileNav() {
  const path = usePathname();
  return (
    <nav
      className="mobile-bottom-nav"
      aria-label="Navigation principale mobile"
    >
      <Link href="/" aria-current={path === "/" ? "page" : undefined}>
        <House size={19} />
        <span>Accueil</span>
      </Link>
      <Link
        href="/catalogue"
        aria-current={path === "/catalogue" ? "page" : undefined}
      >
        <LayoutGrid size={19} />
        <span>Explorer</span>
      </Link>
      <Link
        href="/panier"
        className="mobile-cart-action"
        aria-label="Ouvrir le panier"
      >
        <ShoppingCart size={26} />
      </Link>
      <Link
        href="/assistance"
        aria-current={path === "/assistance" ? "page" : undefined}
      >
        <Headphones size={19} />
        <span>Aide</span>
      </Link>
      <Link
        href="/compte"
        aria-current={path.startsWith("/compte") ? "page" : undefined}
      >
        <UserRound size={19} />
        <span>Compte</span>
      </Link>
    </nav>
  );
}
