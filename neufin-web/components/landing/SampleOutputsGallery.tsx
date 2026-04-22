"use client";

import Link from "next/link";
import { FileText, LineChart, Presentation, ScrollText, Sparkles } from "lucide-react";
import { getSampleOutputGallery } from "@/lib/sample-outputs";
import type { SampleOutputKind } from "@/lib/sample-outputs";

const ICONS: Record<SampleOutputKind, typeof FileText> = {
  ic_memo: ScrollText,
  dna: Sparkles,
  advisor_pdf: Presentation,
  research: FileText,
  results: LineChart,
};

export function SampleOutputsGallery() {
  const items = getSampleOutputGallery();

  return (
    <section
      className="relative border-y border-lp-border bg-white py-20 sm:py-28"
      id="samples"
      aria-labelledby="samples-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center md:text-left">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">
            Sample outputs
          </p>
          <h2
            id="samples-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground"
          >
            See what committees receive
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-[17px] leading-relaxed text-slate2 md:mx-0">
            Representative layouts — swap in your portfolio for live DNA, Swarm IC,
            and Vault exports.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            const inner = (
              <>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate2">
                  {item.description}
                </p>
                <span className="mt-4 text-sm font-semibold text-primary">
                  View sample →
                </span>
              </>
            );
            const cardClass =
              "flex h-full flex-col rounded-2xl border border-lp-border bg-lp-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

            if (item.external) {
              return (
                <a
                  key={item.kind}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className={cardClass}
                >
                  {inner}
                </a>
              );
            }
            return (
              <Link key={item.kind} href={item.href} className={cardClass}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
