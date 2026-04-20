import type { Metadata } from "next";
import Link from "next/link";
import { ResearchArticle, type ResearchSignal } from "@/components/research/ResearchArticle";
import { normalizeResearchContent } from "@/lib/research-normalizer";

type RelatedNote = {
  id: string;
  slug: string;
  title: string;
  note_type: string;
};

type BlogNote = {
  id: string;
  slug: string;
  title: string;
  executive_summary: string;
  content: string;
  note_type: string;
  regime?: string | null;
  confidence_score?: number | null;
  created_at: string;
  read_time_minutes: number;
  asset_tickers: string[];
  meta_description: string;
  related_notes: RelatedNote[];
  macro_signal_count?: number;
};

function resolveBase() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.startsWith("http") ? raw : `https://${raw}`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

async function fetchResearchNote(slug: string): Promise<BlogNote | null> {
  try {
    const base = resolveBase().replace(/\/$/, "");
    const res = await fetch(
      `${base}/api/research/blog/${encodeURIComponent(slug)}`,
      {
        next: { revalidate: 300 },
        cache: "force-cache",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as BlogNote;
  } catch {
    return null;
  }
}

function confidencePct(score: number | null | undefined) {
  if (score == null || Number.isNaN(score)) return undefined;
  return Math.round(score <= 1 ? score * 100 : score);
}

function deriveSignals(note: BlogNote, markdown: string): ResearchSignal[] {
  const normalized = normalizeResearchContent(note.content, note.executive_summary);
  const findings = normalized.structured?.key_findings ?? [];
  if (findings.length > 0) {
    return findings.slice(0, 3).map((finding) => ({
      label: finding.finding,
      detail: finding.data_support ?? finding.implication,
    }));
  }

  const headingSignals = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{2,3}\s+/.test(line))
    .map((line) => line.replace(/^#{2,3}\s+/, ""))
    .slice(0, 3)
    .map((label) => ({ label }));
  if (headingSignals.length > 0) return headingSignals;

  return note.executive_summary
    .split(".")
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((label) => ({ label }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const note = await fetchResearchNote(slug);
  const base = resolveBase().replace(/\/$/, "");

  if (!note) {
    return {
      title: "NeuFin Research",
      alternates: { canonical: `${base}/research/${encodeURIComponent(slug)}` },
    };
  }

  const canonical = `${base}/research/${encodeURIComponent(note.slug || slug)}`;
  const description = note.meta_description || note.executive_summary || note.title;
  const ogImage = `${base}/graphics/research-og.png`;

  return {
    title: `${note.title} | NeuFin Research`,
    description,
    alternates: { canonical },
    openGraph: {
      title: note.title,
      description,
      url: canonical,
      siteName: "NeuFin",
      type: "article",
      publishedTime: note.created_at,
      authors: ["NeuFin AI Research Team"],
      tags: note.asset_tickers,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "NeuFin Research",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: note.title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ResearchArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const note = await fetchResearchNote(slug);

  if (!note) {
    return (
      <main className="min-h-screen bg-background px-6 py-section-hero text-foreground">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/research"
            className="text-sm font-medium text-primary hover:text-primary-dark"
          >
            Research
          </Link>
          <p className="mt-6 text-muted-foreground">Research note not found.</p>
        </div>
      </main>
    );
  }

  const report = normalizeResearchContent(note.content, note.executive_summary);
  const signals = deriveSignals(note, report.markdown);
  const confidence = confidencePct(note.confidence_score);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <div className="text-sm text-muted-foreground">
          <Link href="/research" className="hover:text-foreground">
            Research
          </Link>{" "}
          <span aria-hidden="true">/</span>{" "}
          <span>{note.note_type.replace(/_/g, " ")}</span>
        </div>
      </div>
      <ResearchArticle
        title={note.title}
        summary={note.executive_summary}
        markdown={report.markdown || note.executive_summary}
        regime={note.regime}
        confidenceScore={confidence}
        publishedAt={note.created_at}
        signals={signals}
        assetTickers={note.asset_tickers}
      />
    </main>
  );
}
