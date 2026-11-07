import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { connect } from "node:net";
const root = resolve(import.meta.dirname, "..");
const children = [];
function run(command, args, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    env: process.env,
  });
  children.push(child);
  child.on("error", (e) => console.error(e.message));
  return child;
}
const python = resolve(
  root,
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);
if (!existsSync(python))
  throw new Error("Installez les dépendances Python selon README.md.");
function reachable(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
async function ready(check, label) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} indisponible après 90 secondes.`);
}
if (!(await reachable(55432)))
  run(process.execPath, [resolve(root, "scripts/postgres.mjs")]);
await ready(() => reachable(55432), "PostgreSQL");
run(python, ["run.py"], resolve(root, "api"));
await ready(async () => {
  try {
    return (await fetch("http://127.0.0.1:8100/api/health")).ok;
  } catch {
    return false;
  }
}, "FastAPI");
run(python, ["run.py", "worker"], resolve(root, "api"));
run(
  process.execPath,
  [
    resolve(root, "node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  resolve(root, "web"),
);
console.log("Shopeo : http://127.0.0.1:3100 — arrêt : Ctrl+C");
function stop() {
  for (const child of children) child.kill("SIGINT");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
