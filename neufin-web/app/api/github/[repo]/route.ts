/**
 * GitHub commits proxy — injects GITHUB_TOKEN server-side.
 * Maps repo slug to full org/repo via env vars.
 *
 * Required env vars:
 *   GITHUB_TOKEN=ghp_...
 *   NEUFIN_REPO=org/neufin
 *   ARISOLE_REPO=org/arisole
 *   NEUMAS_REPO=org/neumas
 *
 * Usage: GET /api/github/neufin
 */

import { NextResponse } from "next/server"
import type { GitCommit } from "@/lib/dashboard-types"

export const revalidate = 120

const REPO_MAP: Record<string, string | undefined> = {
  neufin:    process.env.NEUFIN_REPO,
  arisole:   process.env.ARISOLE_REPO,
  neumas:    process.env.NEUMAS_REPO,
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  const { repo } = await params
  const fullRepo = REPO_MAP[repo]

  if (!fullRepo) {
    return NextResponse.json({ commits: [], error: `Unknown repo slug: ${repo}` }, { status: 404 })
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ commits: [], error: "GITHUB_TOKEN not set" }, { status: 500 })
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${fullRepo}/commits?per_page=5`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "CTech-Agent-OS",
        },
        next: { revalidate: 120 },
      }
    )

    if (!res.ok) {
      return NextResponse.json({ commits: [], error: `GitHub API ${res.status}` }, { status: res.status })
    }

    const raw = await res.json() as Array<{
      sha: string
      commit: { message: string; author: { name: string; date: string } }
    }>

    const commits: GitCommit[] = raw.map((c) => ({
      sha:     c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0].slice(0, 72),
      author:  c.commit.author.name,
      date:    timeAgo(c.commit.author.date),
    }))

    return NextResponse.json({ commits })
  } catch (e) {
    return NextResponse.json(
      { commits: [], error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 }
    )
  }
}
