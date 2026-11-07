"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { UserRound, Eye, EyeOff, Info } from "lucide-react";
import { api, send, type User } from "../../lib/api";
import { ErrorBox } from "../ui";
import type { Shared } from "../types";

export function Account({ shared: s }: { shared: Shared }) {
  const path = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const mode = path.includes("inscription")
    ? "register"
    : path.includes("reinitialiser")
      ? "reset"
      : path.includes("recuperation")
        ? "forgot"
        : "login";
  const [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function quick(role: string) {
    setBusy(true);
    setError("");
    try {
      const u = await api<User>("/auth/demo/" + role, send({}));
      s.setUser(u);
      router.push(
        role === "admin"
          ? "/admin"
          : params.get("retour") === "/commande"
            ? "/commande"
            : "/commandes",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") || ""),
      password = String(f.get("password") || "");
    try {
      if (mode === "forgot") {
        const r = await api<{ message: string }>(
          "/auth/forgot",
          send({ email }),
        );
        setMessage(r.message);
      } else if (mode === "reset") {
        const r = await api<{ message: string }>(
          "/auth/reset",
          send({ token: params.get("token") || "", password }),
        );
        setMessage(r.message);
      } else {
        const u = await api<User>(
          mode === "register" ? "/auth/register" : "/auth/login",
          send(
            mode === "register"
              ? { email, password, name: f.get("name") }
              : { email, password, otp: f.get("otp") || "" },
          ),
        );
        s.setUser(u);
        router.push(
          params.get("retour") === "/commande"
            ? "/commande"
            : u.role === "admin"
              ? "/admin"
              : "/commandes",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (s.user && mode === "login")
    return (
      <div className="container account-page">
        <div className="account-card">
          <UserRound className="account-icon" />
          <h1>Bonjour {s.user.name}</h1>
          <p>{s.user.email}</p>
          <Link href="/commandes" className="button full">
            Mes commandes
          </Link>
          {s.user.role === "admin" && (
            <Link href="/admin" className="button outline full">
              Administration
            </Link>
          )}
          <Link href="/assistance" className="text-button">
            Contacter l’assistance
          </Link>
          <button
            className="text-button muted"
            onClick={async () => {
              await api("/auth/logout", { method: "POST" });
              s.setUser(null);
            }}
          >
            Se déconnecter
          </button>
        </div>
      </div>
    );
  return (
    <div className="container account-page">
      <div className="account-card">
        <h1>
          {mode === "register"
            ? "Créer un compte"
            : mode === "forgot"
              ? "Retrouver votre accès"
              : mode === "reset"
                ? "Nouveau mot de passe"
                : "Ravi de vous revoir"}
        </h1>
        <p className="muted">
          {mode === "login"
            ? "Votre quotidien connecté commence ici."
            : "Utilisez des informations de démonstration."}
        </p>
        <ErrorBox message={error} />
        {message && (
          <div className="success-box" role="status">
            {message}
          </div>
        )}
        <form onSubmit={submit} className="stack-form">
          {mode === "register" && (
            <label>
              Prénom
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="given-name"
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder="votre@email.com"
                autoComplete="email"
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Mot de passe
              <div className="password-field">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={256}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                />
                <button
                  type="button"
                  aria-label={
                    show
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {mode !== "login" && <small>12 caractères minimum.</small>}
            </label>
          )}
          {mode === "login" && (
            <>
              <Link href="/compte/recuperation" className="forgot-link">
                Mot de passe oublié ?
              </Link>
              <details className="admin-otp">
                <summary>Connexion administrateur</summary>
                <label>
                  Code de double authentification
                  <input
                    name="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </label>
              </details>
            </>
          )}
          <button className="button full" disabled={busy}>
            {busy
              ? "Un instant…"
              : mode === "register"
                ? "Créer mon compte"
                : mode === "forgot"
                  ? "Envoyer le lien"
                  : mode === "reset"
                    ? "Modifier mon mot de passe"
                    : "Se connecter"}
          </button>
        </form>
        <div className="account-alternate">
          {mode === "login" ? (
            <>
              <span>Vous n’avez pas encore de compte ?</span>
              <Link
                href={
                  "/compte/inscription" +
                  (params.get("retour") === "/commande"
                    ? "?retour=/commande"
                    : "")
                }
              >
                Créer un compte
              </Link>
            </>
          ) : (
            <Link href="/compte">Retour à la connexion</Link>
          )}
        </div>
        {s.demo && mode === "login" && (
          <div className="demo-access">
            <p>
              <Info size={16} />
              Accès rapide pour tester localement
            </p>
            <div>
              <button disabled={busy} onClick={() => quick("customer")}>
                Client démo
              </button>
              <button disabled={busy} onClick={() => quick("admin")}>
                Administrateur démo
              </button>
            </div>
          </div>
        )}
        <p className="quiet-note">
          <Info size={15} />
          Boutique de démonstration : les achats sont simulés.
        </p>
      </div>
    </div>
  );
}
