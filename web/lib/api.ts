export type Variant = {
  id: string;
  label: string;
  color: string;
  available: number;
  stock: number;
};
export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  compatibility: string;
  image: number;
  archived: boolean;
  variants: Variant[];
};
export type User = { id: string; name: string; email: string; role: string };
export type CartLine = {
  productId: string;
  variantId: string;
  quantity: number;
};
export type OrderItem = {
  name: string;
  variant: string;
  price: number;
  quantity: number;
  image: number;
  product_id: string;
};
export type Order = {
  id: string;
  number: string;
  subtotal: number;
  shipping: number;
  total: number;
  payment: string;
  fulfillment: string;
  created_at: number;
  address: {
    name: string;
    street: string;
    postal: string;
    city: string;
    country: string;
  };
  items: OrderItem[];
  customer?: string;
};
export type Ticket = {
  id: string;
  subject: string;
  message: string;
  draft: string | null;
  source: string | null;
  state: string;
  customer: string;
};
export type Event = {
  id: string;
  kind: string;
  state: string;
  attempts: number;
  error: string | null;
  mode: string;
};
export type Overview = {
  stats: { orders: number; total: number; low_stock: number; tickets: number };
  orders: Order[];
  products: Product[];
  tickets: Ticket[];
  events: Event[];
  messages: { id: string; recipient: string; subject: string; body: string }[];
  audit: {
    id: string;
    action: string;
    target: string;
    detail: string;
    created_at: number;
  }[];
  integration_mode: string;
  ai_mode: string;
};
export const euro = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    value / 100,
  );
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const csrf =
    typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((x) => x.startsWith("shopeo_csrf="))
          ?.split("=")
          .slice(1)
          .join("=")
      : "";
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-Shopeo-CSRF": decodeURIComponent(csrf) } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : response.status === 422
          ? "Vérifiez les champs du formulaire."
          : "Le service est indisponible. Réessayez.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const send = (body: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export const paymentLabel: Record<string, string> = {
  pending: "En attente",
  paid: "Payé · simulation",
  failed: "Paiement refusé",
  abandoned: "Paiement abandonné",
  refunded: "Remboursé · simulation",
};
export const fulfillmentLabel: Record<string, string> = {
  awaiting: "À préparer",
  prepared: "Préparée",
  shipped: "Expédiée · simulation",
  cancelled: "Annulée",
};
