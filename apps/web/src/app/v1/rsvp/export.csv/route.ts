import { getAdminToken } from "@/server/config";
import { getRsvpRepository } from "@/server/db/repository";
import { createExportHandler } from "@/server/rsvp/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return createExportHandler({ repository: getRsvpRepository(), adminToken: getAdminToken() })(request);
  } catch (error) {
    console.error("RSVP export route is not configured", error);
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Could not export responses." } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
