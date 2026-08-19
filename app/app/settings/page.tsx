import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { listAccounts, listRules } from "@/lib/repository";
import { countTransactions, getDateBounds } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import {
  DangerPanel,
  ProfilePanel,
  RetrainPanel,
  RulesPanel,
} from "@/components/SettingsPanels";
import { deleteAccount, wipeEverything } from "@/app/actions/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  const [categories, rules, accounts, txCount, bounds, confirmedRow] = await Promise.all([
    all<{ name: string; icon: string; color: string; kind: string }>(
      "SELECT name, icon, color, kind FROM categories WHERE user_id = ? ORDER BY sort ASC",
      user.id,
    ),
    listRules(user.id),
    listAccounts(user.id),
    countTransactions(user.id),
    getDateBounds(user.id),
    get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND is_confirmed = 1",
      user.id,
    ),
  ]);
  const confirmed = confirmedRow?.n ?? 0;
  const isRemote = !!process.env.TURSO_DATABASE_URL;
  const isEphemeral = !isRemote && !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  const byKind = {
    expense: categories.filter((c) => c.kind === "expense"),
    income: categories.filter((c) => c.kind === "income"),
    transfer: categories.filter((c) => c.kind === "transfer"),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your profile, the categorisation rules, and everything to do with your data."
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" subtitle={user.email} />
            <ProfilePanel name={user.name} currency={user.currency} />
          </Card>

          <Card>
            <CardHeader
              title="Categorisation rules"
              subtitle="Absolute overrides for merchants the classifier keeps misreading"
            />
            <RulesPanel
              rules={rules}
              categories={categories.map((c) => ({ name: c.name, kind: c.kind }))}
            />
          </Card>

          <Card>
            <CardHeader title="The classifier" subtitle="Retrain on everything you've confirmed" />
            <RetrainPanel confirmedCount={confirmed} />
          </Card>

          <Card className="border-negative/30">
            <CardHeader title="Danger zone" subtitle="These cannot be undone" />
            <DangerPanel wipeAction={wipeEverything} deleteAction={deleteAccount} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Your data" />
            <dl className="divide-y divide-line px-5 text-sm">
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted">Transactions</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {txCount.toLocaleString("en-GB")}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted">Confirmed by you</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {confirmed.toLocaleString("en-GB")}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted">Accounts</dt>
                <dd className="font-semibold tabular-nums text-fg">{accounts.length}</dd>
              </div>
              {bounds && (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted">History covers</dt>
                  <dd className="text-right text-xs font-medium text-fg">
                    {formatDate(bounds.min)} — {formatDate(bounds.max)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted">Stored at</dt>
                <dd className="font-mono text-xs text-fg">
                  {isRemote
                    ? "hosted libSQL database"
                    : isEphemeral
                      ? "/tmp (temporary)"
                      : "data/fiscora.db"}
                </dd>
              </div>
            </dl>
            <div className="border-t border-line px-5 py-3">
              <a href="/api/export" className="btn btn-secondary h-9 w-full">
                <span aria-hidden="true">↑</span> Export everything as CSV
              </a>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Categories"
              subtitle={`${categories.length} in your taxonomy`}
            />
            <div className="space-y-4 px-5 py-4">
              {(["expense", "income", "transfer"] as const).map((kind) => (
                <div key={kind}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
                    {kind === "transfer" ? "Transfers (excluded from totals)" : kind}
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {byKind[kind].map((c) => (
                      <li
                        key={c.name}
                        className="chip border-line bg-surface-2 text-muted"
                        title={c.name}
                      >
                        <span aria-hidden="true">{c.icon}</span>
                        {c.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card className="px-5 py-4">
            <h2 className="text-sm font-semibold text-fg">Privacy</h2>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
              {isRemote
                ? "Your data lives in a SQLite database you host yourself (via Turso), reachable only with your access token. There is no telemetry, no analytics script and no third-party service in the loop — the ML runs entirely on this server, not in an external API."
                : "Everything lives in a single SQLite file on this machine. There is no telemetry, no analytics script and no external API call anywhere in the application — the ML runs in-process. Deleting the file removes the data entirely."}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
