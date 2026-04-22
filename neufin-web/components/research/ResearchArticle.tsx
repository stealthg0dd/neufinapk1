import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { ActionCard } from "@/components/ActionCard";

const researchSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  attributes: {
    ...defaultSchema.attributes,
    th: ["colspan", "rowspan", "align"],
    td: ["colspan", "rowspan", "align"],
  },
};

export type ResearchSignal = {
  label: string;
  detail?: string;
};

export type ResearchArticleProps = {
  title: string;
  summary: string;
  markdown: string;
  regime?: string | null;
  confidenceScore?: number | null;
  publishedAt: string;
  signals?: ResearchSignal[];
  assetTickers?: string[];
  implicationItems?: Array<string | object>;
  suggestedAction?: string | object | null;
};

function displayRegime(regime: string | null | undefined) {
  if (!regime) return "Neutral";
  const key = regime.toLowerCase();
  switch (key) {
    case "risk_on":
      return "Risk-On";
    case "risk_off":
      return "Risk-Off";
    case "neutral":
      return "Neutral";
    case "stagflation":
      return "Stagflation";
    case "recovery":
      return "Recovery";
    case "recession":
      return "Recession";
    case "recession_risk":
      return "Recession Risk";
    default:
      return regime
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

function regimeClass(regime: string | null | undefined) {
  const key = (regime ?? "").toLowerCase();
  if (key.includes("risk_off") || key.includes("recession")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (key.includes("risk_on") || key === "recovery") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (key.includes("stagflation")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-surface-2 text-muted-foreground";
}

function normalizeConfidence(score: number | null | undefined) {
  if (score == null || Number.isNaN(score)) return null;
  return Math.round(score <= 1 ? score * 100 : score);
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/[#>*_\-~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readTime(markdown: string, summary: string) {
  const words = stripMarkdown(`${summary} ${markdown}`)
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function formattedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function KeySignalsPanel({
  regime,
  signals,
  framed = true,
}: {
  regime?: string | null;
  signals: ResearchSignal[];
  framed?: boolean;
}) {
  return (
    <div className={framed ? "rounded-md border border-border bg-surface p-5" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Key Signals
      </p>
      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Current regime</p>
          <p className="mt-1 text-base font-semibold text-foreground">
            {displayRegime(regime)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Top macro signals</p>
          <ul className="mt-2 space-y-2">
            {signals.slice(0, 3).map((signal, index) => (
              <li key={`${signal.label}-${index}`} className="text-sm leading-6">
                <span className="font-medium text-foreground">{signal.label}</span>
                {signal.detail ? (
                  <span className="block text-muted-foreground">{signal.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <Link
          href="/upload"
          className="inline-flex text-sm font-semibold text-primary hover:text-primary-dark"
        >
          Analyze your portfolio against this regime →
        </Link>
      </div>
    </div>
  );
}

export function ResearchArticle({
  title,
  summary,
  markdown,
  regime,
  confidenceScore,
  publishedAt,
  signals = [],
  assetTickers = [],
  implicationItems = [],
  suggestedAction = null,
}: ResearchArticleProps) {
  const confidence = normalizeConfidence(confidenceScore);
  const minutes = readTime(markdown, summary);
  const visibleSignals =
    signals.length > 0
      ? signals
      : [
          {
            label: displayRegime(regime),
            detail: summary || "Regime context from NeuFin research desk.",
          },
        ];

  return (
    <article className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-section lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <header className="mb-10">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${regimeClass(regime)}`}
            >
              {displayRegime(regime)}
            </span>
            {confidence != null ? (
              <span className="text-sm text-muted-foreground">
                {confidence}% confidence
              </span>
            ) : null}
            <span className="text-sm text-muted-foreground">
              {formattedDate(publishedAt)}
            </span>
            <span className="text-sm text-muted-foreground">
              {minutes} min read
            </span>
          </div>
          <h1 className="mt-6 max-w-[16ch] text-4xl font-bold leading-tight text-foreground sm:text-5xl">
            {title}
          </h1>
          {summary ? (
            <p className="mt-5 max-w-[72ch] text-lg leading-8 text-muted-foreground">
              {summary}
            </p>
          ) : null}
          {assetTickers.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {assetTickers.map((ticker) => (
                <span
                  key={ticker}
                  className="rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-xs text-primary"
                >
                  {ticker}
                </span>
              ))}
            </div>
          ) : null}
          <hr className="mt-8 border-border" />
        </header>

        {implicationItems.length > 0 || suggestedAction ? (
          <section className="mb-8 rounded-md border border-border bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Actionable Implications
            </p>
            <div className="mt-3">
              {implicationItems.map((item, index) => (
                <ActionCard key={index} raw={item} />
              ))}
              {suggestedAction ? <ActionCard raw={suggestedAction} /> : null}
            </div>
          </section>
        ) : null}

        <div className="mb-8 lg:hidden">
          <details className="rounded-md border border-border bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
              Key Signals
            </summary>
            <div className="border-t border-border p-4">
              <KeySignalsPanel
                regime={regime}
                signals={visibleSignals}
                framed={false}
              />
            </div>
          </details>
        </div>

        <div className="research-article-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, [rehypeSanitize, researchSchema]]}
            components={{
              h1: ({ children }) => (
                <h1 className="mb-6 mt-12 max-w-[72ch] border-b border-border pb-3 text-3xl font-bold leading-tight text-foreground">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-4 mt-10 max-w-[72ch] border-l-4 border-primary pl-4 text-2xl font-bold leading-snug text-foreground">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-3 mt-8 max-w-[72ch] text-lg font-bold leading-snug text-foreground">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="my-5 max-w-[72ch] text-base leading-[1.75] text-slate2">
                  {children}
                </p>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-8 max-w-[72ch] border-l-4 border-primary bg-surface-2 px-5 py-4 text-lg italic leading-8 text-foreground">
                  {children}
                </blockquote>
              ),
              ul: ({ children }) => (
                <ul className="my-5 max-w-[72ch] list-disc space-y-2 pl-7 leading-[1.8] text-slate2">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="my-5 max-w-[72ch] list-decimal space-y-2 pl-7 leading-[1.8] text-slate2">
                  {children}
                </ol>
              ),
              li: ({ children }) => <li className="pl-1">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-bold text-foreground">{children}</strong>
              ),
              code: ({ children }) => (
                <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-foreground">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="my-6 max-w-[72ch] overflow-x-auto rounded-md bg-surface-2 p-4 font-mono text-sm leading-7 text-foreground">
                  {children}
                </pre>
              ),
              a: ({ children, href }) => (
                <a
                  href={href}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {children}
                </a>
              ),
              hr: () => <hr className="my-8 max-w-[72ch] border-border" />,
              table: ({ children }) => (
                <div className="my-6 max-w-[72ch] overflow-x-auto">
                  <table className="w-full border-collapse text-sm">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="border border-border bg-surface-2 px-3 py-2 text-left font-semibold text-foreground">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-border px-3 py-2 text-slate2">
                  {children}
                </td>
              ),
            }}
          >
            {markdown || summary || "No content available."}
          </ReactMarkdown>
        </div>

        <footer className="mt-12 max-w-[72ch] rounded-md border border-primary/25 bg-primary/10 p-6">
          <p className="text-base leading-7 text-foreground">
            This analysis was generated by NeuFin&apos;s 7-agent swarm. Upload
            your portfolio to see how this regime affects your holdings.
          </p>
          <Link
            href="/upload"
            className="mt-5 inline-flex rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-dark"
          >
            Analyze free →
          </Link>
        </footer>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-4">
          <KeySignalsPanel regime={regime} signals={visibleSignals} />
        </div>
      </aside>
    </article>
  );
}
