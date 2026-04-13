import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-shell-deep flex flex-col items-center justify-center gap-5 text-center px-6">
      <div className="text-6xl font-extrabold text-blue-500/30 select-none">404</div>
      <h1 className="text-2xl font-bold text-white">Page not found</h1>
      <p className="text-shell-subtle text-sm max-w-xs">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link href="/" className="btn-primary px-8 py-3">
          Go home
        </Link>
        <Link href="/dashboard" className="btn-outline px-8 py-3">
          Dashboard
        </Link>
      </div>
    </div>
  )
}
