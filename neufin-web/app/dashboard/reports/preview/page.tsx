'use client'

import Link from 'next/link'
import { ReportDocument, sampleInstitutionalReportModel } from '@/lib/report-template'
import '@/lib/report-print.css'

/**
 * Institutional HTML report preview (print CSS).
 *
 * Paged.js is installed for a future flow: mount generated HTML in an iframe,
 * run `new (await import('pagedjs')).Previewer().preview(source, [], target)`,
 * then print / capture. The production PDF path remains backend ReportLab.
 */
export default function ReportPreviewPage() {
  return (
    <div className="min-h-screen bg-app px-4 py-8 text-navy">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-page-title font-semibold tracking-tight">Report print preview</h1>
            <p className="mt-1 text-sm text-muted2">
              HTML + print CSS template. Use the browser print dialog for a quick PDF check. Optional:{' '}
              <code className="rounded bg-surface-3 px-1 text-xs">pagedjs</code> Previewer for page breaks.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-dark"
            >
              Print / Save PDF
            </button>
            <Link
              href="/dashboard/reports"
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-primary-dark shadow-sm hover:border-primary/40"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-6 shadow-sm print:border-0 print:shadow-none">
          <ReportDocument model={sampleInstitutionalReportModel()} />
        </div>
      </div>
    </div>
  )
}
