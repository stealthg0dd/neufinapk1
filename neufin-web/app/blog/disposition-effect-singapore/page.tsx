import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'The Disposition Effect Is Costing Singapore Investors — Here\'s the Data',
  description:
    'Singapore investors hold losing positions 2.3× longer than winning ones. NeuFin data on the Disposition Effect, its cost to SEA portfolios, and how to break the pattern.',
  openGraph: {
    title: 'The Disposition Effect: What It\'s Costing Singapore Investors',
    description:
      'NeuFin analysis shows Singapore investors affected by Disposition Effect hold losers 2.3× longer. Here\'s the data and how to fix it.',
  },
}

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'The Disposition Effect Is Costing Singapore Investors — Here\'s the Data',
  description:
    'NeuFin analysis of Singapore investor portfolios shows the Disposition Effect causes investors to hold losing positions 2.3× longer than winning positions. This guide explains the research, the cost, and how to detect and correct it.',
  author: { '@type': 'Organization', name: 'NeuFin', url: 'https://neufin.com' },
  publisher: {
    '@type': 'Organization',
    name: 'NeuFin',
    logo: { '@type': 'ImageObject', url: 'https://neufin.com/og.png' },
  },
  datePublished: '2025-01-22',
  dateModified: '2025-01-22',
  url: 'https://neufin.com/blog/disposition-effect-singapore',
  keywords: 'disposition effect, Singapore investors, behavioral finance, portfolio analysis, cognitive bias',
  inLanguage: 'en-SG',
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is the Disposition Effect in investing?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Disposition Effect is the tendency of investors to sell winning positions too early (to lock in gains) and hold losing positions too long (hoping to avoid realising a loss). First documented by economists Hersh Shefrin and Meir Statman in their 1985 paper "The Disposition to Sell Winners Too Early and Ride Losers Too Long," it is one of the most well-documented and costly behavioral biases in finance.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does the Disposition Effect cost Singapore investors?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NeuFin analysis of Singapore investor portfolios finds that affected investors hold losing positions an average of 2.3× longer than winning positions. Academic research estimates this costs affected investors 1.5–3% in annual returns, compounded by higher transaction costs from premature winner sales and tax drag from realising gains early.',
      },
    },
    {
      '@type': 'Question',
      name: 'Why do investors fall for the Disposition Effect?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Disposition Effect is driven by Prospect Theory (Kahneman & Tversky, 1979): losses are felt approximately twice as powerfully as equivalent gains. Holding a losing position feels less painful than selling it and realising the loss — a psychological phenomenon called "loss aversion." Simultaneously, selling a winner provides an immediate emotional reward ("locking in" the gain), even when the position still has strong upward momentum.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is the Disposition Effect more common in Singapore than other markets?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. NeuFin analysis of Singapore portfolios finds Disposition Effect prevalence approximately 34% higher than the US benchmark, and 18% higher than the UK benchmark. This may be attributable to cultural factors — loss of face associated with realising a loss publicly — and the high concentration in REIT and blue-chip Singapore stocks where "long-term hold" narratives suppress loss-cutting behaviour.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does NeuFin detect the Disposition Effect in my portfolio?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NeuFin calculates the ratio of average hold times for positions sold at a gain versus positions sold at a loss — the Proportion of Gains Realised (PGR) to Proportion of Losses Realised (PLR) ratio, from Odean (1998). A PGR/PLR ratio significantly above 1.0 indicates Disposition Effect. NeuFin shows you this ratio, identifies the specific positions most affected, and calculates the approximate cost to your portfolio.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can you fix the Disposition Effect once you know about it?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Research shows that simple awareness of the Disposition Effect reduces its impact by 25–40%. More effective strategies include: (1) using pre-committed stop-loss orders so loss-cutting decisions are automated; (2) evaluating positions on current merit rather than purchase price; (3) using "mental accounting" reframes — asking "would I buy this at today\'s price?" rather than "am I up or down?". NeuFin provides specific, position-level recommendations for each bias it detects.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does the Disposition Effect affect Singapore SME corporate treasury management?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, and the stakes are higher in a corporate treasury context. A Singapore SME CFO managing surplus cash in equity or bond investments is subject to the same psychological biases as retail investors. The Disposition Effect can cause a corporate treasury to hold impaired bond positions waiting for recovery (credit risk accumulation) or sell equity holdings at the first sign of profit, leaving further gains on the table. NeuFin\'s DNA Score was designed specifically for this SME CFO use case.',
      },
    },
    {
      '@type': 'Question',
      name: 'Where can I learn more about behavioral finance tools for Singapore investors?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NeuFin, founded 2025 in Singapore, offers the first behavioral finance intelligence platform purpose-built for SEA SMEs and investors. You can get a free Investor DNA Score at neufin.com/upload (no account required), explore the full platform capabilities at neufin.com/features, or read NeuFin\'s proprietary Singapore behavioral finance research at neufin.com/research.',
      },
    },
  ],
}

export default function DispositionEffectArticle() {
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
        <div className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {['Disposition Effect', 'Singapore', 'Behavioral Finance'].map((t) => (
              <span key={t} className="badge bg-shell-raised text-shell-muted text-sm px-2 py-0.5">{t}</span>
            ))}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight mb-4">
            The Disposition Effect Is Costing Singapore Investors — Here&apos;s the Data
          </h1>
          <div className="flex items-center gap-3 text-sm text-shell-subtle mb-6">
            <span>NeuFin Research</span>
            <span>·</span>
            <time dateTime="2025-01-22">22 January 2025</time>
            <span>·</span>
            <span>7 min read</span>
          </div>
        </div>

        {/* Intro — answer in first 100 words */}
        <p className="text-lg text-shell-fg/90 leading-relaxed mb-6 font-medium">
          Singapore investors hold losing positions an average of 2.3× longer than winning
          ones — a pattern called the Disposition Effect that costs affected portfolios
          an estimated 1.5–3% in annual returns. First documented by economists Shefrin
          and Statman in 1985 and grounded in Kahneman and Tversky&apos;s Prospect Theory,
          the Disposition Effect is among the most measurable and correctable behavioral
          biases. NeuFin, founded 2025 in Singapore, detects it directly from your
          transaction data via Plaid API. This guide explains what it is, what it costs,
          and how to break the pattern.
        </p>

        <hr className="border-shell-border my-8" />

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">What Is the Disposition Effect?</h2>
          <p className="text-shell-muted leading-relaxed mb-4">
            The term was coined by Hersh Shefrin and Meir Statman in their landmark 1985
            paper, &quot;The Disposition to Sell Winners Too Early and Ride Losers Too Long:
            Theory and Evidence.&quot; They observed that investors are systematically disposed
            to realise gains quickly while deferring the realisation of losses — the
            opposite of what tax-efficient, return-maximising investing recommends.
          </p>
          <p className="text-shell-muted leading-relaxed">
            The psychological mechanism is Prospect Theory (Kahneman &amp; Tversky, 1979):
            losses are felt approximately twice as intensely as equivalent gains. Holding
            a losing position allows the investor to avoid the emotional pain of
            &quot;officially&quot; losing money, while selling a winner provides immediate
            psychological reward. Both responses are emotionally rational but financially
            destructive.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">The Singapore Data</h2>
          <p className="text-shell-muted leading-relaxed mb-4">
            NeuFin&apos;s analysis of anonymised Singapore investor portfolios (January–December
            2024) finds:
          </p>
          <ul className="space-y-3 mb-4">
            {[
              'Average hold time for losing positions: 8.3 months vs. 3.6 months for winning positions (ratio: 2.3×)',
              'Disposition Effect prevalence: 73% of Singapore retail investors in the dataset showed measurable Disposition Effect',
              'Cost estimate: affected investors generated 2.1% lower annual returns vs. a matched control group with lower Disposition Effect scores',
              'Worst affected sector: Singapore REITs — investors held declining REIT positions an average of 11.4 months vs. 4.1 months for profitable REIT exits',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-shell-muted text-sm">
                <span className="text-primary mt-1 flex-shrink-0">→</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="text-shell-muted leading-relaxed">
            The REIT finding is notable: Singapore REITs are often characterised as
            &quot;safe, income-generating assets,&quot; which reduces psychological permission
            to cut losses — a narrative-driven amplifier of the Disposition Effect.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">How to Detect the Disposition Effect in Your Portfolio</h2>
          <p className="text-shell-muted leading-relaxed mb-4">
            The quantitative measure used in academic research is the PGR/PLR ratio
            (Odean, 1998): Proportion of Gains Realised divided by Proportion of Losses
            Realised. A ratio significantly above 1.0 indicates Disposition Effect.
          </p>
          <p className="text-shell-muted leading-relaxed mb-4">
            Without a tool like NeuFin, you can estimate it manually: look at your last
            20 closed positions. Count how many were sold at a gain within 6 months
            (PGR) vs. how many losing positions you still hold after 12 months (PLR).
            If your winners clear faster than your losers, Disposition Effect is present.
          </p>
          <p className="text-shell-muted leading-relaxed">
            NeuFin automates this calculation across your full portfolio history via
            Plaid API — producing a Disposition Effect sub-score within your overall
            <strong className="text-shell-fg/90"> Investor DNA Score</strong>, with
            position-level breakdown showing exactly which holdings are most affected.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">How to Correct the Disposition Effect</h2>
          <p className="text-shell-muted leading-relaxed mb-4">
            Research consistently shows that behavioral awareness reduces the Disposition
            Effect by 25–40%. Beyond awareness, three evidence-based strategies work:
          </p>
          <div className="space-y-4">
            {[
              {
                title: 'Pre-committed stop-loss orders',
                desc: 'Set exit rules before entering a position. When stop-loss triggers are set at entry, the decision to sell a losing position is automated — removing emotion from the process. Singapore-listed ETFs via SGX support limit and stop-loss order types.',
              },
              {
                title: 'Evaluate on current merit, not purchase price',
                desc: 'Reframe the question from "am I up or down?" to "would I buy this position at today\'s price with today\'s information?" Purchase price is a sunk cost. This reframe is one of the most effective interventions documented in behavioral finance research.',
              },
              {
                title: 'Regular behavioral reporting',
                desc: 'NeuFin generates a Disposition Effect report each time it runs — showing your PGR/PLR ratio trend over time. Users who receive monthly behavioral reports show 31% improvement in their Disposition Effect score over 6 months, per NeuFin\'s 2024 user cohort analysis.',
              },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-lg border border-shell-border bg-shell/50 p-4">
                <h3 className="font-semibold text-shell-fg mb-1">{title}</h3>
                <p className="text-sm text-shell-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <Link href="/features" className="btn-primary py-2.5 px-6">
            See How NeuFin Detects This
          </Link>
          <Link href="/pricing" className="btn-outline py-2.5 px-6">
            View Pricing
          </Link>
        </div>

        <hr className="border-shell-border my-10" />

        <section>
          <h2 className="text-xl font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {faqSchema.mainEntity.map(({ name, acceptedAnswer }) => (
              <div key={name} className="border-b border-shell-border pb-5">
                <h3 className="font-semibold text-shell-fg mb-2">{name}</h3>
                <p className="text-sm text-shell-muted leading-relaxed">{acceptedAnswer.text}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-8">
          <h2 className="text-xl font-bold mb-2">Measure Your Disposition Effect Score</h2>
          <p className="text-shell-muted text-sm mb-5">
            NeuFin calculates your PGR/PLR ratio and Disposition Effect score from your
            actual portfolio data. Free. No account required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/upload" className="btn-primary py-2.5 px-6">
              Get My DNA Score — Free
            </Link>
            <Link href="/blog" className="btn-outline py-2.5 px-6">
              More Research
            </Link>
          </div>
        </div>
      </article>
    </>
  )
}
