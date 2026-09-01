import type { FastifyPluginCallback } from "fastify";
import { sql } from "drizzle-orm";

/**
 * `GET /health`
 *
 * Reports 200 only if the database actually answers a query, so a container
 * health check fails when the volume is missing or the file is unreadable rather
 * than when the process merely happens to be alive.
 */
export const healthRoutes: FastifyPluginCallback = (app, _options, done) => {
  app.get("/health", async (_request, reply) => {
    try {
      app.db.get<{ ok: number }>(sql`select 1 as ok`);
    } catch (error) {
      app.log.error({ err: error }, "Health check could not reach the database");
      return reply.code(503).send({
        ok: false,
        error: { code: "DATABASE_UNAVAILABLE", message: "Database is not reachable." },
      });
    }

    return reply.send({
      ok: true,
      data: {
        status: "ok",
        database: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  done();
};
