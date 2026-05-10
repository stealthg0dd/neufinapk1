"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ClipboardPaste, Plug, Upload } from "lucide-react";

export type ConnectionHubPath = "broker" | "upload";

const PASTE_DEFAULT_HREF = "/dashboard/raw-input";

function brokerBody(plaidEnabled: boolean) {
  return (
    <>
      <div
        className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${
          plaidEnabled ? "bg-primary-light text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        <Plug className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h2
        className={`text-base font-semibold ${
          plaidEnabled ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        Connect Brokerage
      </h2>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">
        Fidelity, Schwab, IBKR, TD Ameritrade, and 12,000+ institutions
      </p>
      <p
        className={`mt-2 text-xs font-medium ${
          plaidEnabled ? "text-foreground/90" : "text-muted-foreground/90"
        }`}
      >
        Auto-syncs holdings · Updates when you re-run analysis
      </p>
      <span className="mt-3 inline-flex w-fit rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        US · CA · UK · EU
      </span>
      {plaidEnabled ? (
        <>
          <span className="mt-4 inline-flex w-full justify-center rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white">
            Connect Securely →
          </span>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            Using a Singapore, Malaysia, Vietnam broker? Use Upload or Paste instead.
          </p>
        </>
      ) : (
        <span
          className="mt-4 inline-flex w-full cursor-not-allowed justify-center rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-medium text-muted-foreground"
          aria-disabled
        >
          Coming soon — US/EU/UK brokerages
        </span>
      )}
    </>
  );
}

function uploadBody() {
  return (
    <>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
        <Upload className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-foreground">Upload File</h2>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">
        CSV, Excel, PDF statement — any format
      </p>
      <p className="mt-2 text-xs font-medium text-foreground/90">
        Works with any broker · Instant analysis
      </p>
      <span className="mt-3 inline-flex w-fit rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
        Global
      </span>
      <span className="mt-4 inline-flex w-full justify-center rounded-xl border border-primary/40 bg-primary-light px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary-light/80">
        Upload CSV/XLSX →
      </span>
    </>
  );
}

function pasteBody() {
  return (
    <>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
        <ClipboardPaste className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-foreground">Paste Raw Portfolio</h2>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">
        Any format — WhatsApp, email copy, broker table, typed list
      </p>
      <p className="mt-2 text-xs font-medium text-foreground/90">
        NeuFin normalizes automatically · Review before analysis
      </p>
      <span className="mt-3 inline-flex w-fit rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900">
        Any format
      </span>
      <span className="mt-4 inline-flex w-full justify-center rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white">
        Paste Portfolio →
      </span>
    </>
  );
}

function interactiveShell(
  active: boolean,
  dimmed: boolean,
  children: ReactNode,
  onClick?: () => void,
) {
  const shell =
    "flex h-full min-h-[280px] flex-col rounded-2xl border p-5 text-left shadow-sm transition-all duration-200";
  const tone = active
    ? "border-primary bg-primary-light/40 ring-2 ring-primary/35"
    : "border-border bg-white hover:border-primary/25 hover:bg-surface-2/80";
  const fade = dimmed ? "opacity-55" : "";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${shell} ${tone} ${fade}`}>
        {children}
      </button>
    );
  }
  return <div className={`${shell} ${tone} ${fade}`}>{children}</div>;
}

type InteractiveProps = {
  variant: "interactive";
  activePath: ConnectionHubPath;
  onSelectBroker: () => void;
  onSelectUpload: () => void;
  plaidEnabled: boolean;
  pasteHref?: string;
};

type NavProps = {
  variant: "nav";
  plaidEnabled: boolean;
  pasteHref?: string;
};

export type ConnectionPathCardsProps = InteractiveProps | NavProps;

export function ConnectionPathCards(props: ConnectionPathCardsProps) {
  const pasteHref =
    props.variant === "interactive"
      ? (props.pasteHref ?? PASTE_DEFAULT_HREF)
      : (props.pasteHref ?? PASTE_DEFAULT_HREF);
  const plaidEnabled = props.plaidEnabled;

  if (props.variant === "nav") {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {plaidEnabled ? (
          <Link
            href="/upload?method=broker"
            className="flex h-full min-h-[260px] flex-col rounded-2xl border border-border bg-white p-5 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
          >
            {brokerBody(true)}
          </Link>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col rounded-2xl border border-border bg-muted/20 p-5 text-left opacity-70 shadow-sm">
            {brokerBody(false)}
          </div>
        )}

        <Link
          href="/upload?method=upload"
          className="flex h-full min-h-[260px] flex-col rounded-2xl border border-border bg-white p-5 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
        >
          {uploadBody()}
        </Link>

        <Link
          href={pasteHref}
          className="flex h-full min-h-[260px] flex-col rounded-2xl border border-border bg-white p-5 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
        >
          {pasteBody()}
        </Link>
      </div>
    );
  }

  const { activePath, onSelectBroker, onSelectUpload } = props;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plaidEnabled
        ? interactiveShell(
            activePath === "broker",
            activePath === "upload",
            brokerBody(true),
            onSelectBroker,
          )
        : interactiveShell(
            false,
            activePath === "upload",
            brokerBody(false),
            undefined,
          )}

      {interactiveShell(
        activePath === "upload",
        activePath === "broker",
        uploadBody(),
        onSelectUpload,
      )}

      <Link
        href={pasteHref}
        className="flex h-full min-h-[280px] flex-col rounded-2xl border border-border bg-white p-5 text-left opacity-65 shadow-sm transition-all hover:border-primary/30 hover:opacity-100"
      >
        {pasteBody()}
      </Link>
    </div>
  );
}
