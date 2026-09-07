import { getRsvpRepository } from "@/server/db/repository";
import { createHealthHandler } from "@/server/rsvp/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return createHealthHandler(getRsvpRepository())();
  } catch (error) {
    console.error("RSVP health route is not configured", error);
    return Response.json(
      { ok: false, error: { code: "DATABASE_UNAVAILABLE", message: "Database is not reachable." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
