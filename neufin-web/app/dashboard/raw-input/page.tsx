"use client";

import Link from "next/link";

export const dynamic = "force-dynamic";

/** Phase 4 — rich paste / raw portfolio capture (placeholder). */
export default function RawInputPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <p className="text-label">Portfolio</p>
      <h1 className="text-2xl font-bold text-navy">Paste raw portfolio</h1>
      <p className="text-sm text-muted2">
        Structured paste, CSV repair, and advisor batch ingest will land in Phase
        4. For now, use Upload or Connect Portfolio from the dashboard.
      </p>
      <div className="flex flex-wrap gap-2 pt-2">
        <Link
          href="/upload"
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Go to upload
        </Link>
        <Link
          href="/dashboard/connect"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          Connect portfolio
        </Link>
      </div>
    </div>
  );
}
