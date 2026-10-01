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

export default defineConfig(({ mode }) => {
  // Empty prefix loads all vars for the config only; nothing here reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [devPasswordGate(env.SITE_PASSWORD), react(), tailwindcss()],
    server: { port: 5180 },
  };
});
