import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sample DNA Report | NeuFin",
  description: "Anonymous portfolio DNA report with behavioral and structural diagnostics.",
};

const diagnostics = [
  ["Archetype", "Balanced Growth — Vietnam Financial Sector"],
  ["DNA score", "73 / 100"],
  ["Primary bias", "Concentration conviction"],
  ["Main repair", "Position caps and rebalance triggers"],
];

export default function SampleDnaReportPage() {
  return (
    <main className="min-h-screen bg-white text-[#0F172A]">
      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <Image
          src="/graphics/ai-agents-visualization.png"
          width={720}
          height={520}
          alt="NeuFin agent analysis visualization"
          className="rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] object-cover"
          priority
        />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0369A1]">
            Anonymous sample
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Portfolio DNA Report
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#475569]">
            A structural and behavioral map of portfolio risk, decision patterns,
            and repair actions.
          </p>
        </div>
      </section>

      <section className="border-y border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {diagnostics.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#CBD5E1] bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748B]">
                {label}
              </p>
              <p className="mt-3 text-lg font-bold text-[#0F172A]">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <h2 className="text-2xl font-bold">Repair Plan</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            "Cap high-conviction names before adding new sector exposure.",
            "Separate thesis risk from behavioral anchoring in loss positions.",
            "Track concentration HHI monthly against the committee limit.",
          ].map((item) => (
            <div key={item} className="rounded-lg border border-[#CBD5E1] p-5">
              <p className="text-sm leading-7 text-[#334155]">{item}</p>
            </div>
          ))}
        </div>
        <Link
          href="/upload"
          className="mt-10 inline-flex rounded-lg bg-[#0369A1] px-5 py-3 text-sm font-semibold text-white hover:bg-[#075985]"
        >
          Analyze free →
        </Link>
      </section>
    </main>
  );
}
