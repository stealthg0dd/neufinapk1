"use client";

/**
 * Agent Studio user flow:
 * 1. Choose the core Swarm agents that should become the parent intelligence.
 * 2. Set weights, objective, horizon, risk, region, and asset class.
 * 3. Save the custom agent so it can be reused and run as an additive Swarm overlay.
 * 4. Inspect every core and custom agent through a learning dashboard: knowledge
 *    graph, intelligence curve, accuracy trend, domains, models, and data sources.
 * 5. Future marketplace sharing is modeled through `marketplace_visibility`, so
 *    private agents can later become copyable templates without changing the UI.
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiPost } from "@/lib/api-client";
import {
  Activity,
  BrainCircuit,
  GitBranch,
  Loader2,
  Network,
  Play,
  Save,
  Share2,
  SlidersHorizontal,
} from "lucide-react";

type CoreAgent = {
  id: string;
  name: string;
  domain: string;
  model: string;
  description: string;
};

type ParentWeight = { agent_id: string; weight: number };
type SavedAgent = {
  id: string;
  name: string;
  objective: string;
  parent_agents: ParentWeight[];
  config: AgentConfig;
  inheritance_summary?: string[];
};
type AgentConfig = {
  time_horizon: string;
  risk_tolerance: string;
  region_focus: string;
  asset_class: string;
  marketplace_visibility: "private" | "shareable";
};
type LearningDashboard = {
  graph: {
    nodes: Array<{ id: string; label: string; type: string; size: number }>;
    edges: Array<{ source: string; target: string; label: string; strength: number }>;
  };
  chart: Array<{ run: number; intelligence: number; accuracy: number; signalQuality: number }>;
  metrics: {
    market_events_processed: number;
    accuracy_trend: number;
    knowledge_graph_size: number;
    patterns_learned: number;
    domains_covered: number;
    parameters_learned: number;
    models_used: string[];
  };
};
type CompareAgent = {
  id: string;
  name: string;
  type: "core" | "custom";
  intelligence_level: number;
  specialization: string;
  performance: number;
};

const DEFAULT_CONFIG: AgentConfig = {
  time_horizon: "6-12 months",
  risk_tolerance: "balanced",
  region_focus: "Southeast Asia",
  asset_class: "Equities",
  marketplace_visibility: "private",
};

const fallbackCoreAgents: CoreAgent[] = [
  { id: "quant", name: "Quant Analyst", domain: "Factor models", model: "risk-return optimizer", description: "Portfolio math and factor pressure." },
  { id: "alpha", name: "Alpha Scout", domain: "Signal discovery", model: "opportunity ranker", description: "Catalysts, upside asymmetry, and signals." },
  { id: "strategist", name: "Strategist", domain: "Macro regime", model: "regime synthesizer", description: "Rates, FX, cycles, and liquidity." },
  { id: "risk", name: "Risk Sentinel", domain: "Downside control", model: "stress engine", description: "Concentration, shocks, and fragility." },
  { id: "tax", name: "Tax Alpha", domain: "Tax efficiency", model: "after-tax optimizer", description: "Tax drag and harvest windows." },
  { id: "behavior", name: "Behavioral Coach", domain: "Investor psychology", model: "bias detector", description: "Bias, panic risk, and conviction drift." },
  { id: "research", name: "Research Synthesizer", domain: "Narrative intelligence", model: "evidence summarizer", description: "Readable recommendations and IC notes." },
];

export default function AgentStudioPage() {
  const [coreAgents, setCoreAgents] = useState<CoreAgent[]>(fallbackCoreAgents);
  const [savedAgents, setSavedAgents] = useState<SavedAgent[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({ quant: 50, alpha: 30, strategist: 20 });
  const [name, setName] = useState("Vietnam Export Sentinel");
  const [objective, setObjective] = useState("Find high-conviction Vietnam and SEA export-linked opportunities while keeping drawdown risk visible.");
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [learning, setLearning] = useState<LearningDashboard | null>(null);
  const [compare, setCompare] = useState<CompareAgent[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState<string>("");

  const parentAgents = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, weight]) => weight > 0)
        .map(([agent_id, weight]) => ({ agent_id, weight })),
    [selected],
  );
  const totalWeight = parentAgents.reduce((sum, agent) => sum + agent.weight, 0);

  useEffect(() => {
    apiGet<{ agents: CoreAgent[] }>("/api/agent-studio/core-agents")
      .then((res) => setCoreAgents(res.agents))
      .catch(() => setCoreAgents(fallbackCoreAgents));
    refreshAgents();
    refreshCompare();
  }, []);

  useEffect(() => {
    if (!activeAgentId) return;
    apiGet<LearningDashboard>(`/api/agent-studio/agents/${activeAgentId}/learning`)
      .then(setLearning)
      .catch(() => setLearning(null));
  }, [activeAgentId]);

  async function refreshAgents() {
    try {
      const res = await apiGet<{ agents: SavedAgent[] }>("/api/agent-studio/agents");
      setSavedAgents(res.agents);
      if (!activeAgentId && res.agents[0]) setActiveAgentId(res.agents[0].id);
    } catch {
      setSavedAgents([]);
    }
  }

  async function refreshCompare() {
    try {
      const res = await apiGet<{ agents: CompareAgent[] }>("/api/agent-studio/compare");
      setCompare(res.agents);
    } catch {
      setCompare([]);
    }
  }

  async function saveAgent() {
    setSaving(true);
    try {
      const agent = await apiPost<SavedAgent>("/api/agent-studio/agents", {
        name,
        objective,
        parent_agents: parentAgents,
        config,
      });
      setSavedAgents((items) => [agent, ...items.filter((item) => item.id !== agent.id)]);
      setActiveAgentId(agent.id);
      await refreshCompare();
    } finally {
      setSaving(false);
    }
  }

  async function runAgent() {
    if (!activeAgentId) return;
    setRunning(true);
    try {
      const result = await apiPost<{ summary: string }>(`/api/agent-studio/agents/${activeAgentId}/run`, {
        positions: [],
        market_context: { source: "agent-studio-preview", region: config.region_focus },
      });
      setRunSummary(result.summary);
      const next = await apiGet<LearningDashboard>(`/api/agent-studio/agents/${activeAgentId}/learning`);
      setLearning(next);
      await refreshCompare();
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-app-bg px-4 py-6 text-navy sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-label text-primary">Agent Studio</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-navy">
              Build your personal quant team
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-readable">
              Combine core Swarm agents into a custom specialist, save the configuration,
              run it as an overlay, and watch its learning graph grow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveAgent}
              disabled={saving || parentAgents.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-dark px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save agent
            </button>
            <button
              onClick={runAgent}
              disabled={!activeAgentId || running}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/35 bg-white px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary-light/40 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run in Swarm
            </button>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-navy">Builder</h2>
                <p className="text-sm text-readable">Select parent agents and set their influence.</p>
              </div>
              <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold text-readable">
                {Math.round(totalWeight)} total weight
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {coreAgents.map((agent) => {
                const weight = selected[agent.id] ?? 0;
                return (
                  <article
                    key={agent.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      weight > 0 ? "border-primary/35 bg-primary-light/30" : "border-border bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-navy">{agent.name}</h3>
                        <p className="mt-1 text-xs font-medium text-readable">{agent.domain}</p>
                      </div>
                      <button
                        onClick={() =>
                          setSelected((state) => ({
                            ...state,
                            [agent.id]: weight > 0 ? 0 : 20,
                          }))
                        }
                        className="rounded-md border border-border bg-white px-2 py-1 text-xs font-semibold text-navy hover:border-primary/35"
                      >
                        {weight > 0 ? "Selected" : "Add"}
                      </button>
                    </div>
                    <p className="mt-2 min-h-10 text-sm leading-5 text-readable">{agent.description}</p>
                    <label className="mt-3 block">
                      <span className="mb-1 flex justify-between text-xs font-medium text-readable">
                        Weight <b className="text-navy">{weight}%</b>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={weight}
                        onChange={(event) =>
                          setSelected((state) => ({ ...state, [agent.id]: Number(event.target.value) }))
                        }
                        className="w-full accent-primary"
                      />
                    </label>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-bold text-navy">Configuration</h2>
              </div>
              <div className="space-y-4">
                <Field label="Agent name" value={name} onChange={setName} />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-readable">Objective</span>
                  <textarea
                    value={objective}
                    onChange={(event) => setObjective(event.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Time horizon" value={config.time_horizon} options={["1-3 months", "6-12 months", "2-5 years"]} onChange={(time_horizon) => setConfig((s) => ({ ...s, time_horizon }))} />
                  <Select label="Risk tolerance" value={config.risk_tolerance} options={["defensive", "balanced", "high-risk growth"]} onChange={(risk_tolerance) => setConfig((s) => ({ ...s, risk_tolerance }))} />
                  <Select label="Region focus" value={config.region_focus} options={["Southeast Asia", "Vietnam", "Singapore", "Global"]} onChange={(region_focus) => setConfig((s) => ({ ...s, region_focus }))} />
                  <Select label="Asset class" value={config.asset_class} options={["Equities", "ETFs", "Multi-asset", "Private markets"]} onChange={(asset_class) => setConfig((s) => ({ ...s, asset_class }))} />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-navy">Saved agents</h2>
                <Share2 className="h-4 w-4 text-readable" />
              </div>
              <div className="space-y-2">
                {savedAgents.length === 0 && (
                  <p className="rounded-md bg-surface-2 px-3 py-3 text-sm text-readable">
                    Save your first custom agent to reuse and compare outputs.
                  </p>
                )}
                {savedAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setActiveAgentId(agent.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      activeAgentId === agent.id
                        ? "border-primary/40 bg-primary-light/40"
                        : "border-border bg-white hover:border-primary/30"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-navy">{agent.name}</span>
                    <span className="line-clamp-2 text-xs text-readable">{agent.objective}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <LearningPanel learning={learning} runSummary={runSummary} />
          <ComparePanel agents={compare} />
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-readable">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
      />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-readable">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function LearningPanel({ learning, runSummary }: { learning: LearningDashboard | null; runSummary: string }) {
  const nodes = learning?.graph.nodes ?? [];
  const edges = learning?.graph.edges ?? [];
  const metrics = learning?.metrics;

  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Network className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-bold text-navy">Learning Dashboard</h2>
      </div>
      {runSummary && (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {runSummary}
        </p>
      )}
      {!learning ? (
        <p className="rounded-md bg-surface-2 px-3 py-8 text-center text-sm text-readable">
          Save or select an agent to load its graph.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-border bg-[#F8FAFC]">
            <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg border border-primary/30 bg-white text-primary shadow-sm">
              <BrainCircuit className="h-8 w-8" />
            </div>
            {nodes.slice(1).map((node, index) => {
              const angle = (index / Math.max(1, nodes.length - 1)) * Math.PI * 2;
              const x = 50 + Math.cos(angle) * 34;
              const y = 50 + Math.sin(angle) * 32;
              return (
                <div
                  key={node.id}
                  className="absolute max-w-[140px] rounded-md border border-border bg-white px-2 py-1 text-center text-xs font-semibold text-navy shadow-sm"
                  style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                >
                  {node.label}
                </div>
              );
            })}
            <p className="absolute bottom-3 left-3 rounded-md bg-white px-2 py-1 text-xs text-readable shadow-sm">
              {nodes.length} nodes · {edges.length} relationships
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={<Activity />} label="Events" value={metrics?.market_events_processed ?? 0} />
            <Metric icon={<GitBranch />} label="Graph size" value={metrics?.knowledge_graph_size ?? 0} />
            <Metric icon={<BrainCircuit />} label="Accuracy" value={`${Math.round((metrics?.accuracy_trend ?? 0) * 100)}%`} />
          </div>

          <div className="h-64 rounded-lg border border-border bg-white p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={learning.chart}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                <XAxis dataKey="run" tick={{ fill: "#64748B", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748B", fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="intelligence" stroke="#0E7490" fill="#CFFAFE" name="Intelligence" />
                <Area type="monotone" dataKey="signalQuality" stroke="#15803D" fill="#DCFCE7" name="Signal quality" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs leading-5 text-readable">
            Models used: {metrics?.models_used.join(", ") || "custom ensemble"}.
            Parameters learned: {metrics?.parameters_learned ?? 0}. Domains covered: {metrics?.domains_covered ?? 0}.
          </p>
        </div>
      )}
    </section>
  );
}

function ComparePanel({ agents }: { agents: CompareAgent[] }) {
  const chart = agents.slice(0, 10).map((agent) => ({
    name: agent.name.replace(" Agent", ""),
    intelligence: agent.intelligence_level,
    performance: agent.performance,
  }));
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BarChartIcon />
        <h2 className="text-lg font-bold text-navy">Comparative Agent Dashboard</h2>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 11 }} interval={0} />
            <YAxis tick={{ fill: "#64748B", fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="intelligence" fill="#0E7490" radius={[4, 4, 0, 0]} />
            <Bar dataKey="performance" fill="#16A34A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {agents.slice(0, 6).map((agent) => (
          <div key={agent.id} className="rounded-md border border-border bg-surface-2 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-navy">{agent.name}</p>
              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-readable">
                {agent.type}
              </span>
            </div>
            <p className="mt-1 text-xs text-readable">{agent.specialization}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactElement; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 h-5 w-5 text-primary">{icon}</div>
      <p className="text-xs font-medium text-readable">{label}</p>
      <p className="mt-1 text-lg font-bold text-navy">{value}</p>
    </div>
  );
}

function BarChartIcon() {
  return <BarChartIconInner className="h-4 w-4 text-primary" />;
}

function BarChartIconInner({ className }: { className: string }) {
  return <SlidersHorizontal className={className} />;
}
