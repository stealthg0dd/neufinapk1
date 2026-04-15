import { Suspense } from 'react'
import ResultsContent from './ResultsContent'

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <ResultsContent />
    </Suspense>
  )
}
