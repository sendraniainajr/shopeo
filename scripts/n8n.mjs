import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(
  readFileSync(resolve(root, ".runtime/automation.json"), "utf8"),
);
const args = process.argv.slice(2);
const child = spawn(
  process.execPath,
  [
    resolve(root, "automation/node_modules/n8n/bin/n8n"),
    ...(args.length ? args : ["start"]),
  ],
  {
    cwd: resolve(root, "automation"),
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      N8N_USER_FOLDER: resolve(root, ".runtime/n8n"),
      N8N_ENCRYPTION_KEY: config.key,
      N8N_PORT: "5679",
      N8N_RUNNERS_BROKER_PORT: "5680",
      N8N_LISTEN_ADDRESS: "127.0.0.1",
      N8N_HOST: "127.0.0.1",
      N8N_PROTOCOL: "http",
      N8N_SECURE_COOKIE: "false",
      N8N_DIAGNOSTICS_ENABLED: "false",
      N8N_VERSION_NOTIFICATIONS_ENABLED: "false",
      N8N_PERSONALIZATION_ENABLED: "false",
      N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: "true",
      N8N_RUNNERS_ENABLED: "false",
      EXECUTIONS_DATA_PRUNE: "true",
      EXECUTIONS_DATA_MAX_AGE: "336",
    },
  },
);
child.on("exit", (code) => (process.exitCode = code || 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
