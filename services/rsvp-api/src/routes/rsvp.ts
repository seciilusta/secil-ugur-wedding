import type { FastifyPluginCallback } from "fastify";
import { eq } from "drizzle-orm";
import { rsvps } from "../db/schema.js";
import { buildRsvpBodySchema } from "../schemas/rsvp.js";

/** Public form configuration and RSVP submission. */
export const rsvpRoutes: FastifyPluginCallback = (app, _options, done) => {
  /* ------------------------------------------------------------------ config
     Public on purpose: it carries the form's limits and nothing else. No
     secrets, no guest data, no counts. */
  app.get("/v1/rsvp/config", async (_request, reply) =>
    reply.send({ ok: true, data: { maxGuests: app.appConfig.maxGuests } }),
  );

  /* ------------------------------------------------------------------ submit */
  app.post(
    "/v1/rsvp",
    {
      config: {
        // Tighter than the global limit: a guest needs a handful of attempts,
        // never dozens.
        rateLimit: { max: 12, timeWindow: "10 minutes" },
      },
    },
    async (request, reply) => {
      const parsed = buildRsvpBodySchema(app.appConfig.maxGuests).safeParse(request.body ?? {});

      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path.join(".") || "body";
          fields[field] ??= issue.message;
        }
        return reply.code(400).send({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Request body failed validation.", fields },
        });
      }

      const body = parsed.data;

      // Not attending always records zero, whatever the client sent.
      const guestCount = body.attendance === "yes" ? body.guestCount : 0;

      /* Honeypot. A filled `website` field means a bot: answer with the ordinary
         success shape so it learns nothing, and write nothing. */
      if (body.website.trim().length > 0) {
        request.log.info({ route: "POST /v1/rsvp" }, "Honeypot triggered, submission discarded");
        return reply.code(200).send({
          ok: true,
          data: { status: "created", attendance: body.attendance, guestCount },
        });
      }

      const now = new Date().toISOString();

      try {
        /* One transaction so the read and the write cannot interleave with
           another request carrying the same token. */
        const status = app.db.transaction((tx) => {
          const existing = tx
            .select({ id: rsvps.id })
            .from(rsvps)
            .where(eq(rsvps.submissionToken, body.submissionToken))
            .limit(1)
            .all();

          if (existing.length > 0) {
            tx.update(rsvps)
              .set({
                fullName: body.fullName,
                attendance: body.attendance,
                guestCount,
                note: body.note,
                updatedAt: now,
              })
              .where(eq(rsvps.submissionToken, body.submissionToken))
              .run();
            return "updated" as const;
          }

          tx.insert(rsvps)
            .values({
              submissionToken: body.submissionToken,
              fullName: body.fullName,
              attendance: body.attendance,
              guestCount,
              note: body.note,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          return "created" as const;
        });

        /* The response describes this submission only. Other guests' answers are
           never readable through this endpoint. */
        return reply.code(status === "created" ? 201 : 200).send({
          ok: true,
          data: { status, attendance: body.attendance, guestCount },
        });
      } catch (error) {
        // Log the real cause, tell the client nothing about the database.
        request.log.error({ err: error }, "Failed to persist RSVP");
        return reply.code(500).send({
          ok: false,
          error: { code: "INTERNAL_ERROR", message: "Could not save the response." },
        });
      }
    },
  );

  done();
};
