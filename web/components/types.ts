import type { Product, User, CartLine } from "../lib/api";
export type Shared = {
  products: Product[];
  cart: CartLine[];
  user: User | null;
  demo: boolean;
  add: (p: Product, variant?: string, quantity?: number) => void;
  setCart: (v: CartLine[]) => void;
  notify: (s: string) => void;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};
