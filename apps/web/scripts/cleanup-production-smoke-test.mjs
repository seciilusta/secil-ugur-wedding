import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for smoke-test cleanup.");

const sql = neon(databaseUrl);
const rows = await sql`
  delete from rsvps
  where submission_token = 'codex-production-smoke-2026-09-07'
  returning id
`;

console.log(`Removed ${rows.length} production smoke-test RSVP row(s).`);
