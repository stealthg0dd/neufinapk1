"use client";

import { ChevronDown } from "lucide-react";
import { OBJECTION_FAQ } from "@/lib/objections-content";

export function ObjectionsFAQ() {
  return (
    <section
      className="bg-lp-elevated py-20 md:py-24"
      id="faq"
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2
          id="faq-heading"
          className="text-center font-bold tracking-tight text-foreground"
          style={{ fontSize: "clamp(22px, 2.5vw, 30px)" }}
        >
          Common questions
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-[15px] leading-relaxed text-lp-muted">
          Straight answers for advisors, platforms, and risk teams evaluating NeuFin.
        </p>
        <div className="mt-10 space-y-3">
          {OBJECTION_FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-lp-border bg-white px-4 py-3 shadow-sm transition-colors open:border-primary/25 open:bg-primary-light/20"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 border-t border-lp-border/80 pt-3 text-sm leading-relaxed text-slate2">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
