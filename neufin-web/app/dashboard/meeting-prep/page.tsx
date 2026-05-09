"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

/**
 * Meeting prep workspace — linked from advisor morning brief / client book.
 * Full generation flow ships in a follow-up iteration.
 */
export default function MeetingPrepPage() {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("client");
    setClientId(q);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <p className="text-label">Advisor</p>
      <h1 className="text-2xl font-bold text-navy">Meeting prep</h1>
      <p className="text-sm text-muted2">
        {clientId
          ? `Prep bundle for client ${clientId.slice(0, 8)}… will aggregate DNA, alerts, and regime notes here. `
          : "Select a client from the morning brief or client book to start prep. "}
        This surface is shipping next in the communications studio.
      </p>
      <div className="flex flex-wrap gap-2 pt-2">
        <Link
          href="/dashboard/morning-brief"
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          ← Morning brief
        </Link>
        <Link
          href="/advisor/clients"
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Client book
        </Link>
      </div>
    </div>
  );
}
