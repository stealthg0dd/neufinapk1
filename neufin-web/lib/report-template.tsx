/**
 * HTML-first institutional report template (Paged.js–ready).
 * Goldman-style: white ground, black type, minimal accent, fixed IC section order.
 */

import type { ReactNode } from "react";

export type ReportState = "draft" | "review" | "final";
export type SectionConfidence = "high" | "medium" | "low";

export interface ReportSectionModel {
  id: string;
  title: string;
  confidence: SectionConfidence;
  status: "complete" | "partial" | "unavailable";
  summary: string;
  bullets?: string[];
  metrics?: Record<string, string | number | null>;
}

export interface InstitutionalReportModel {
  reportState: ReportState;
  clientName: string;
  portfolioName: string;
  asOf: string;
  firmName: string;
  /** Body sections only (§2–§8). Cover is rendered from model header fields. */
  sections: ReportSectionModel[];
}

/** Canonical section order for IC memos (matches PDF narrative). */
export const REPORT_SECTION_ORDER = [
  "executive",
  "snapshot",
  "risk",
  "behavioral",
  "scenario",
  "recommendations",
  "appendix",
] as const;

function confidenceLabel(c: SectionConfidence): string {
  if (c === "high") return "High confidence";
  if (c === "medium") return "Medium confidence";
  return "Low confidence";
}

function isValidMetricValue(v: string | number | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") {
    const t = v.trim();
    if (
      !t ||
      t === "—" ||
      t.toLowerCase() === "nan" ||
      t.toLowerCase() === "n/a"
    )
      return false;
  }
  if (typeof v === "number" && (Number.isNaN(v) || !Number.isFinite(v)))
    return false;
  return true;
}

function CoverBlock({ model }: { model: InstitutionalReportModel }): ReactNode {
  const statusNote =
    model.reportState === "final"
      ? "Certified for committee use subject to advisor validation."
      : model.reportState === "review"
        ? "Advisor review: verify inputs before external distribution."
        : "Draft: incomplete inputs — not for external IC distribution.";

  return (
    <section className="report-cover" aria-label="Cover">
      <p className="report-cover-eyebrow">
        Confidential · Investment committee
      </p>
      <h1 className="report-cover-title">Portfolio intelligence report</h1>
      <div className="report-cover-rule" />
      <dl className="report-cover-meta">
        <div>
          <dt>Firm</dt>
          <dd>{model.firmName}</dd>
        </div>
        <div>
          <dt>Client</dt>
          <dd>{model.clientName}</dd>
        </div>
        <div>
          <dt>Portfolio</dt>
          <dd>{model.portfolioName}</dd>
        </div>
        <div>
          <dt>As of</dt>
          <dd>{model.asOf}</dd>
        </div>
      </dl>
      <p className="report-cover-status">{statusNote}</p>
    </section>
  );
}

function SectionBlock({
  index,
  sec,
}: {
  index: number;
  sec: ReportSectionModel;
}): ReactNode {
  const sectionNo = index + 2;
  const metricsEntries =
    sec.metrics != null
      ? Object.entries(sec.metrics).filter(([, v]) => isValidMetricValue(v))
      : [];

  return (
    <section key={sec.id} className="report-section" id={sec.id}>
      <header className="report-section-header">
        <span className="report-section-num">{sectionNo}</span>
        <div className="report-section-titles">
          <h2>{sec.title}</h2>
          <span
            className="report-section-confidence"
            data-level={sec.confidence}
          >
            {confidenceLabel(sec.confidence)}
            {sec.status !== "complete" ? ` · ${sec.status}` : ""}
          </span>
        </div>
      </header>
      <div className="report-section-sep" />
      <p className="report-section-summary">{sec.summary}</p>
      {sec.bullets && sec.bullets.length > 0 && (
        <ul className="report-bullets">
          {sec.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {metricsEntries.length > 0 && (
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {metricsEntries.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Server or client: render sections to static HTML for Paged.js container. */
export function ReportDocument({
  model,
}: {
  model: InstitutionalReportModel;
}): ReactNode {
  return (
    <article className="neufin-report">
      <CoverBlock model={model} />
      {model.sections.map((sec, i) => (
        <SectionBlock key={sec.id} index={i} sec={sec} />
      ))}
      <footer className="report-footer">
        Confidential — professional use only. Not investment advice. Reconcile
        all figures against custodian statements before committee presentation.
      </footer>
    </article>
  );
}

/** Sample payload for /dashboard/reports/preview (Paged.js smoke test). */
export function sampleInstitutionalReportModel(): InstitutionalReportModel {
  const asOf = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return {
    reportState: "review",
    clientName: "Confidential client",
    portfolioName: "Sample growth portfolio",
    asOf,
    firmName: "NeuFin Intelligence",
    sections: [
      {
        id: "executive",
        title: "Executive summary",
        confidence: "high",
        status: "complete",
        summary:
          "Concise view of positioning, key risks, and near-term priorities. Diversified US equities with a growth tilt; moderate concentration in large-cap technology; tax-loss harvesting opportunities where cost basis is available.",
        bullets: [
          "Primary risk: factor crowding in mega-cap growth.",
          "Horizon: tactical 30–90 days; revisit after next earnings cycle.",
        ],
      },
      {
        id: "snapshot",
        title: "Portfolio snapshot",
        confidence: "high",
        status: "complete",
        summary:
          "Holdings and weights reflect last marks from the upload pipeline.",
        metrics: {
          "Total AUM": "$2,450,000",
          Positions: 18,
          "Weighted beta": "1.12",
          "Cash weight": "4.2%",
        },
      },
      {
        id: "risk",
        title: "Risk analysis",
        confidence: "medium",
        status: "partial",
        summary:
          "Correlation and factor metrics use live estimates where available. Full regime labels and stress paths require a complete Swarm IC run.",
        bullets: [
          "Review single-name concentration vs. policy limits.",
          "Stress paths summarized in Scenario analysis.",
        ],
      },
      {
        id: "behavioral",
        title: "Behavioral insights",
        confidence: "medium",
        status: "partial",
        summary:
          "Investor DNA and bias patterns inform governance and communication around the mandate. Complete behavioral module for full classification.",
      },
      {
        id: "scenario",
        title: "Scenario analysis",
        confidence: "medium",
        status: "partial",
        summary:
          "Historical regime stress and forward scenarios are shown when weights and return inputs validate; otherwise qualitative ranges apply.",
      },
      {
        id: "recommendations",
        title: "Recommendations",
        confidence: "high",
        status: "complete",
        summary:
          "Actionable items across risk, tax, and implementation. Prioritize by materiality to the mandate and execution capacity.",
        bullets: [
          "Rebalance toward policy weights.",
          "Document rationale for any tactical overrides.",
        ],
      },
      {
        id: "appendix",
        title: "Appendix",
        confidence: "high",
        status: "complete",
        summary:
          "Methodology, data sources, and limitations. Retain with the committee pack for audit trail.",
        metrics: {
          "Report engine": "NeuFin v2",
          "Data freshness": asOf,
        },
      },
    ],
  };
}
