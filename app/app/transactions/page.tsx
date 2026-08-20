import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { queryTransactions, type TransactionFilters } from "@/lib/analytics";
import { all } from "@/lib/db";
import { listAccounts } from "@/lib/repository";
import { formatMoney, parseAmount } from "@/lib/money";
import { monthEnd, monthStart } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import TransactionTable from "@/components/TransactionTable";
import AddTransactionButton from "@/components/AddTransactionButton";

export const metadata: Metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  q?: string;
  category?: string;
  account?: string;
  direction?: string;
  from?: string;
  to?: string;
  min?: string;
  max?: string;
  month?: string;
  uncategorised?: string;
  transfers?: string;
  sort?: string;
  page?: string;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const [categories, accounts] = await Promise.all([
    all<{ name: string; kind: string }>(
      "SELECT name, kind FROM categories WHERE user_id = ? ORDER BY sort ASC",
      user.id,
    ),
    listAccounts(user.id),
  ]);

  const page = Math.max(1, Number(sp.page) || 1);

  // A `month` param (arriving from dashboard links) is just a date-range shortcut.
  const from = sp.month ? monthStart(sp.month) : sp.from || undefined;
  const to = sp.month ? monthEnd(sp.month) : sp.to || undefined;

  const filters: TransactionFilters = {
    q: sp.q?.trim() || undefined,
    category: sp.category || undefined,
    accountId: sp.account ? Number(sp.account) : undefined,
    direction: sp.direction === "in" || sp.direction === "out" ? sp.direction : "all",
    from,
    to,
    minMinor: sp.min ? (parseAmount(sp.min) ?? undefined) : undefined,
    maxMinor: sp.max ? (parseAmount(sp.max) ?? undefined) : undefined,
    uncategorisedOnly: sp.uncategorised === "1",
    includeTransfers: sp.transfers === "1",
    sort: (sp.sort as TransactionFilters["sort"]) ?? "date_desc",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const { rows, total, sumMinor } = await queryTransactions(user.id, filters);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Preserve every active filter when building pagination and export links.
  const queryString = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { ...sp, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && v !== null) params.set(k, String(v));
    }
    return params.toString();
  };

  const hasFilters = Boolean(
    sp.q || sp.category || sp.account || sp.from || sp.to || sp.min || sp.max ||
      sp.month || sp.uncategorised || (sp.direction && sp.direction !== "all"),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        description="Search, filter and correct. Every category you confirm becomes training data for the classifier."
        action={
          <div className="flex items-center gap-2">
            <a href={`/api/export?${queryString({ page: undefined })}`} className="btn btn-secondary h-9">
              <span aria-hidden="true">↑</span> Export CSV
            </a>
            <AddTransactionButton
              categories={categories}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
              currency={user.currency}
            />
          </div>
        }
      />

      {/* ── Filters ────────────────────────────────────────────────── */}
      <Card className="px-4 py-4">
        <form method="get" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <label className="label" htmlFor="q">Search</label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={sp.q ?? ""}
                placeholder="Description, merchant, category or note…"
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue={sp.category ?? ""} className="input">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="direction">Direction</label>
              <select id="direction" name="direction" defaultValue={sp.direction ?? "all"} className="input">
                <option value="all">Money in and out</option>
                <option value="out">Money out only</option>
                <option value="in">Money in only</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="from">From</label>
              <input id="from" name="from" type="date" defaultValue={sp.from ?? ""} className="input" />
            </div>

            <div>
              <label className="label" htmlFor="to">To</label>
              <input id="to" name="to" type="date" defaultValue={sp.to ?? ""} className="input" />
            </div>

            <div>
              <label className="label" htmlFor="min">Min amount</label>
              <input
                id="min" name="min" type="text" inputMode="decimal"
                defaultValue={sp.min ?? ""} placeholder="0.00" className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="sort">Sort by</label>
              <select id="sort" name="sort" defaultValue={sp.sort ?? "date_desc"} className="input">
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="amount_desc">Largest amount</option>
                <option value="amount_asc">Smallest amount</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox" name="uncategorised" value="1"
                defaultChecked={sp.uncategorised === "1"}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Needs review only
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input
                type="checkbox" name="transfers" value="1"
                defaultChecked={sp.transfers === "1"}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Include transfers
            </label>

            {accounts.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-muted">
                Account
                <select name="account" defaultValue={sp.account ?? ""} className="input !w-auto !py-1">
                  <option value="">All</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="ml-auto flex items-center gap-2">
              {hasFilters && (
                <Link href="/app/transactions" className="btn btn-ghost h-9">
                  Clear
                </Link>
              )}
              <button type="submit" className="btn btn-primary h-9">
                Apply filters
              </button>
            </div>
          </div>
        </form>
      </Card>

      {/* ── Result summary ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p className="text-muted">
          <span className="font-semibold text-fg">{total.toLocaleString("en-GB")}</span>{" "}
          {total === 1 ? "transaction" : "transactions"}
          {hasFilters && " matching your filters"}
        </p>
        <p className="text-muted">
          Net across results:{" "}
          <span className={`font-semibold ${sumMinor >= 0 ? "text-positive" : "text-fg"}`}>
            {formatMoney(sumMinor, user.currency, { signed: sumMinor > 0 })}
          </span>
        </p>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        {rows.length ? (
          <TransactionTable rows={rows} categories={categories} currency={user.currency} />
        ) : (
          <EmptyState
            title="Nothing matches"
            description={
              hasFilters
                ? "Try loosening the filters — or clear them to see everything."
                : "Import a bank CSV, or add transactions one at a time."
            }
            action={
              hasFilters ? (
                <Link href="/app/transactions" className="btn btn-secondary h-9">
                  Clear filters
                </Link>
              ) : (
                <Link href="/app/import" className="btn btn-primary h-9">
                  Import a CSV
                </Link>
              )
            }
          />
        )}
      </Card>

      {/* ── Pagination ─────────────────────────────────────────────── */}
      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          <Link
            href={`/app/transactions?${queryString({ page: page - 1 })}`}
            aria-disabled={page <= 1}
            className={`btn btn-secondary h-9 ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            ← Previous
          </Link>

          <span className="text-sm text-muted">
            Page <span className="font-semibold text-fg">{page}</span> of {pages}
          </span>

          <Link
            href={`/app/transactions?${queryString({ page: page + 1 })}`}
            aria-disabled={page >= pages}
            className={`btn btn-secondary h-9 ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
          >
            Next →
          </Link>
        </nav>
      )}
    </div>
  );
}
