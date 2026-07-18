import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createOrderIntent } from "./server/orderIntentApi.ts";
import { getPortfolioHistory } from "./server/portfolioHistoryApi.ts";
import { forwardRpc, rpcUpstreams } from "./server/rpcGateway.ts";

function portfolioHistoryApi(): Plugin {
  return {
    name: "portfolio-history-api",
    configureServer(server) {
      server.middlewares.use("/api/portfolio-history", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "private, max-age=60");
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            const buffer = Buffer.from(chunk);
            size += buffer.length;
            if (size > 8_192) throw new Error("Request is too large");
            chunks.push(buffer);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          res.statusCode = 200;
          res.end(JSON.stringify(await getPortfolioHistory(body)));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: (error as Error).message.slice(0, 200) }));
        }
      });
    },
  };
}

function rpcApi(env: Record<string, string>): Plugin {
  return {
    name: "monad-rpc-api",
    configureServer(server) {
      server.middlewares.use("/api/rpc", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const result = await forwardRpc(body, {
            upstreams: rpcUpstreams(process.env.RPC_URLS || env.RPC_URLS || process.env.MONAD_RPC_URL || env.MONAD_RPC_URL),
          });
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 502;
          res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: (error as Error).message } }));
        }
      });
    },
  };
}

function smartOrderApi(env: Record<string, string>): Plugin {
  return {
    name: "smart-order-api",
    configureServer(server) {
      server.middlewares.use("/api/order-intent", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const buffer = Buffer.from(chunk);
          size += buffer.length;
          if (size > 16_384) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: "Request is too large" }));
            return;
          }
          chunks.push(buffer);
        }
        const apiKey = process.env.FREEMODEL_API_KEY || process.env.OPENAI_API_KEY || env.FREEMODEL_API_KEY || env.OPENAI_API_KEY;
        if (!apiKey) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: "Order planner is not configured" }));
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const result = await createOrderIntent(body, {
            apiKey,
            baseUrl:
              process.env.FREEMODEL_BASE_URL ||
              process.env.OPENAI_BASE_URL ||
              env.FREEMODEL_BASE_URL ||
              env.OPENAI_BASE_URL ||
              "https://api.freemodel.dev",
            model: process.env.FREEMODEL_MODEL || env.FREEMODEL_MODEL || "gpt-5.4-mini",
          });
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: (error as Error).message.slice(0, 240) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), tailwindcss(), portfolioHistoryApi(), rpcApi(env), smartOrderApi(env)],
  };
});
