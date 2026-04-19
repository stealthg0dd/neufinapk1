export type ObjectionItem = {
  q: string;
  a: string;
};

export const OBJECTION_FAQ: ObjectionItem[] = [
  {
    q: "How is my portfolio data handled?",
    a: "Uploads are used to generate your analysis and stored under access controls aligned with our privacy policy. We do not sell portfolio data. EU residency options and DPA terms are available for enterprise customers.",
  },
  {
    q: "How long does analysis take?",
    a: "Most Swarm IC runs complete in about a minute for typical portfolios; very large files or peak load may add latency. You always see progress in-product.",
  },
  {
    q: "What file formats are accepted?",
    a: "CSV is the primary path for retail and advisor uploads; column templates are documented in-app. Enterprise integrations can use API and approved custodian formats on request.",
  },
  {
    q: "Do I need a live broker connection?",
    a: "No. NeuFin works from positions you export or upload. Live connectivity is optional for future roadmap integrations and never required for core intelligence.",
  },
  {
    q: "Is the output advisor-ready?",
    a: "Outputs are structured as IC-style briefings and PDFs suitable for professional review. You remain responsible for suitability, disclosures, and regulatory obligations in your jurisdiction.",
  },
  {
    q: "How are benchmarks, currencies, and markets handled?",
    a: "Benchmarks default to widely used indices unless configured; reporting currency follows your file with transparent FX assumptions in exports. Market coverage follows instrument mapping in our data layer — illiquid or OTC names may be flagged.",
  },
];
