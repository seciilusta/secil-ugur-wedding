import { getMaxGuests, getRateLimitSecret } from "@/server/config";
import { getRsvpRepository } from "@/server/db/repository";
import { createSubmitHandler } from "@/server/rsvp/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    return createSubmitHandler({
      repository: getRsvpRepository(),
      maxGuests: getMaxGuests(),
      rateLimitSecret: getRateLimitSecret(),
    })(request);
  } catch (error) {
    console.error("RSVP submission route is not configured", error);
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Could not save the response." } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
