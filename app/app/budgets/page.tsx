import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getBudgetStatus, getKpis } from "@/lib/analytics";
import { suggestBudgets } from "@/lib/repository";
import { availableMonths } from "@/lib/dashboard";
import { currentMonth, formatMonth, monthEnd, monthStart } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { Card, CardHeader, EmptyState, PageHeader, StatTile } from "@/components/ui";
import MonthPicker from "@/components/MonthPicker";
import BudgetEditor from "@/components/BudgetEditor";
import { applyAllSuggestions } from "@/app/actions/budgets";

export const metadata: Metadata = { title: "Budgets" };
export const dynamic = "force-dynamic";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const months = availableMonths(user.id);
  const month = sp.month && months.includes(sp.month) ? sp.month : months[0] ?? currentMonth();

  const budgets = getBudgetStatus(user.id, month);
  const suggestions = suggestBudgets(user.id, 6);
  const kpis = getKpis(user.id, monthStart(month), monthEnd(month));
  const cur = user.currency;

  const totalBudget = budgets.reduce((a, b) => a + b.budgetMinor, 0);
  const totalSpent = budgets.reduce((a, b) => a + b.spentMinor, 0);
  const overCount = budgets.filter((b) => b.state === "over").length;
  const riskCount = budgets.filter((b) => b.state === "at-risk").length;
  // Spending that isn't covered by any budget at all — usually the real problem.
  const unbudgetedSpend = Math.max(0, kpis.spendMinor - totalSpent);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Budgets"
          description="A ceiling per category, checked against where the month is actually heading — not just where it has been."
        />
        <MonthPicker months={months} value={month} />
      </div>

      {budgets.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Total budgeted"
            value={formatMoney(totalBudget, cur)}
            hint={`across ${budgets.length} categories`}
            icon="🎯"
          />
          <StatTile
            label="Spent against budgets"
            value={formatMoney(totalSpent, cur)}
            delta={
              totalBudget > 0
                ? {
                    text: `${formatPercent(totalSpent / totalBudget)} used`,
                    direction: totalSpent > totalBudget ? "up" : "down",
                    good: totalSpent <= totalBudget,
                  }
                : undefined
            }
          />
          <StatTile
            label="Needs attention"
            value={String(overCount + riskCount)}
            hint={
              overCount + riskCount === 0
                ? "everything on track"
                : `${overCount} over · ${riskCount} at risk`
            }
            icon={overCount + riskCount === 0 ? "✓" : "⚠"}
          />
          <StatTile
            label="Unbudgeted spending"
            value={formatMoney(unbudgetedSpend, cur)}
            hint="categories with no ceiling set"
            icon="🕳️"
          />
        </div>
      )}

      <Card>
        <CardHeader
          title={`${formatMonth(month)} budgets`}
          subtitle="The darker marker on each bar shows the projected end-of-month position"
          action={
            suggestions.length > 0 && budgets.length === 0 ? (
              <form action={applyAllSuggestions}>
                <button type="submit" className="btn btn-primary h-9 text-xs">
                  Set all {suggestions.length} from history
                </button>
              </form>
            ) : null
          }
        />

        {budgets.length === 0 && suggestions.length === 0 ? (
          <EmptyState
            icon="🎯"
            title="No spending history to budget against yet"
            description="Import a couple of months of transactions and Fiscora can propose a realistic budget for every category."
            action={
              <Link href="/app/import" className="btn btn-primary h-9">
                Import a CSV
              </Link>
            }
          />
        ) : (
          <BudgetEditor
            budgets={budgets}
            suggestions={suggestions}
            currency={cur}
            monthLabel={formatMonth(month, true)}
          />
        )}
      </Card>

      <Card className="px-5 py-4">
        <h2 className="text-sm font-semibold text-fg">How the projection works</h2>
        <p className="mt-2 max-w-3xl text-[0.8125rem] leading-relaxed text-muted">
          The projected figure scales what you&apos;ve spent so far by how much of the month is
          left. It&apos;s deliberately simple and slightly pessimistic early in the month, which is
          when a warning is still useful. A category is flagged <strong>at risk</strong> when the
          projection lands more than 5% above the ceiling — enough headroom that normal variation
          doesn&apos;t cry wolf.
        </p>
      </Card>
    </div>
  );
}
