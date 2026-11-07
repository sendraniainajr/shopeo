"use client";
import type { Product } from "../../lib/api";

type Save = (path: string, body: unknown, method?: string) => Promise<boolean>;
const colors = [
  ["silver", "Argent"],
  ["black", "Noir"],
  ["gray", "Gris"],
  ["blue", "Bleu"],
  ["white", "Blanc"],
];

export function VariantControls({
  product,
  busy,
  save,
}: {
  product: Product;
  busy: boolean;
  save: Save;
}) {
  return (
    <details className="variant-controls">
      <summary>Gérer les variantes de {product.name}</summary>
      {product.variants.map((variant) => (
        <VariantForm
          key={variant.id + variant.label + variant.color}
          label={variant.label}
          color={variant.color}
          busy={busy}
          save={(body) => save("/admin/variants/" + variant.id, body, "PUT")}
        />
      ))}
      <h4>Nouvelle variante</h4>
      <p>Le stock initial est nul. Ajustez-le ensuite avec un motif.</p>
      <VariantForm
        busy={busy}
        save={(body) =>
          save("/admin/products/" + product.id + "/variants", body)
        }
      />
    </details>
  );
}

function VariantForm({
  label = "",
  color = "silver",
  busy,
  save,
}: {
  label?: string;
  color?: string;
  busy: boolean;
  save: (body: { label: string; color: string }) => Promise<boolean>;
}) {
  return (
    <form
      className="variant-row"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        if (
          (await save({
            label: String(values.get("label")),
            color: String(values.get("color")),
          })) &&
          !label
        )
          form.reset();
      }}
    >
      <label>
        Libellé
        <input
          name="label"
          required
          minLength={2}
          maxLength={100}
          defaultValue={label}
          placeholder="Ex. 15 pouces · Noir"
        />
      </label>
      <label>
        Couleur
        <select name="color" defaultValue={color}>
          {colors.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <button className="button outline small" disabled={busy}>
        {label ? "Enregistrer" : "Ajouter la variante"}
      </button>
    </form>
  );
}
