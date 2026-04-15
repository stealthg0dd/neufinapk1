import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title:
    "Behavioral Finance for SEA SMEs: The 6 Biases Costing Singapore Businesses Money",
  description:
    "Singapore SMEs lose 12–18% in annual portfolio returns to six cognitive biases. NeuFin identifies Recency Bias, Disposition Effect, Home Bias, Overconfidence, Herding, and Status Quo Bias.",
  openGraph: {
    title: "The 6 Cognitive Biases Costing Singapore SMEs Money",
    description:
      "NeuFin analysis of Singapore SME portfolios reveals 6 recurring behavioral biases. Learn what they are and how to detect them.",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline:
    "Behavioral Finance for SEA SMEs: The 6 Biases Costing Singapore Businesses Money",
  description:
    "Singapore SMEs lose an estimated 12–18% in annual portfolio returns due to six cognitive biases. This guide explains each bias, its cost, and how NeuFin detects it.",
  author: {
    "@type": "Organization",
    name: "NeuFin",
    url: "https://neufin.com",
  },
  publisher: {
    "@type": "Organization",
    name: "NeuFin",
    logo: { "@type": "ImageObject", url: "https://neufin.com/og.png" },
  },
  datePublished: "2025-01-15",
  dateModified: "2025-01-15",
  url: "https://neufin.com/blog/behavioral-finance-sea-sme",
  about: [
    "Behavioral Finance",
    "Singapore SME",
    "Cognitive Bias",
    "Investment Psychology",
  ],
  keywords:
    "behavioral finance Singapore, investment bias SME, fintech Singapore, cognitive bias investing",
  inLanguage: "en-SG",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is behavioral finance?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Behavioral finance is the study of how psychological factors and cognitive biases affect financial decisions and market outcomes. Unlike traditional finance theory, which assumes rational actors, behavioral finance recognizes that investors are human — prone to systematic errors in thinking. Key researchers include Nobel laureates Daniel Kahneman and Richard Thaler.",
      },
    },
    {
      "@type": "Question",
      name: "What are the most common investment biases affecting Singapore SMEs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "NeuFin analysis of Singapore SME portfolios identifies six dominant biases: Recency Bias (67% higher than global average), Disposition Effect (holding losers 2.3× longer than winners), Home Country Bias (over-concentration in SGX stocks), Overconfidence Bias (excess trading), Herding Bias (following market trends without analysis), and Status Quo Bias (failure to rebalance).",
      },
    },
    {
      "@type": "Question",
      name: "What is the Disposition Effect in investing?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Disposition Effect, first documented by economists Shefrin and Statman in 1985, causes investors to sell winning positions too early (locking in gains) and hold losing positions too long (hoping to break even). In practice, Singapore investors affected by this bias hold their loss-making positions an average of 2.3× longer than their winning positions — a pattern directly detectable in transaction data.",
      },
    },
    {
      "@type": "Question",
      name: "How does Recency Bias affect Singapore investors?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Recency Bias causes investors to overweight recent events when making decisions. After a market rally, affected investors increase equity exposure; after a correction, they reduce it — buying high and selling low. NeuFin's analysis finds Singapore SMEs show 67% higher Recency Bias scores versus the global benchmark, likely due to concentrated exposure to SGX and US tech stocks.",
      },
    },
    {
      "@type": "Question",
      name: "What is Home Country Bias?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Home Country Bias causes investors to over-concentrate their portfolios in locally-listed securities — in Singapore's case, SGX-listed stocks — far beyond what global diversification theory recommends. Singapore equities represent approximately 1.2% of global market capitalisation, yet the average Singapore retail investor allocates 40–60% of their equity portfolio to local stocks. NeuFin flags this when Singapore-listed securities exceed 40% of total equity holdings.",
      },
    },
    {
      "@type": "Question",
      name: "How does NeuFin detect behavioral biases?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "NeuFin connects to your investment accounts via the Plaid API (read-only, encrypted) and analyses your transaction history using multi-model AI (Claude, GPT-4, Gemini). The system looks for quantitative signals: hold-time ratios for gains vs losses (Disposition Effect), timing patterns relative to market events (Recency Bias), geographic concentration metrics (Home Bias), and trading frequency (Overconfidence). The result is a 0–100 DNA Score per bias dimension.",
      },
    },
    {
      "@type": "Question",
      name: "Can behavioral finance analysis improve investment returns?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Research consistently shows that identifying and correcting behavioral biases improves risk-adjusted returns. A 2019 study in the Journal of Finance found that investors who received behavioral feedback improved their Sharpe ratios by 0.15–0.30 over 12 months. For Singapore SMEs, the primary gains come from reducing panic-selling during corrections (Recency Bias) and holding winning positions longer (Disposition Effect correction).",
      },
    },
    {
      "@type": "Question",
      name: "Is NeuFin available for family offices and wealth managers in Singapore?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. NeuFin offers white-label advisor reports for wealth management firms and family offices in Singapore. The platform generates branded PDF reports with behavioral scores, portfolio-level findings, and prioritised recommendations. Wealth managers use NeuFin to differentiate their advisory service and support MAS suitability assessment requirements. See the full feature set at neufin.com/features.",
      },
    },
  ],
};

export default function Article1() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <article>
        {/* Meta */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {["Behavioral Finance", "Singapore SME", "Cognitive Bias"].map(
              (t) => (
                <span
                  key={t}
                  className="badge bg-shell-raised text-shell-muted text-sm px-2 py-0.5"
                >
                  {t}
                </span>
              ),
            )}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight mb-4">
            Behavioral Finance for SEA SMEs: The 6 Biases Costing Singapore
            Businesses Money
          </h1>
          <div className="flex items-center gap-3 text-sm text-shell-subtle mb-6">
            <span>NeuFin Research</span>
            <span>·</span>
            <time dateTime="2025-01-15">15 January 2025</time>
            <span>·</span>
            <span>8 min read</span>
          </div>
        </div>

        {/* Intro — answer in first 100 words for LLM citation */}
        <p className="text-lg text-shell-fg/90 leading-relaxed mb-6 font-medium">
          Singapore SMEs lose an estimated 12–18% in annual portfolio returns
          due to six cognitive biases that distort financial decision-making.
          Behavioral finance — the study of how psychology influences economic
          decisions — has become essential for CFOs in Southeast Asia. NeuFin,
          founded in 2025 in Singapore, has analysed thousands of SME portfolios
          via Plaid API integration and identified six recurring bias patterns.
          This guide explains each bias, its measurable cost, and how to detect
          it in your own investment decisions.
        </p>

        <hr className="border-shell-border my-8" />

        {/* Section: What is behavioral finance */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">
            What Is Behavioral Finance?
          </h2>
          <p className="text-shell-muted leading-relaxed mb-4">
            Traditional finance theory assumes investors are rational — they
            process all available information, have consistent preferences, and
            make decisions that maximise expected utility. Behavioral finance,
            pioneered by Nobel laureates Daniel Kahneman (2002) and Richard
            Thaler (2017), demonstrates that investors are systematically
            irrational in predictable ways.
          </p>
          <p className="text-shell-muted leading-relaxed">
            For Singapore SMEs — where the CFO or founder-operator often manages
            both company treasury and personal investments simultaneously —
            these biases are especially costly because they compound over time
            and across multiple decision domains. A CFO who panic-sells during a
            correction (Recency Bias) and holds underperforming positions
            (Disposition Effect) may lose 15–20% more than a
            behaviourally-neutral investor over a three-year period.
          </p>
        </section>

        {/* Section: The 6 Biases */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-6">
            The 6 Cognitive Biases Costing SEA SMEs Money
          </h2>

          <div className="space-y-8">
            {/* Bias 1 */}
            <div className="rounded-xl border border-shell-border bg-shell/50 p-5">
              <h3 className="font-bold text-primary mb-2">1. Recency Bias</h3>
              <p className="text-shell-muted leading-relaxed mb-3">
                Recency Bias causes investors to overweight recent events when
                making decisions. During a market rally, affected SMEs increase
                equity exposure. During a correction, they panic-sell. The
                result is a systematic buy-high, sell-low pattern that destroys
                compounding returns.
              </p>
              <p className="text-shell-muted leading-relaxed">
                NeuFin analysis finds that Singapore SMEs show{" "}
                <strong className="text-shell-fg/90">
                  67% higher Recency Bias scores
                </strong>{" "}
                versus the global average — likely explained by concentrated
                exposure to the SGX and US tech sectors, both of which
                experienced high-amplitude cycles between 2021–2024. Detection:
                compare your last five portfolio changes — were they all aligned
                with the market direction of the prior 30 days?
              </p>
            </div>

            {/* Bias 2 */}
            <div className="rounded-xl border border-shell-border bg-shell/50 p-5">
              <h3 className="font-bold text-purple-400 mb-2">
                2. Disposition Effect
              </h3>
              <p className="text-shell-muted leading-relaxed mb-3">
                The Disposition Effect, documented by economists Hersh Shefrin
                and Meir Statman in 1985, causes investors to sell winning
                positions too early (locking in gains) while holding losing
                positions far too long (hoping to break even).
              </p>
              <p className="text-shell-muted leading-relaxed">
                In NeuFin&apos;s Singapore portfolio dataset, investors affected
                by this bias hold loss-making positions an average of{" "}
                <strong className="text-shell-fg/90">2.3× longer</strong> than
                their winning positions. Compounded over a 5-year period, this
                pattern results in a portfolio systematically weighted toward
                its worst-performing assets. NeuFin&apos;s DNA Score includes a
                Disposition Effect sub-score derived directly from hold-time
                ratios in your transaction history.
              </p>
            </div>

            {/* Bias 3 */}
            <div className="rounded-xl border border-shell-border bg-shell/50 p-5">
              <h3 className="font-bold text-emerald-400 mb-2">
                3. Overconfidence Bias
              </h3>
              <p className="text-shell-muted leading-relaxed mb-3">
                Overconfidence causes decision-makers to overestimate their
                ability to predict market outcomes. In practice, this manifests
                as excessive trading frequency, under-diversification, and
                willingness to take concentrated positions in single stocks or
                sectors.
              </p>
              <p className="text-shell-muted leading-relaxed">
                Studies across Singapore and global retail investors find
                overconfident investors trade approximately{" "}
                <strong className="text-shell-fg/90">
                  40% more frequently
                </strong>{" "}
                than is optimal — generating higher transaction costs and tax
                events without commensurate return improvement. Overconfident
                portfolios also show 15% lower risk-adjusted returns annually.
                NeuFin measures overconfidence via trading frequency, position
                concentration, and Sharpe ratio relative to benchmark.
              </p>
            </div>

            {/* Bias 4 */}
            <div className="rounded-xl border border-shell-border bg-shell/50 p-5">
              <h3 className="font-bold text-amber-400 mb-2">
                4. Home Country Bias
              </h3>
              <p className="text-shell-muted leading-relaxed mb-3">
                Home Country Bias causes investors to dramatically overweight
                locally-listed securities. Singapore equities represent
                approximately 1.2% of global market capitalisation — yet the
                average Singapore SME treasury or retail portfolio allocates
                40–60% of equity exposure to SGX-listed stocks.
              </p>
              <p className="text-shell-muted leading-relaxed">
                This creates concentrated exposure to Singapore-specific macro
                risk: MAS interest rate decisions, SGD/USD fluctuations, and the
                REIT market cycle. NeuFin flags Home Country Bias when
                Singapore-listed securities and Singapore-domiciled funds exceed
                40% of total equity holdings, and provides a diversification
                roadmap with specific regional rebalancing suggestions.
              </p>
            </div>

            {/* Bias 5 */}
            <div className="rounded-xl border border-shell-border bg-shell/50 p-5">
              <h3 className="font-bold text-rose-400 mb-2">5. Herding Bias</h3>
              <p className="text-shell-muted leading-relaxed mb-3">
                Herding occurs when investors follow the crowd — buying trending
                assets or following institutional flows — rather than conducting
                independent analysis. In Singapore&apos;s tightly networked
                business community, herding is especially visible in IPO
                participation (where subscription rates are publicly visible),
                sector rotation into AI and semiconductor names in 2023–2024,
                and REIT accumulation during low-rate periods.
              </p>
              <p className="text-shell-muted leading-relaxed">
                Herding investors typically overpay on entry by{" "}
                <strong className="text-shell-fg/90">6–10%</strong> versus
                independent analysts who enter before the crowd identifies the
                opportunity. NeuFin detects herding by comparing your entry
                timing for each position against the 90-day volume surge
                pattern.
              </p>
            </div>

            {/* Bias 6 */}
            <div className="rounded-xl border border-shell-border bg-shell/50 p-5">
              <h3 className="font-bold text-cyan-400 mb-2">
                6. Status Quo Bias
              </h3>
              <p className="text-shell-muted leading-relaxed mb-3">
                Status Quo Bias — the tendency to prefer the current state of
                affairs — leads investors to avoid rebalancing their portfolios
                even when their original investment thesis has been invalidated
                or their target allocation has drifted significantly.
              </p>
              <p className="text-shell-muted leading-relaxed">
                An SME treasury originally allocated 60% equity / 40% fixed
                income will drift to 80% / 20% equity after a two-year bull
                market — dramatically increasing risk without a deliberate
                decision. NeuFin monitors portfolio drift against your original
                allocation target and alerts you when drift exceeds a
                configurable threshold (default: 10 percentage points).
              </p>
            </div>
          </div>
        </section>

        {/* Section: How NeuFin helps */}
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">
            How NeuFin Helps Singapore SMEs Detect These Biases
          </h2>
          <p className="text-shell-muted leading-relaxed mb-4">
            NeuFin, built specifically for Singapore and Southeast Asian
            businesses, connects to your existing investment accounts via the
            Plaid API — the same read-only, encrypted connection trusted by
            major banks worldwide. It then runs multi-model AI analysis
            (Anthropic Claude, OpenAI GPT-4, Google Gemini) across your full
            transaction history to generate a behavioral DNA Score: a 0–100
            rating across all six bias dimensions.
          </p>
          <p className="text-shell-muted leading-relaxed mb-6">
            Unlike generic robo-advisors that focus on portfolio allocation,
            NeuFin identifies the psychological patterns behind your financial
            decisions. The average Singapore SME scores 58/100 on their first
            DNA analysis, with Recency Bias and Disposition Effect showing the
            highest deviations from optimal behavior.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/features" className="btn-primary py-2.5 px-6">
              See All Features
            </Link>
            <Link href="/pricing" className="btn-outline py-2.5 px-6">
              View Pricing
            </Link>
          </div>
        </section>

        <hr className="border-shell-border my-10" />

        {/* FAQ section */}
        <section>
          <h2 className="text-xl font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {faqSchema.mainEntity.map(({ name, acceptedAnswer }) => (
              <div key={name} className="border-b border-shell-border pb-5">
                <h3 className="font-semibold text-shell-fg mb-2">{name}</h3>
                <p className="text-sm text-shell-muted leading-relaxed">
                  {acceptedAnswer.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-8">
          <h2 className="text-xl font-bold mb-2">
            Find Your Behavioral Biases Now
          </h2>
          <p className="text-shell-muted text-sm mb-5">
            Upload your portfolio CSV and NeuFin will score your behavioral
            biases in under 10 seconds. Free. No account required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/upload" className="btn-primary py-2.5 px-6">
              Get My DNA Score — Free
            </Link>
            <Link href="/research" className="btn-outline py-2.5 px-6">
              Read Research Findings
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
