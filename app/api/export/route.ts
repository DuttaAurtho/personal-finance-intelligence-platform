import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { queryTransactions, type TransactionFilters } from "@/lib/analytics";
import { toCsv } from "@/lib/csv";
import { monthEnd, monthStart, todayISO } from "@/lib/dates";
import { parseAmount } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * Export the current transactions view as CSV.
 *
 * Takes the same query parameters as the transactions page, so whatever the
 * user is looking at is exactly what they get. Data portability matters more
 * than usual here — people should never feel their financial history is
 * trapped inside a tool.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });

  const sp = new URL(request.url).searchParams;

  const from = sp.get("month") ? monthStart(sp.get("month")!) : sp.get("from") || undefined;
  const to = sp.get("month") ? monthEnd(sp.get("month")!) : sp.get("to") || undefined;
  const direction = sp.get("direction");
  const min = sp.get("min");
  const max = sp.get("max");

  const filters: TransactionFilters = {
    q: sp.get("q")?.trim() || undefined,
    category: sp.get("category") || undefined,
    accountId: sp.get("account") ? Number(sp.get("account")) : undefined,
    direction: direction === "in" || direction === "out" ? direction : "all",
    from,
    to,
    minMinor: min ? (parseAmount(min) ?? undefined) : undefined,
    maxMinor: max ? (parseAmount(max) ?? undefined) : undefined,
    uncategorisedOnly: sp.get("uncategorised") === "1",
    includeTransfers: sp.get("transfers") === "1",
    sort: (sp.get("sort") as TransactionFilters["sort"]) ?? "date_desc",
    // Export is deliberately not paginated — the point is to get everything.
    limit: 500,
    offset: 0,
  };

  const headers = ["Date", "Description", "Merchant", "Category", "Amount", "Account", "Notes"];
  const rows: (string | number)[][] = [];

  // Page through so a large history doesn't need a single huge query.
  for (let offset = 0; ; offset += 500) {
    const { rows: page } = await queryTransactions(user.id, { ...filters, offset });
    for (const t of page) {
      rows.push([
        t.date,
        t.description,
        t.merchant,
        t.category,
        (t.amount_minor / 100).toFixed(2),
        t.account_name,
        t.notes ?? "",
      ]);
    }
    if (page.length < 500 || rows.length >= 100_000) break;
  }

  // The leading BOM makes Excel read this as UTF-8 rather than mangling the
  // currency symbols and any non-ASCII merchant names.
  const csv = "﻿" + toCsv(headers, rows);
  const filename = `fiscora-transactions-${todayISO()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
