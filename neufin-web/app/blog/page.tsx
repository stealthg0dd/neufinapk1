import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog — Behavioral Finance Insights for Singapore Investors",
  description:
    "Research and insights on behavioral finance, cognitive bias detection, and investment psychology for Singapore SMEs, CFOs, and wealth managers. By NeuFin.",
  openGraph: {
    title: "NeuFin Blog — Behavioral Finance for Singapore Investors",
    description:
      "Practical behavioral finance research for Singapore SMEs and investors. Cognitive bias detection, MAS compliance, portfolio analysis guides.",
  },
};

const posts = [
  {
    slug: "behavioral-finance-sea-sme",
    title:
      "Behavioral Finance for SEA SMEs: The 6 Biases Costing Singapore Businesses Money",
    excerpt:
      "Singapore SMEs lose an estimated 12–18% in annual portfolio returns due to six cognitive biases. Learn which biases are most common and how to detect them.",
    date: "2025-01-15",
    readTime: "8 min read",
    tags: ["Behavioral Finance", "Singapore", "SME"],
  },
  {
    slug: "disposition-effect-singapore",
    title:
      "The Disposition Effect Is Costing Singapore Investors — Here's the Data",
    excerpt:
      "Singapore investors hold losing positions 2.3× longer than winning ones. NeuFin analysis explains what this costs and how to break the pattern.",
    date: "2025-01-22",
    readTime: "7 min read",
    tags: ["Disposition Effect", "Singapore", "Portfolio Analysis"],
  },
  {
    slug: "mas-compliant-fintech",
    title:
      "MAS-Compliant Financial Intelligence Tools: What Singapore CFOs Need to Know",
    excerpt:
      "MAS digital advisory guidelines require robust data governance. This guide explains what CFOs must verify before adopting any fintech intelligence tool.",
    date: "2025-02-05",
    readTime: "6 min read",
    tags: ["MAS Compliance", "CFO", "Singapore Fintech"],
  },
  {
    slug: "plaid-portfolio-analysis",
    title:
      "How to Analyse Your Investment Portfolio for Cognitive Biases (Singapore Guide)",
    excerpt:
      "A step-by-step guide to connecting your Singapore brokerage accounts via Plaid and interpreting your behavioral bias scores.",
    date: "2025-02-12",
    readTime: "6 min read",
    tags: ["Portfolio Analysis", "Plaid", "How-To"],
  },
  {
    slug: "sea-wealth-management-ai",
    title: "How AI Is Changing Wealth Management in Southeast Asia",
    excerpt:
      "AI-powered behavioral analysis is reaching SEA wealth managers. Here's where the market is heading, what regulators are saying, and how firms are adapting.",
    date: "2025-02-20",
    readTime: "9 min read",
    tags: ["AI", "SEA Wealth Management", "Future of Finance"],
  },
];

export default function BlogIndex() {
  return (
    <div>
      {/* Header */}
      <div className="mb-12">
        <span className="badge bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-4">
          Behavioral Finance Research
        </span>
        <h1 className="text-3xl font-extrabold mb-3">NeuFin Blog</h1>
        <p className="text-shell-muted leading-relaxed max-w-xl">
          Research and practical guides on behavioral finance for Singapore
          SMEs, CFOs, wealth managers, and investors across Southeast Asia. By{" "}
          <strong className="text-shell-fg/90">NeuFin</strong>, founded 2025,
          Singapore.
        </p>
      </div>

      {/* Posts */}
      <div className="space-y-8">
        {posts.map((post) => (
          <article key={post.slug} className="group">
            <Link href={`/blog/${post.slug}`} className="block">
              <div className="card hover:border-primary/30 transition-colors space-y-3">
                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="badge bg-shell-raised text-shell-muted text-sm px-2 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Title */}
                <h2 className="text-lg font-bold text-shell-fg group-hover:text-primary transition-colors leading-snug">
                  {post.title}
                </h2>

                {/* Excerpt */}
                <p className="text-sm text-shell-muted leading-relaxed">
                  {post.excerpt}
                </p>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-shell-subtle pt-1">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-SG", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  <span>·</span>
                  <span>{post.readTime}</span>
                  <span className="ml-auto text-primary group-hover:text-primary transition-colors">
                    Read →
                  </span>
                </div>
              </div>
            </Link>
          </article>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-16 rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center">
        <h2 className="text-xl font-bold mb-2">
          See Your Own Behavioral Biases
        </h2>
        <p className="text-shell-muted text-sm mb-5">
          Everything you read about here — NeuFin detects it in your portfolio
          in under 10 seconds.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/upload" className="btn-primary py-2.5 px-6">
            Get My DNA Score — Free
          </Link>
          <Link href="/features" className="btn-outline py-2.5 px-6">
            See How It Works
          </Link>
        </div>
      </div>
    </div>
  );
}
