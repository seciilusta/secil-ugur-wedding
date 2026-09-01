import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/env.js";
import { openDatabase, runMigrations, type Db, type DatabaseHandle } from "./db/index.js";
import { healthRoutes } from "./routes/health.js";
import { rsvpRoutes } from "./routes/rsvp.js";
import { exportRoutes } from "./routes/export.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    appConfig: AppConfig;
  }
}

/** An RSVP body is a name, a choice, a number and a short note. 16 KB is ample. */
const BODY_LIMIT_BYTES = 16 * 1024;

export interface BuildAppOptions {
  config: AppConfig;
  /** Apply pending migrations while starting. Off only for tests that manage it. */
  migrate?: boolean;
}

/**
 * Builds the Fastify instance.
 *
 * Separated from `server.ts` so tests can build an app against a temporary
 * database and drive it through `app.inject()` without opening a socket.
 */
export async function buildApp({ config, migrate = true }: BuildAppOptions): Promise<FastifyInstance> {
  const handle: DatabaseHandle = openDatabase(config.databasePath);
  if (migrate) runMigrations(handle.db);

  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: config.isProduction,
    logger:
      config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
            // Guest names and notes are personal data; keep them out of the logs.
            redact: {
              paths: ['req.body.fullName', 'req.body.note', 'req.headers.authorization'],
              censor: "[redacted]",
            },
          },
  });

  app.decorate("db", handle.db);
  app.decorate("appConfig", config);

  /* The documented contract is JSON only. Fastify parses text/plain out of the
     box, which would let a form-encoded or plain-text body reach validation as a
     bare string; dropping the parser makes the API answer 415 instead. */
  app.removeContentTypeParser("text/plain");

  app.addHook("onClose", (_instance, done) => {
    handle.close();
    done();
  });

  /* -------------------------------------------------------------------- cors
     An explicit allowlist. There is no wildcard fallback: a request from an
     origin that is not listed is simply not granted CORS headers. */
  await app.register(cors, {
    origin: (origin, callback) => {
      // Same-origin, curl and server-to-server requests send no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.webOrigins.includes("*") || config.webOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization"],
    credentials: false,
    maxAge: 86_400,
  });

  /* -------------------------------------------------------------- rate limit
     A global ceiling; individual routes tighten it further. */
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    allowList: [],
    errorResponseBuilder: () => ({
      ok: false,
      error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." },
    }),
  });

  /* ------------------------------------------------------------------ errors
     One place that decides what leaves the process. Internal messages, stack
     traces and SQLite errors are logged and replaced with a generic response. */
  app.setErrorHandler((error: unknown, request, reply) => {
    const fastifyError = error as { statusCode?: number; code?: string };
    const status = fastifyError.statusCode ?? 500;

    if (status === 413) {
      return reply.code(413).send({
        ok: false,
        error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." },
      });
    }

    if (status === 415 || fastifyError.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      return reply.code(415).send({
        ok: false,
        error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Send application/json." },
      });
    }

    if (status === 400) {
      request.log.warn({ err: error }, "Malformed request");
      return reply.code(400).send({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Request could not be read." },
      });
    }

    if (status < 500) {
      return reply.code(status).send({
        ok: false,
        error: { code: "REQUEST_FAILED", message: "Request could not be completed." },
      });
    }

    request.log.error({ err: error }, "Unhandled error");
    return reply.code(500).send({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
    });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      ok: false,
      error: { code: "NOT_FOUND", message: "No such endpoint." },
    }),
  );

  await app.register(healthRoutes);
  await app.register(rsvpRoutes);
  await app.register(exportRoutes);

  return app;
}
