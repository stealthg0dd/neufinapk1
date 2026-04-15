'use client'

import Link from 'next/link'
import { ReportDocument, sampleInstitutionalReportModel } from '@/lib/report-template'
import { FadeIn } from '@/components/ui/FadeIn'
import '@/lib/report-print.css'

/**
 * Institutional HTML report preview (print CSS).
 * Backend ReportLab PDF remains production; this mirrors section structure for print QA.
 */
export default function ReportPreviewPage() {
  return (
    <div className="min-h-screen bg-app px-4 py-section text-navy">
      <div className="mx-auto max-w-3xl">
        <FadeIn>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-page-title font-semibold tracking-tight">Report preview</h1>
              <p className="mt-1 text-sm text-muted2">
                Institutional layout — use print to validate typography. Optional Paged.js for page breaks.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg border border-gray-300 bg-[#1EB8CC] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition duration-200 ease-out hover:bg-[#189fb2] hover:shadow-md active:scale-[0.99]"
              >
                Print / Save PDF
              </button>
              <Link
                href="/dashboard/reports"
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition duration-200 ease-out hover:border-gray-400 hover:bg-gray-50 active:scale-[0.99]"
              >
                Back
              </Link>
            </div>
          </div>
        </FadeIn>

        <FadeIn className="delay-75">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow duration-200 print:border-0 print:p-0 print:shadow-none hover:shadow-md">
            <ReportDocument model={sampleInstitutionalReportModel()} />
          </div>
        </FadeIn>
      </div>
    </div>
  )
}
