import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const runtime = resolve(root, ".runtime");
mkdirSync(runtime, { recursive: true });
const configFile = resolve(runtime, "database.json");
const config = existsSync(configFile)
  ? JSON.parse(readFileSync(configFile, "utf8"))
  : { password: randomBytes(24).toString("hex"), port: 55432 };
writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
const db = new EmbeddedPostgres({
  databaseDir: resolve(runtime, "postgres"),
  user: "shopeo",
  password: config.password,
  port: config.port,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(resolve(runtime, "postgres", "PG_VERSION")))
  await db.initialise();
await db.start();
const client = db.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = 'shopeo'",
);
if (!result.rowCount) await client.query("CREATE DATABASE shopeo");
await client.end();
writeFileSync(
  resolve(runtime, "database.env"),
  `DATABASE_URL=postgresql+psycopg://shopeo:${config.password}@127.0.0.1:${config.port}/shopeo\n`,
  { mode: 0o600 },
);
console.log(
  `PostgreSQL Shopeo prêt sur 127.0.0.1:${config.port}. Configuration privée dans .runtime/database.env.`,
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await db.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
