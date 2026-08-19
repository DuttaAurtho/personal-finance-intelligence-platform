import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY deployment diagnostic. Delete once the Vercel deployment is
 * confirmed healthy.
 *
 * Reports only whether configuration is present and whether a trivial query
 * succeeds — never the credential values themselves. Error text is scrubbed of
 * anything URL- or token-shaped before being returned, since this endpoint is
 * reachable publicly while it exists.
 */

function scrub(text: string): string {
  return text
    .replace(/libsql:\/\/[^\s"']+/gi, "libsql://<redacted>")
    .replace(/https?:\/\/[^\s"']+/gi, "https://<redacted>")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "<redacted-token>");
}

export async function GET() {
  const report: Record<string, unknown> = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
    nodeVersion: process.version,
    hasDatabaseUrl: !!process.env.TURSO_DATABASE_URL,
    hasAuthToken: !!process.env.TURSO_AUTH_TOKEN,
    urlScheme: process.env.TURSO_DATABASE_URL?.split(":")[0] ?? null,
  };

  try {
    const { get } = await import("@/lib/db");
    const row = await get<{ ok: number }>("SELECT 1 AS ok");
    report.dbQuery = row?.ok === 1 ? "ok" : "unexpected result";
  } catch (err) {
    report.dbQuery = "failed";
    report.errorName = err instanceof Error ? err.name : typeof err;
    report.errorMessage = scrub(err instanceof Error ? err.message : String(err));
    if (err && typeof err === "object" && "code" in err) report.errorCode = String((err as { code: unknown }).code);
    report.stack = scrub((err instanceof Error && err.stack ? err.stack : "").split("\n").slice(0, 6).join(" | "));
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
