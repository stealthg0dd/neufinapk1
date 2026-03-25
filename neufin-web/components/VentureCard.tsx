"use client"

import { useState } from "react"
import type { VentureCard as VentureCardData, TaskRecord, GitCommit } from "@/lib/dashboard-types"

// ── Color config per venture ───────────────────────────────────────────────────

const VENTURE_COLORS: Record<string, {
  border: string; glow: string; badge: string; dot: string
}> = {
  neufin:    { border: "border-blue-700/40",    glow: "hover:border-blue-500/60",   badge: "bg-blue-500/15 text-blue-300",    dot: "bg-blue-400" },
  arisole:   { border: "border-emerald-700/40", glow: "hover:border-emerald-500/60",badge: "bg-emerald-500/15 text-emerald-300",dot: "bg-emerald-400" },
  neumas:    { border: "border-purple-700/40",  glow: "hover:border-purple-500/60", badge: "bg-purple-500/15 text-purple-300", dot: "bg-purple-400" },
  apex_golf: { border: "border-amber-700/40",   glow: "hover:border-amber-500/60",  badge: "bg-amber-500/15 text-amber-300",  dot: "bg-amber-400" },
  defquant:  { border: "border-rose-700/40",    glow: "hover:border-rose-500/60",   badge: "bg-rose-500/15 text-rose-300",    dot: "bg-rose-400" },
}

const DEFAULT_COLOR = { border: "border-gray-700/40", glow: "hover:border-gray-500/60", badge: "bg-gray-500/15 text-gray-300", dot: "bg-gray-400" }

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: VentureCardData["status"] }) {
  const cfg = {
    active:      "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    maintenance: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    dormant:     "bg-gray-500/15 text-gray-400 border-gray-600/30",
  }[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cfg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        status === "active" ? "bg-emerald-400" : status === "maintenance" ? "bg-yellow-400" : "bg-gray-500"
      }`} />
      {status}
    </span>
  )
}

// ── Expanded panel ─────────────────────────────────────────────────────────────

function ExpandedPanel({
  venture,
  tasks,
  completedActions,
  onActionComplete,
  onClose,
}: {
  venture: VentureCardData
  tasks: TaskRecord[]
  completedActions: Set<string>
  onActionComplete: (action: string) => void
  onClose: () => void
}) {
  const blocked = tasks.filter((t) => t.status === "blocked")
  const pending = tasks.filter((t) => t.status === "pending")

  return (
    <div className="mt-3 rounded-xl border border-gray-700/50 bg-gray-900/80 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Full Brief — {venture.name}
        </span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
        >
          collapse ↑
        </button>
      </div>

      {/* Full brief */}
      {venture.briefFull ? (
        <pre className="whitespace-pre-wrap font-mono text-xs text-gray-300 leading-relaxed max-h-64 overflow-y-auto scrollbar-thin">
          {venture.briefFull}
        </pre>
      ) : (
        <p className="text-xs text-gray-500">No brief available — Morning Engine runs at 07:00 SGT.</p>
      )}

      {/* Actions required */}
      {venture.actionsRequired.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/70">
            Actions Required
          </p>
          {venture.actionsRequired.map((action, i) => {
            const key = `${venture.id}::${action}`
            const done = completedActions.has(key)
            return (
              <label
                key={i}
                className={`flex items-start gap-2.5 cursor-pointer rounded-lg p-2 transition-colors ${
                  done
                    ? "bg-emerald-500/5 border border-emerald-500/20"
                    : "bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10"
                }`}
              >
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => !done && onActionComplete(key)}
                  className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-amber-400 cursor-pointer"
                />
                <span className={`text-xs leading-snug ${done ? "line-through text-gray-500" : "text-amber-200/80"}`}>
                  {action}
                </span>
              </label>
            )
          })}
        </div>
      )}

      {/* Task list */}
      {(blocked.length > 0 || pending.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Tasks ({blocked.length} blocked · {pending.length} pending)
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {[...blocked, ...pending].slice(0, 15).map((task) => (
              <div
                key={task.id}
                className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                  task.status === "blocked"
                    ? "bg-red-500/5 border border-red-500/20"
                    : "bg-gray-800/50 border border-gray-700/30"
                }`}
              >
                <span className={`mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                  task.status === "blocked" ? "bg-red-400" : "bg-gray-500"
                }`} />
                <div className="min-w-0">
                  <p className={`truncate ${task.status === "blocked" ? "text-red-300" : "text-gray-300"}`}>
                    {task.title ?? task.input.slice(0, 80)}
                  </p>
                  {task.error_message && (
                    <p className="text-red-400/60 text-[10px] mt-0.5 truncate">{task.error_message}</p>
                  )}
                </div>
                <span className={`ml-auto flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  task.status === "blocked" ? "bg-red-500/20 text-red-300" : "bg-gray-700 text-gray-400"
                }`}>
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main VentureCard ───────────────────────────────────────────────────────────

interface VentureCardProps {
  venture: VentureCardData
  tasks: TaskRecord[]
  commits: GitCommit[]
  expanded: boolean
  completedActions: Set<string>
  onToggle: () => void
  onActionComplete: (actionKey: string) => void
}

export default function VentureCard({
  venture,
  tasks,
  commits,
  expanded,
  completedActions,
  onToggle,
  onActionComplete,
}: VentureCardProps) {
  const colors = VENTURE_COLORS[venture.id] ?? DEFAULT_COLOR
  const lastCommit = commits[0] ?? null
  const hasBlocked = venture.taskCounts.blocked > 0

  return (
    <div className="flex-shrink-0 w-64 sm:w-auto sm:flex-1 min-w-56">
      {/* Card */}
      <button
        onClick={onToggle}
        className={`w-full text-left rounded-xl border bg-gray-900/70 backdrop-blur-sm p-4 transition-all duration-200 ${colors.border} ${colors.glow} ${
          expanded ? "ring-1 ring-white/10 bg-gray-900" : ""
        }`}
      >
        {/* Top row: venture name + status badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${colors.dot}`} />
            <span className="font-semibold text-gray-100 text-sm truncate">{venture.name}</span>
          </div>
          <StatusBadge status={venture.status} />
        </div>

        {/* Business Head */}
        <p className="text-[10px] text-gray-500 mb-2.5">
          BH: <span className="text-gray-300 font-medium">{venture.businessHead}</span>
        </p>

        {/* Brief excerpt */}
        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mb-3 min-h-[2.5rem]">
          {venture.briefExcerpt || (
            <span className="text-gray-600 italic">No brief today</span>
          )}
        </p>

        {/* Git activity */}
        {lastCommit ? (
          <div className="rounded-md bg-gray-800/60 px-2.5 py-1.5 mb-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <svg className="h-3 w-3 text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
                <line x1="3" y1="12" x2="9" y2="12" />
                <line x1="15" y1="12" x2="21" y2="12" />
              </svg>
              <span className="text-[9px] text-gray-500 truncate flex-1">{lastCommit.message}</span>
            </div>
            <p className="text-[9px] text-gray-600 pl-4.5">
              {lastCommit.author} · {lastCommit.date}
            </p>
          </div>
        ) : (
          <div className="rounded-md bg-gray-800/30 px-2.5 py-1.5 mb-3">
            <p className="text-[9px] text-gray-600 italic">No repo connected</p>
          </div>
        )}

        {/* Task counts */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">
            {venture.taskCounts.pending} pending
          </span>
          {hasBlocked && (
            <span className="rounded-full bg-red-500/20 border border-red-500/30 px-2 py-0.5 text-[10px] font-semibold text-red-300">
              {venture.taskCounts.blocked} blocked
            </span>
          )}
          {!hasBlocked && venture.taskCounts.blocked === 0 && (
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">
              clear
            </span>
          )}
          {/* Expand chevron */}
          <svg
            className={`ml-auto h-3.5 w-3.5 text-gray-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <ExpandedPanel
          venture={venture}
          tasks={tasks}
          completedActions={completedActions}
          onActionComplete={onActionComplete}
          onClose={onToggle}
        />
      )}
    </div>
  )
}
