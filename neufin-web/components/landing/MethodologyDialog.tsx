"use client";

import { useId, useRef } from "react";
import { METHODOLOGY_SECTIONS } from "@/lib/methodology-content";

export function MethodologyDialogTrigger({
  className,
  label = "How methodology works",
}: {
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={
          className ??
          "text-sm font-semibold text-primary underline-offset-2 hover:underline"
        }
      >
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="fixed left-1/2 top-1/2 z-[100] w-[min(100vw-1.5rem,42rem)] max-h-[min(85vh,720px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-lp-border bg-white p-0 shadow-2xl [&::backdrop]:bg-black/40"
      >
        <div className="flex max-h-[min(85vh,720px)] flex-col">
          <div className="border-b border-lp-border px-5 py-4 sm:px-6">
            <h2 id={titleId} className="text-lg font-bold text-foreground">
              NeuFin methodology
            </h2>
            <p className="mt-1 text-sm text-slate2">
              What the platform computes, what it does not claim, and how agents
              combine into committee-grade output.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-8">
              {METHODOLOGY_SECTIONS.map((section) => (
                <section key={section.id} aria-labelledby={`${titleId}-${section.id}`}>
                  <h3
                    id={`${titleId}-${section.id}`}
                    className="text-[15px] font-semibold text-foreground"
                  >
                    {section.title}
                  </h3>
                  <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate2">
                    {section.body.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <div className="border-t border-lp-border bg-lp-elevated px-5 py-3 sm:px-6">
            <button
              type="button"
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark sm:w-auto"
              onClick={() => ref.current?.close()}
            >
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
