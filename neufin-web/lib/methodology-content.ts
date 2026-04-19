/**
 * Structured methodology copy — powers Methodology dialog and future docs.
 */

export const METHODOLOGY_SECTIONS = [
  {
    id: "agents",
    title: "How the seven agents work",
    body: [
      "Each agent has a narrow mandate: macro regime, portfolio strategy, quant diagnostics, tax architecture, independent risk, alpha discovery, and IC synthesis.",
      "Agents run in parallel where safe; synthesis waits for upstream signals so the final memo reflects a coherent committee view, not seven disconnected opinions.",
    ],
  },
  {
    id: "inputs",
    title: "What inputs are used",
    body: [
      "Portfolio: your uploaded positions (ticker, weight or quantity, optional cost basis where provided).",
      "Macro: public market and macro series (e.g. rates, volatility, inflation proxies) to classify regime — not your brokerage credentials.",
      "Optional: jurisdiction and tax hints you supply; we do not require live broker integration.",
    ],
  },
  {
    id: "confidence",
    title: "What confidence means",
    body: [
      "Regime and macro confidence scores reflect model agreement and signal stability over recent windows — not a guarantee of market outcomes.",
      "High confidence means the classification is stable across inputs; it is not investment advice or a probability of profit.",
    ],
  },
  {
    id: "dna-score",
    title: "What the DNA score does — and does not — mean",
    body: [
      "DNA summarizes behavioral and structural traits of the book (concentration, bias patterns, factor tilts) as a diagnostic score.",
      "It is not a performance forecast, credit rating, or suitability determination. Committees use it alongside judgment and policy.",
    ],
  },
  {
    id: "benchmarks",
    title: "Benchmark logic",
    body: [
      "Where we show relative risk or beta, we anchor to broad, published indices (e.g. large-cap equity) unless you specify otherwise.",
      "Currency: positions are interpreted in the reporting currency of your file; FX translation uses spot assumptions documented in exports.",
    ],
  },
  {
    id: "regime",
    title: "Regime logic",
    body: [
      "Regime labels combine macro features into a small set of states (e.g. risk-on, risk-off, stagflation) with confidence.",
      "The system prefers conservative classification when signals conflict — surfaced explicitly in the briefing.",
    ],
  },
  {
    id: "bias",
    title: "Bias detection logic",
    body: [
      "Behavioral flags compare your exposures and trading patterns to documented bias archetypes (e.g. home bias, loss aversion).",
      "Flags are indicative, not clinical; they inform discussion, not labels about individuals.",
    ],
  },
] as const;
