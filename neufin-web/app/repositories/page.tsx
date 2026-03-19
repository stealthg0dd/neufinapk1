import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Repositories — Sorted by Push Date | Neufin',
  description: 'Browse GitHub repositories sorted by latest push date, with usage statistics.',
}

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  html_url: string
  description: string | null
  pushed_at: string
  updated_at: string
  created_at: string
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  language: string | null
  private: boolean
  fork: boolean
  size: number
}

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'stealthg0dd'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

async function getRepositories(): Promise<GitHubRepo[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`
  }

  try {
    const res = await fetch(
      `https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=pushed&direction=desc&per_page=100&type=owner`,
      {
        headers,
        next: { revalidate: 300 }, // refresh every 5 minutes
      }
    )
    if (!res.ok) {
      console.error(`[Repositories] GitHub API error: ${res.status} ${res.statusText}`)
      return []
    }
    const data: GitHubRepo[] = await res.json()
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.error('[Repositories] Failed to fetch GitHub repositories:', err)
    return []
  }
}

/** Usage score = stars + forks + watchers (proxy for community interest) */
function usageScore(repo: GitHubRepo): number {
  return repo.stargazers_count + repo.forks_count + repo.watchers_count
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  if (months < 12) return `${months} months ago`
  const years = Math.floor(months / 12)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  'C#': '#178600',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Dart: '#00b4ab',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
}

export default async function RepositoriesPage() {
  const repos = await getRepositories()

  // Sort by pushed_at (already sorted by API, but ensure order)
  const sorted = [...repos].sort(
    (a, b) => new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime()
  )

  const scores = sorted.map(usageScore)
  const maxScore = Math.max(...scores, 1)

  // Identify most-used (top 3 by score) and least-used (bottom 3 by score)
  const sortedByScore = [...sorted].sort((a, b) => usageScore(b) - usageScore(a))
  const mostUsedIds = new Set(sortedByScore.slice(0, 3).map((r) => r.id))
  const leastUsedIds = new Set(
    sortedByScore
      .slice(-3)
      .filter((r) => !mostUsedIds.has(r.id))
      .map((r) => r.id)
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient">
            Neufin
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/upload" className="btn-outline py-2 text-sm">
              DNA Score
            </Link>
            <Link href="/dashboard" className="btn-primary py-2 text-sm">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            📦 Repositories
          </h1>
          <p className="text-gray-400 text-sm">
            <span className="font-medium text-gray-300">@{GITHUB_USERNAME}</span>
            {' · '}
            {sorted.length} {sorted.length === 1 ? 'repository' : 'repositories'}
            {' · '}
            sorted by latest push date
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mb-6 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500/80"></span>
            Most used (top 3 by ⭐ + 🍴 + 👁)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500/60"></span>
            Least used (bottom 3)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400/60"></span>
            Usage score = stars + forks + watchers
          </span>
        </div>

        {sorted.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-gray-500 text-lg">No public repositories found for @{GITHUB_USERNAME}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/60">
                  <th className="text-left px-4 py-3 text-gray-400 font-semibold w-8">#</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-semibold">Repository</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-semibold hidden sm:table-cell">Language</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-semibold">⭐ Stars</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-semibold hidden md:table-cell">🍴 Forks</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-semibold hidden lg:table-cell">👁 Watch</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-semibold hidden md:table-cell">🐛 Issues</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-semibold">Usage</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-semibold">Last Push</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((repo, idx) => {
                  const score = usageScore(repo)
                  const isMost = mostUsedIds.has(repo.id)
                  const isLeast = leastUsedIds.has(repo.id)
                  const barWidth = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0

                  return (
                    <tr
                      key={repo.id}
                      className={[
                        'border-b border-gray-800/60 transition-colors',
                        isMost
                          ? 'bg-green-950/20 hover:bg-green-950/30'
                          : isLeast
                          ? 'bg-red-950/15 hover:bg-red-950/25'
                          : 'hover:bg-gray-900/60',
                      ].join(' ')}
                    >
                      {/* Rank */}
                      <td className="px-4 py-3 text-gray-600 text-xs w-8">{idx + 1}</td>

                      {/* Repo name + description */}
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            {repo.name}
                          </a>
                          {repo.fork && (
                            <span className="badge bg-gray-700/60 text-gray-400 text-[10px] py-0 px-2">fork</span>
                          )}
                          {repo.private && (
                            <span className="badge bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[10px] py-0 px-2">private</span>
                          )}
                          {isMost && (
                            <span className="badge bg-green-500/15 text-green-400 border border-green-500/25 text-[10px] py-0 px-2">
                              🔥 most used
                            </span>
                          )}
                          {isLeast && (
                            <span className="badge bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] py-0 px-2">
                              💤 least used
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-gray-500 text-xs mt-1 truncate max-w-sm">
                            {repo.description}
                          </p>
                        )}
                      </td>

                      {/* Language */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {repo.language ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: LANG_COLORS[repo.language] ?? '#6b7280' }}
                            />
                            <span className="text-gray-300 text-xs">{repo.language}</span>
                          </span>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>

                      {/* Stars */}
                      <td className="px-4 py-3 text-right text-gray-300 tabular-nums">
                        {repo.stargazers_count.toLocaleString()}
                      </td>

                      {/* Forks */}
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums hidden md:table-cell">
                        {repo.forks_count.toLocaleString()}
                      </td>

                      {/* Watchers */}
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums hidden lg:table-cell">
                        {repo.watchers_count.toLocaleString()}
                      </td>

                      {/* Open Issues */}
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums hidden md:table-cell">
                        {repo.open_issues_count.toLocaleString()}
                      </td>

                      {/* Usage bar + score */}
                      <td className="px-4 py-3 text-right min-w-[90px]">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-gray-200 font-medium tabular-nums text-xs">
                            {score.toLocaleString()}
                          </span>
                          <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isMost
                                  ? 'bg-green-500'
                                  : isLeast
                                  ? 'bg-red-500'
                                  : 'bg-blue-500'
                              }`}
                              style={{ width: `${Math.max(barWidth, score > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Last Push */}
                      <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">
                        <span className="text-gray-300 text-xs">{timeAgo(repo.pushed_at)}</span>
                        <br />
                        <span className="text-gray-600 text-[11px]">{formatDate(repo.pushed_at)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary cards */}
        {sorted.length > 0 && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Most used */}
            <div className="card border-green-800/40 bg-gradient-to-br from-green-950/30 to-transparent">
              <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-3">
                🔥 Most Used
              </h3>
              <ul className="space-y-2">
                {sortedByScore.slice(0, 3).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <a
                      href={r.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-200 hover:text-blue-400 transition-colors truncate"
                    >
                      {r.name}
                    </a>
                    <span className="text-xs text-green-400 font-semibold shrink-0">
                      {usageScore(r).toLocaleString()} pts
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Least used */}
            <div className="card border-red-800/30 bg-gradient-to-br from-red-950/20 to-transparent">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">
                💤 Least Used
              </h3>
              <ul className="space-y-2">
                {sortedByScore
                  .slice(-3)
                  .reverse()
                  .map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <a
                        href={r.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-200 hover:text-blue-400 transition-colors truncate"
                      >
                        {r.name}
                      </a>
                      <span className="text-xs text-red-400 font-semibold shrink-0">
                        {usageScore(r).toLocaleString()} pts
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            {/* Stats */}
            <div className="card">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                📊 Stats
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-gray-500">Total repos</span>
                  <span className="font-semibold">{sorted.length}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-500">Total ⭐ stars</span>
                  <span className="font-semibold">
                    {sorted.reduce((s, r) => s + r.stargazers_count, 0).toLocaleString()}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-500">Total 🍴 forks</span>
                  <span className="font-semibold">
                    {sorted.reduce((s, r) => s + r.forks_count, 0).toLocaleString()}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-gray-500">🐛 Open issues</span>
                  <span className="font-semibold">
                    {sorted.reduce((s, r) => s + r.open_issues_count, 0).toLocaleString()}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800/60 py-6 text-center text-sm text-gray-600">
        Neufin © {new Date().getFullYear()} · Repository data from{' '}
        <a
          href={`https://github.com/${GITHUB_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-400 transition-colors"
        >
          GitHub API
        </a>
      </footer>
    </div>
  )
}
