import type { Metadata } from 'next'
import { AuthScreen } from '@/components/auth/AuthScreen'

export const metadata: Metadata = {
  title: 'Sign up',
  description: 'Create a NeuFin account — save DNA scores and access research.',
}

export default function SignupPage() {
  return <AuthScreen initialMode="signup" />
}
