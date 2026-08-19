import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listAccounts, listBatches } from "@/lib/repository";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import ImportWizard from "@/components/ImportWizard";
import ImportHistory from "@/components/ImportHistory";

export const metadata: Metadata = { title: "Import" };
export const dynamic = "force-dynamic";

const BANK_TIPS = [
  {
    bank: "Most UK banks",
    text: "Look under Statements → Download, and pick CSV. Monzo, Starling, Lloyds, HSBC, Barclays, NatWest and Santander all export a compatible shape.",
  },
  {
    bank: "Split debit/credit columns",
    text: "Banks that use separate 'Money in' and 'Money out' columns are handled automatically — Fiscora negates the outgoing column for you.",
  },
  {
    bank: "Dates",
    text: "Day-first and month-first formats are both understood. The whole file is decided at once, so a statement is never half-interpreted one way and half the other.",
  },
  {
    bank: "Re-importing",
    text: "Overlapping statements are safe. Each row gets a content fingerprint with an occurrence index, so genuine same-day duplicates survive but re-imports don't double-count.",
  },
];

export default async function ImportPage() {
  const user = await requireUser();
  const [accounts, batches] = await Promise.all([listAccounts(user.id), listBatches(user.id)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import transactions"
        description="Bring in a CSV statement from any bank. Columns are detected for you, and you get to check the preview before anything is saved."
      />

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card className="px-5 py-5">
          <ImportWizard
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            currency={user.currency}
          />
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Getting your CSV" />
            <div className="px-5 py-4">
              <dl className="space-y-4">
                {BANK_TIPS.map((tip) => (
                  <div key={tip.bank}>
                    <dt className="text-[0.8125rem] font-semibold text-fg">{tip.bank}</dt>
                    <dd className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{tip.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Import history"
              subtitle="Undo removes every transaction from that file"
            />
            <ImportHistory batches={batches} />
          </Card>
        </div>
      </div>
    </div>
  );
}
