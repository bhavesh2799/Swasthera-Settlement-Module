import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";
import { existsSync } from "fs";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", router);

// ---------------------------------------------------------------------------
// Production: serve the Vite-built frontend and handle SPA client-side routing
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === "production") {
  // Resolve from CWD (the repo root when started by Render) so this works
  // regardless of where the bundled index.mjs ends up on disk.
  const staticPath =
    process.env.STATIC_FILES_PATH ??
    path.resolve(process.cwd(), "artifacts/swasthera/dist/public");

  if (existsSync(staticPath)) {
    logger.info({ staticPath }, "Serving frontend static files");

    // Serve static assets (JS, CSS, images …)
    app.use(express.static(staticPath));

    // SPA fallback — any route not matched above sends index.html so that
    // wouter / React Router can handle client-side navigation.
    app.use((_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  } else {
    logger.warn(
      { staticPath },
      "Frontend build not found — serving API only. " +
        "Run the frontend build step before starting the server.",
    );
  }
}

export default app;
