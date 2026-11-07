import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
const runtime = resolve(import.meta.dirname, "../.runtime");
mkdirSync(runtime, { recursive: true });
const configPath = resolve(runtime, "automation.json");
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, "utf8"))
  : {
      secret: randomBytes(32).toString("hex"),
      path: "shopeo-" + randomBytes(16).toString("hex"),
      key: randomBytes(32).toString("hex"),
    };
writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
const workflow = {
  id: "shopeoDemoWorkflow",
  name: "Shopeo — événements commerce et assistance",
  active: false,
  nodes: [
    {
      id: "webhook",
      name: "Événement Shopeo",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [240, 300],
      webhookId: config.path,
      parameters: {
        httpMethod: "POST",
        path: config.path,
        responseMode: "lastNode",
        options: {},
      },
    },
    {
      id: "process",
      name: "Vérifier et traiter dans Shopeo",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [530, 300],
      parameters: {
        method: "POST",
        url:
          process.env.SHOPEO_CALLBACK_URL ||
          "http://127.0.0.1:8100/api/integrations/process",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "x-shopeo-timestamp",
              value: "={{ $json.body.timestamp }}",
            },
            {
              name: "x-shopeo-signature",
              value: "={{ $json.body.signature }}",
            },
          ],
        },
        sendBody: true,
        contentType: "raw",
        rawContentType: "application/json",
        body: "={{ $json.body.signed_body }}",
        options: { timeout: 25000 },
      },
    },
  ],
  connections: {
    "Événement Shopeo": {
      main: [
        [{ node: "Vérifier et traiter dans Shopeo", type: "main", index: 0 }],
      ],
    },
  },
  settings: {
    executionOrder: "v1",
    saveDataSuccessExecution: "none",
    saveDataErrorExecution: "all",
    saveManualExecutions: false,
  },
};
writeFileSync(
  resolve(runtime, "workflow.json"),
  JSON.stringify(workflow, null, 2),
);
writeFileSync(
  resolve(runtime, "automation.env"),
  `AUTOMATION_SECRET=${config.secret}\nN8N_WEBHOOK_URL=http://127.0.0.1:5679/webhook/${config.path}\n`,
  { mode: 0o600 },
);
console.log(
  "Workflow local configuré. Les clés restent dans .runtime (ignoré par Git).",
);
