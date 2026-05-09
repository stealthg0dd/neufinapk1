import Link from "next/link";
import { ClipboardPaste, Link2, Upload } from "lucide-react";
import { isAdvisorModeEnabled, isPlaidConnectEnabled } from "@/lib/featureFlags";

export default function ConnectPortfolioPage() {
  const advisor = isAdvisorModeEnabled();
  const plaid = isPlaidConnectEnabled();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          Connect portfolio
        </h1>
        <p className="mt-1 text-sm text-slate2">
          Choose how to bring holdings into NeuFin. Your existing CSV upload flow
          is unchanged.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary">
            <Link2 className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </div>
          <h2 className="text-base font-semibold text-navy">Connect brokerage</h2>
          <p className="mt-2 flex-1 text-sm text-slate2">
            Link accounts for automated sync (rollout controlled separately).
          </p>
          {plaid ? (
            <span className="mt-4 inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
              Coming soon
            </span>
          ) : (
            <p className="mt-4 text-xs font-medium text-muted2">
              Disabled — enable when your workspace turns on Plaid connect.
            </p>
          )}
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary">
            <Upload className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </div>
          <h2 className="text-base font-semibold text-navy">Upload file</h2>
          <p className="mt-2 flex-1 text-sm text-slate2">
            Use a CSV with symbol, shares, and optional cost basis — the same
            public upload you already know.
          </p>
          <Link
            href="/upload"
            className="btn-primary mt-4 inline-flex w-full justify-center py-2.5 text-sm"
          >
            Go to upload
          </Link>
        </div>

        <div className="flex flex-col rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-primary">
            <ClipboardPaste className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          </div>
          <h2 className="text-base font-semibold text-navy">Paste raw text</h2>
          <p className="mt-2 flex-1 text-sm text-slate2">
            Paste broker exports or freeform lines; we parse deterministically for
            review before analysis.
          </p>
          {advisor ? (
            <Link
              href="/dashboard/raw-input"
              className="btn-secondary mt-4 inline-flex w-full justify-center border-primary/30 py-2.5 text-sm text-primary"
            >
              Paste portfolio
            </Link>
          ) : (
            <Link
              href="/upload"
              className="btn-secondary mt-4 inline-flex w-full justify-center py-2.5 text-sm"
              title="Advisor mode is off — use CSV upload"
            >
              Use CSV upload
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
