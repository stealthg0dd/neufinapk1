"use client";

import Link from "next/link";
import { RawInputClient } from "./RawInputClient";

export const dynamic = "force-dynamic";

export default function RawInputPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 md:px-6">
      <p className="text-label">Portfolio</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Paste raw portfolio</h1>
        <Link
          href="/upload?method=upload"
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Back to upload hub
        </Link>
      </div>
      <RawInputClient />
    </div>
  );
}
