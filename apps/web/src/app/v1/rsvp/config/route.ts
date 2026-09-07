import { getMaxGuests } from "@/server/config";
import { createConfigHandler } from "@/server/rsvp/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return createConfigHandler(getMaxGuests())();
  } catch (error) {
    console.error("RSVP public configuration is invalid", error);
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Configuration is unavailable." } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
