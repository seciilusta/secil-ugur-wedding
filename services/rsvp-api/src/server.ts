import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";

/**
 * Process entry point.
 *
 * Loads `.env` if one is sitting next to the service, validates the environment,
 * starts the server, and shuts down cleanly so SQLite gets to checkpoint its WAL
 * before the process exits.
 */

// Best effort: in production the environment is normally injected by the host.
try {
  process.loadEnvFile();
} catch {
  // No .env file, which is fine.
}

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  let shuttingDown = false;

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;

      app.log.info({ signal }, "Shutting down");

      // `app.close()` runs the onClose hook, which checkpoints and closes SQLite.
      void app
        .close()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          app.log.error({ err: error }, "Shutdown failed");
          process.exit(1);
        });
    });
  }

  await app.listen({ host: config.host, port: config.port });

  app.log.info(
    {
      database: config.databasePath,
      maxGuests: config.maxGuests,
      webOrigins: config.webOrigins,
    },
    "RSVP API ready",
  );
}

main().catch((error: unknown) => {
  // The logger may not exist yet (a bad environment fails before Fastify is up).
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
