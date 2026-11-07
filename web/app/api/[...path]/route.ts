import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const roots = new Set([
  "health",
  "products",
  "auth",
  "orders",
  "support",
  "admin",
  "integrations",
]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (
    !roots.has(path[0]) ||
    path.some((segment) => [".", ".."].includes(segment))
  )
    return Response.json({ detail: "Route introuvable." }, { status: 404 });
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("origin");
  if (
    !["GET", "HEAD"].includes(request.method) &&
    origin &&
    origin !== request.nextUrl.origin
  )
    return Response.json({ detail: "Origine non autorisée." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 32768)
    return Response.json(
      { detail: "Requête trop volumineuse." },
      { status: 413 },
    );
  const headers = new Headers({ "x-request-id": requestId });
  for (const name of [
    "cookie",
    "origin",
    "content-type",
    "x-shopeo-csrf",
    "idempotency-key",
    "authorization",
    "x-shopeo-timestamp",
    "x-shopeo-signature",
    "sec-fetch-site",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (process.env.INTERNAL_PROXY_SECRET)
    headers.set("x-shopeo-proxy-token", process.env.INTERNAL_PROXY_SECRET);
  // Vercel overwrites this header at its trusted edge. Never trust a client-
  // supplied address outside that deployment environment.
  if (process.env.VERCEL) {
    const clientIp = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    if (clientIp) headers.set("x-shopeo-client-ip", clientIp);
  }
  try {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    if (body && body.byteLength > 32768)
      return Response.json(
        { detail: "Requête trop volumineuse." },
        { status: 413 },
      );
    const base = process.env.SHOPEO_API_URL || "http://127.0.0.1:8100";
    const url =
      base.replace(/\/$/, "") +
      "/api/" +
      path.map(encodeURIComponent).join("/") +
      request.nextUrl.search;
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(50000),
    });
    const responseHeaders = new Headers({
      "content-type":
        upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
      "x-request-id": requestId,
    });
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append("set-cookie", cookie);
    return new Response(
      upstream.status === 204 ? null : await upstream.arrayBuffer(),
      { status: upstream.status, headers: responseHeaders },
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "backend_unavailable",
        requestId,
        resource: path[0],
      }),
    );
    return Response.json(
      {
        detail:
          "Le service est temporairement indisponible. Réessayez dans quelques instants.",
      },
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
