import type { Metadata } from 'next'
import { AuthScreen } from '@/components/auth/AuthScreen'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to NeuFin — behavioral finance intelligence for professionals.',
}

export default function LoginPage() {
  return <AuthScreen initialMode="login" />
}
