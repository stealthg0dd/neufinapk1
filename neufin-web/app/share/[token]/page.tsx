import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import ShareCard from "./ShareCard";

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface DNAShare {
  id: string;
  dna_score: number;
  investor_type: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  share_token: string;
  view_count: number;
  created_at: string;
}

async function getDNAData(token: string): Promise<DNAShare | null> {
  try {
    const res = await fetch(`${API}/api/dna/share/${token}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getDNAData(token);

  if (!data) {
    return {
      title: "Result Not Found | Neufin",
      description: "This DNA share link is invalid or has expired.",
    };
  }

  const title = `My Portfolio DNA Score is ${data.dna_score} | Neufin`;
  const description = `I'm a ${data.investor_type}. Check out my portfolio analysis and get your own DNA score.`;
  const url = `https://neufin.vercel.app/share/${data.share_token}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "Neufin",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@neufin",
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getDNAData(token);

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col bg-shell-deep">
        <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-4 sm:px-6">
            <BrandLogo variant="shell-inverted" href="/" priority />
          </div>
        </nav>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center sm:px-6">
          <p className="text-5xl">🔍</p>
          <h1 className="text-2xl font-bold text-white">Result Not Found</h1>
          <p className="text-shell-muted text-sm max-w-xs">
            This link may have expired or never existed. Create your own free
            DNA score below.
          </p>
          <Link href="/upload" className="btn-primary mt-2">
            Analyze Your Portfolio →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-shell-deep">
      {/* Nav */}
      <nav className="border-b border-shell-border/60 bg-shell-deep/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandLogo variant="shell-inverted" href="/" priority />
          <Link href="/upload" className="btn-primary shrink-0 py-2 text-sm">
            Get My Score →
          </Link>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 py-8 sm:px-6 sm:py-10">
        <ShareCard data={data} />
      </main>
    </div>
  );
}
