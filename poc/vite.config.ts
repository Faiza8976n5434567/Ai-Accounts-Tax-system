import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import sitePassword from "./middleware";

// Runs the same Basic Auth check as the Vercel middleware on the local dev server,
// but only when SITE_PASSWORD is set (e.g. in poc/.env.local, which is git-ignored).
function devPasswordGate(password: string | undefined): Plugin {
  return {
    name: "dev-password-gate",
    apply: "serve",
    configureServer(server) {
      if (!password) return;
      process.env.SITE_PASSWORD = password;
      server.middlewares.use((req, res, next) => {
        const auth = req.headers.authorization;
        const request = new Request(`http://localhost${req.url ?? "/"}`, {
          headers: auth ? { authorization: auth } : {},
        });
        const blocked = sitePassword(request);
        if (!blocked) return next();
        res.statusCode = blocked.status;
        blocked.headers.forEach((value, key) => res.setHeader(key, value));
        blocked.text().then((body) => res.end(body));
      });
    },
  };
}

// Runs the Vercel Functions in api/ on the local dev server, so /api/* behaves the same as
// when deployed. Server-only variables from .env.local (e.g. SUPABASE_SECRET_KEY) are passed
// to the function's serve(request, env) on the dev machine only; they never reach the browser.
function devApi(env: Record<string, string>): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.match(/^\/api\/([a-z-]+)(?:\?|$)/)?.[1];
        if (!name) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const serve = mod.serve as ((r: Request, e: Record<string, string>) => Promise<Response>) | undefined;
          const exported = mod[req.method ?? "GET"] as ((r: Request) => Promise<Response>) | undefined;
          if (!exported) { res.statusCode = 405; res.end(); return; }
          const handler = serve ? (r: Request) => serve(r, env) : exported;
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const response = await handler(new Request(`http://localhost${req.url}`, {
            method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined,
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(String(e));
          res.statusCode = 500; res.end(JSON.stringify({ error: "Local API error" }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Empty prefix loads all vars for the config only; nothing here reaches the browser bundle.
  // Read from this folder (where .env.local lives), not wherever the server was started from.
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "");
  return {
    plugins: [devPasswordGate(env.SITE_PASSWORD), devApi(env), react(), tailwindcss()],
    server: { port: 5180 },
  };
});
