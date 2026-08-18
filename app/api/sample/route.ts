import { NextResponse } from "next/server";
import { demoCsv } from "@/lib/demo";

export const dynamic = "force-dynamic";

/**
 * A realistic four-month sample statement, so someone can exercise the whole
 * import flow before trusting the tool with their real bank export.
 */
export async function GET() {
  return new NextResponse(demoCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fiscora-sample-statement.csv"',
      "Cache-Control": "no-store",
    },
  });
}
