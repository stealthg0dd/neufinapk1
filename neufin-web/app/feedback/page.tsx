import type { Metadata } from 'next'
import FeedbackFormClient from './FeedbackFormClient'

export const metadata: Metadata = {
  title: 'Beta Feedback — NeuFin',
  description: 'Share your NeuFin beta testing experience with the founding team.',
  robots: { index: false, follow: false },
}

export default function FeedbackPage() {
  return <FeedbackFormClient />
}
