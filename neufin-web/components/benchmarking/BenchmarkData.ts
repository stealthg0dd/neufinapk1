// Benchmarking data model — anonymized "Market Average" / "Industry Peers" comparison
// All values are realistic proxies; never name specific competitors.

export interface CapabilityScore {
  dimension: string;
  neufin: number;
  market_average: number;
  description: string;
}

export interface GrowthPoint {
  quarter: string;
  accuracy: number;
  agent_intelligence: number;
  speed: number;
  coverage: number;
}

export const CAPABILITY_SCORES: CapabilityScore[] = [
  {
    dimension: "Analysis Depth",
    neufin: 94,
    market_average: 58,
    description: "7-agent swarm vs single-model output from traditional tools",
  },
  {
    dimension: "Time to Insight",
    neufin: 91,
    market_average: 42,
    description: "Sub-60s IC briefing vs 10–30 min for legacy platforms",
  },
  {
    dimension: "Personalization",
    neufin: 88,
    market_average: 51,
    description: "Behavioral DNA + investor profile vs generic AI tools",
  },
  {
    dimension: "Behavioral Intelligence",
    neufin: 96,
    market_average: 34,
    description: "Proprietary DNA scoring unavailable in industry peers",
  },
  {
    dimension: "Real-time Capability",
    neufin: 82,
    market_average: 63,
    description: "Live data waterfall with SEA + US coverage",
  },
  {
    dimension: "Institutional Readiness",
    neufin: 89,
    market_average: 55,
    description: "IC-grade memos, white-label PDF, advisor portal",
  },
];

export const GROWTH_TIMELINE: GrowthPoint[] = [
  { quarter: "Q1 2024", accuracy: 71, agent_intelligence: 60, speed: 65, coverage: 55 },
  { quarter: "Q2 2024", accuracy: 76, agent_intelligence: 68, speed: 72, coverage: 62 },
  { quarter: "Q3 2024", accuracy: 81, agent_intelligence: 75, speed: 78, coverage: 70 },
  { quarter: "Q4 2024", accuracy: 85, agent_intelligence: 82, speed: 83, coverage: 78 },
  { quarter: "Q1 2025", accuracy: 88, agent_intelligence: 87, speed: 87, coverage: 83 },
  { quarter: "Q2 2025", accuracy: 91, agent_intelligence: 91, speed: 90, coverage: 88 },
  { quarter: "Q3 2025", accuracy: 93, agent_intelligence: 94, speed: 92, coverage: 91 },
  { quarter: "Q4 2025", accuracy: 95, agent_intelligence: 96, speed: 94, coverage: 94 },
];

// Key stat cards for the "NeuFin vs Market" summary panel
export interface BenchmarkStat {
  label: string;
  neufin: string;
  market: string;
  delta: string;
  positive: boolean;
}

export const BENCHMARK_STATS: BenchmarkStat[] = [
  { label: "DNA Score Accuracy",    neufin: "94/100",    market: "Avg 61/100",  delta: "+54%",   positive: true },
  { label: "IC Report Time",        neufin: "< 60s",     market: "10–30 min",   delta: "20× faster", positive: true },
  { label: "Market Coverage",       neufin: "15+ markets", market: "US only",   delta: "+SEA",   positive: true },
  { label: "Agent Intelligence",    neufin: "7 agents",  market: "1 model",     delta: "7×",     positive: true },
];
