/**
 * HTML-first institutional report template (Paged.js–ready).
 *
 * Migration: ReportLab PDF remains the default export from the API.
 * This module provides the same narrative structure for a future path:
 * render this markup → Paged.js pagination → print / headless PDF.
 *
 * Premium IC-only export: POST /api/reports/generate with { ic_grade_only: true }
 * when the backend assesses report_state as final-quality inputs (else 422).
 */

import type { ReactNode } from 'react'

export type ReportState = 'draft' | 'review' | 'final'
export type SectionConfidence = 'high' | 'medium' | 'low'

export interface ReportSectionModel {
  id: string
  title: string
  confidence: SectionConfidence
  status: 'complete' | 'partial' | 'unavailable'
  summary: string
  bullets?: string[]
  metrics?: Record<string, string | number | null>
}

export interface InstitutionalReportModel {
  reportState: ReportState
  clientName: string
  portfolioName: string
  asOf: string
  firmName: string
  sections: ReportSectionModel[]
}

function confidenceClass(c: SectionConfidence): string {
  if (c === 'high') return 'confidence confidence-high'
  if (c === 'medium') return 'confidence confidence-medium'
  return 'confidence confidence-low'
}

/** Server or client: render sections to static HTML for Paged.js container. */
export function ReportDocument({ model }: { model: InstitutionalReportModel }): ReactNode {
  return (
    <article className="neufin-report">
      <header>
        <h1>Portfolio intelligence memo</h1>
        <p className="meta">
          <strong>{model.firmName}</strong> · {model.clientName} · {model.portfolioName} · As of {model.asOf}
          <br />
          Report status: <strong>{model.reportState.toUpperCase()}</strong>
          {model.reportState !== 'final' && (
            <span> — Not certified for external IC distribution until inputs are complete.</span>
          )}
        </p>
      </header>

      {model.sections.map((sec) => (
        <section key={sec.id} className="section">
          <h2>
            {sec.title}
            <span className={confidenceClass(sec.confidence)}>{sec.confidence} confidence</span>
          </h2>
          <p>{sec.summary}</p>
          {sec.bullets && sec.bullets.length > 0 && (
            <ul>
              {sec.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {sec.metrics && Object.keys(sec.metrics).length > 0 && (
            <table>
              <tbody>
                {Object.entries(sec.metrics).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v === null || v === undefined ? '—' : String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <footer className="footer">
        Confidential — for professional use only. Not investment advice. Metrics reconciled in NeuFin
        report engine; validate against custodian statements before IC presentation.
      </footer>
    </article>
  )
}

/** Sample payload for /dashboard/reports/preview (Paged.js smoke test). */
export function sampleInstitutionalReportModel(): InstitutionalReportModel {
  return {
    reportState: 'review',
    clientName: 'Confidential client',
    portfolioName: 'Sample growth portfolio',
    asOf: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    firmName: 'NeuFin Intelligence',
    sections: [
      {
        id: 'exec',
        title: 'Executive summary',
        confidence: 'high',
        status: 'complete',
        summary:
          'Skim-first overview: diversified US equities with a growth tilt, moderate concentration in large-cap tech, and actionable tax-loss harvesting where cost basis is available.',
        bullets: ['Core risk: factor crowding in mega-cap growth.', 'Horizon: tactical 30–90 days.'],
      },
      {
        id: 'snap',
        title: 'Portfolio snapshot',
        confidence: 'high',
        status: 'complete',
        summary: 'Holdings and weights reflect last marks from the upload pipeline.',
        metrics: { 'Total AUM': '$2,450,000', 'Positions': 18, 'Weighted beta': '1.12', 'Sharpe (est.)': '0.74' },
      },
      {
        id: 'risk',
        title: 'Risk analysis',
        confidence: 'medium',
        status: 'partial',
        summary: 'Correlation and factor metrics use live estimates; full Swarm IC enriches regime labels.',
      },
      {
        id: 'scenario',
        title: 'Scenario analysis',
        confidence: 'medium',
        status: 'partial',
        summary:
          'Historical regime stress shown only when position weights are valid and scenario returns are within bounds; otherwise qualitative ranges are used.',
      },
    ],
  }
}
