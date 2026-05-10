import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import { CheckCircle, X } from "lucide-react";

export const metadata = {
  title: "About NeuFin — The Team Behind Agentic Portfolio Intelligence",
  description:
    "Meet the founders and team behind NeuFin. Built by AI, cybersecurity, and digital banking experts to democratize institutional-grade investment intelligence.",
};

const founders = [
  {
    name: "Varun Srivastava",
    title: "Founder & CEO",
    image: "/founders/varun.jpg",
    bio: "Cyber Defense and AI leader with global experience in threat intelligence and risk systems. Previously led teams countering nation-state cyberattacks. Built NeuFin to bring hedge fund-level intelligence to every investor.",
    tags: [
      "AI & Machine Learning",
      "Cybersecurity",
      "Behavioral Finance",
      "Risk Systems",
    ],
  },
  {
    name: "Ha Pham",
    title: "Co-Founder & Chief Strategy Officer",
    image: "/founders/ha.jpg",
    bio: "15+ years in digital banking, scaling Vietnam International Bank to 93% digital transactions and 60% adoption. Recognized by The Banker and The Asset. Drives NeuFin's AI-driven personalization and platform strategy.",
    tags: [
      "Digital Banking",
      "Platform Strategy",
      "AI Personalization",
      "SEA Markets",
    ],
  },
  {
    name: "Ray Nee",
    title: "Co-Founder & Chief of Hustle",
    image: "/founders/ray.jpg",
    bio: "Operations and program leader across Singapore, Japan, and New Zealand. Managed multi-million-dollar upskilling programs and global brand campaigns. Focuses on human-centered technology and operational excellence.",
    tags: ["Operations", "Partnerships", "Singapore", "Human-Centered Tech"],
  },
] as const;

const markets = [
  {
    flag: "🇸🇬",
    name: "Singapore",
    status: "ACTIVE",
    cls: "bg-positive/10 text-positive",
  },
  {
    flag: "🇲🇾",
    name: "Malaysia",
    status: "ACTIVE",
    cls: "bg-positive/10 text-positive",
  },
  {
    flag: "🇦🇪",
    name: "UAE",
    status: "2025",
    cls: "bg-warning/10 text-warning",
  },
  {
    flag: "🇪🇺",
    name: "EU/Estonia",
    status: "ACTIVE",
    cls: "bg-positive/10 text-positive",
  },
  {
    flag: "🇺🇸",
    name: "USA",
    status: "2025",
    cls: "bg-warning/10 text-warning",
  },
  {
    flag: "🇹🇭",
    name: "Thailand",
    status: "2026",
    cls: "bg-muted text-muted-foreground",
  },
  {
    flag: "🇻🇳",
    name: "Vietnam",
    status: "2026",
    cls: "bg-muted text-muted-foreground",
  },
] as const;

function hasFounderImage(webPath: string): boolean {
  const local = path.join(process.cwd(), "public", webPath.replace(/^\//, ""));
  // webPath is from static founder list, not user input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.existsSync(local);
}

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="bg-background py-section-hero text-center">
        <div className="mx-auto max-w-5xl px-6">
          <p className="font-mono text-sm uppercase tracking-widest text-primary">
            ABOUT NEUFIN
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
            <span className="block">Built by people who&apos;ve seen</span>
            <span className="block">what broken finance costs.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground">
            We founded NeuFin because institutional-grade intelligence
            shouldn&apos;t require expensive data terminals. Every investor
            deserves the same analytical edge as a hedge fund.
          </p>
          <p className="mt-6 font-mono text-sm uppercase tracking-wider text-muted-foreground">
            Founded 2025 · Estonia HQ · 9-person team · 5 launch markets
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-12 px-6 py-section md:grid-cols-2">
        <div>
          <h3 className="text-2xl font-bold text-foreground">
            Traditional platforms describe markets.
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We built NeuFin because every existing tool tells you WHAT happened
            — after it happened. No platform combines real-time sentiment,
            behavioral bias detection, and predictive intelligence into one
            actionable system.
          </p>
          <div className="mt-6 space-y-3">
            {[
              "Information overload with no clarity on what matters",
              "Behavioral biases costing 2-4% annually — invisible and unmeasured",
              "Institutional-grade analytics priced out of reach for most investors",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <X className="mt-0.5 h-4 w-4 shrink-0 text-risk" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-foreground">
            NeuFin predicts what matters.
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Seven specialized AI agents run simultaneously on your portfolio,
            each an expert in its domain — from macro regime to tax architecture
            to behavioral bias detection.
          </p>
          <div className="mt-6 space-y-3">
            {[
              "Real-time agentic intelligence — not dashboards, decisions",
              "47 behavioral biases quantified in dollar impact",
              "IC-grade output accessible from $0 for the first analysis",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/40 bg-surface/30 py-section">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 text-center">
            <p className="font-mono text-sm uppercase tracking-widest text-primary">
              MEET THE FOUNDERS
            </p>
            <h2 className="mt-2 text-3xl font-bold text-foreground">
              Experienced across AI, banking, and operations
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {founders.map((f) => {
              const hasImage = hasFounderImage(f.image);
              return (
                <article
                  key={f.name}
                  className="rounded-2xl border border-border bg-surface p-6 text-center"
                >
                  <div className="relative mx-auto mb-4 h-24 w-24 overflow-hidden rounded-full border-2 border-primary/30">
                    {hasImage ? (
                      <Image
                        src={f.image}
                        alt={f.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-primary/20 font-mono text-2xl font-bold text-primary">
                        {initials(f.name)}
                      </div>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-foreground">
                    {f.name}
                  </h3>
                  <p className="mb-3 mt-0.5 font-mono text-sm uppercase tracking-widest text-primary">
                    {f.title}
                  </p>
                  <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                    {f.bio}
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {f.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-surface-2 px-2 py-0.5 font-mono text-sm text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-section">
        <h2 className="text-3xl font-bold text-foreground">
          A global company, built for global markets
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          NeuFin is registered and operating across multiple jurisdictions to
          serve investors wherever they are.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="mb-3 font-mono text-sm uppercase tracking-wider text-muted-foreground">
              REGISTERED ENTITIES
            </p>
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-foreground">🇪🇪 Neufin OÜ</p>
                <p className="text-sm text-muted-foreground">
                  Estonia, EU — Headquarters
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground">🇺🇸 Neufin Inc.</p>
                <p className="text-sm text-muted-foreground">
                  United States — Registered Office
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              <a
                href="mailto:info@neufin.ai"
                className="text-primary hover:underline"
              >
                info@neufin.ai
              </a>{" "}
              · www.neufin.ai
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5">
            <p className="mb-3 font-mono text-sm uppercase tracking-wider text-muted-foreground">
              ACTIVE & UPCOMING MARKETS
            </p>
            <div className="space-y-2.5">
              {markets.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-foreground">
                    {m.flag} {m.name}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-sm ${m.cls}`}
                  >
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface/20 py-section">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-10 text-center text-3xl font-bold text-foreground">
            How we build
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "AI-First",
                text: "We believe AI eliminates human cognitive bias and democratizes institutional intelligence.",
              },
              {
                title: "Privacy-First",
                text: "Your portfolio data is encrypted and never sold. Military-grade protection, always.",
              },
              {
                title: "Measurable Results",
                text: "Every recommendation is quantified. Alpha improvement is tracked, not claimed.",
              },
              {
                title: "Compliance-Ready",
                text: "Built for regulated markets from day one. GDPR, MAS, SOC 2 aligned.",
              },
            ].map((v) => (
              <div
                key={v.title}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <p className="font-semibold text-foreground">{v.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {v.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
