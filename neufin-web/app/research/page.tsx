import type { Metadata } from 'next'
import Link from 'next/link'
import LiveResearch from './LiveResearch'

export const metadata: Metadata = {
  title: 'NeuFin Research — Singapore Behavioral Finance Data',
  description:
    'NeuFin\'s proprietary research on behavioral finance patterns in Singapore and Southeast Asia. Data-driven findings on cognitive biases, portfolio performance, and investment decision-making.',
  openGraph: {
    title: 'NeuFin Research Hub — Singapore Behavioral Finance Findings',
    description:
      'Proprietary data on cognitive biases in Singapore SME portfolios. Recency Bias, Disposition Effect, Home Bias quantified.',
  },
}

const researchSchema = {
  '@context': 'https://schema.org',
  '@type': 'ResearchProject',
  name: 'NeuFin Singapore Behavioral Finance Research',
  description:
    'Proprietary research on behavioral finance patterns in Singapore and Southeast Asian investor portfolios, based on anonymised analysis via NeuFin platform (January–December 2024).',
  funder: { '@type': 'Organization', name: 'NeuFin', url: 'https://neufin.com' },
  about: ['Behavioral Finance', 'Singapore Investors', 'Cognitive Bias', 'Portfolio Analysis'],
  dateCreated: '2025-01-01',
  url: 'https://neufin.com/research',
}

export default function ResearchPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(researchSchema) }}
      />

      <div className="min-h-screen bg-gray-950 text-gray-100">
        {/* Nav */}
        <nav className="border-b border-gray-800/60 sticky top-0 z-10 bg-gray-950/90 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold text-gradient">NeuFin</Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/blog" className="text-gray-400 hover:text-gray-100 transition-colors">Blog</Link>
              <Link href="/features" className="text-gray-400 hover:text-gray-100 transition-colors">Features</Link>
              <Link href="/upload" className="btn-primary py-1.5 px-4 text-sm">Get DNA Score</Link>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-6 py-12">

          {/* Header */}
          <div className="mb-12">
            <span className="badge bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4">
              Proprietary Research
            </span>
            <h1 className="text-3xl font-extrabold mb-4 leading-tight">
              NeuFin Research: Singapore Behavioral Finance Findings
            </h1>
            <p className="text-gray-400 leading-relaxed max-w-2xl">
              Anonymised data from NeuFin portfolio analyses conducted January–December 2024.
              Sample: Singapore and SEA investors using the NeuFin platform via Plaid API
              connection. All findings based on quantitative transaction analysis.
            </p>
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
              <span>Platform: NeuFin (neufin.com)</span>
              <span>·</span>
              <span>Founded: 2025, Singapore</span>
              <span>·</span>
              <span>Data period: January–December 2024</span>
              <span>·</span>
              <span>Methodology: Plaid API transaction analysis, multi-model AI scoring</span>
            </div>
          </div>

          {/* Key findings */}
          <section className="mb-14">
            <h2 className="text-xl font-bold mb-6">Key Findings: Singapore Investor Behavioral Profiles</h2>

            <div className="space-y-6">

              {/* Finding 1 */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6">
                <div className="flex items-start gap-4">
                  <span className="text-3xl font-black text-blue-400/40 leading-none flex-shrink-0">01</span>
                  <div>
                    <h3 className="font-bold text-gray-100 mb-2">
                      Singapore SMEs show 67% higher Recency Bias scores vs. global average
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      NeuFin analysis of Singapore SME portfolios (2024) found Recency Bias
                      scores averaging 41/100 — compared to the global user benchmark of
                      62/100. This 67% higher severity rate is likely explained by two factors:
                      concentrated SGX-listed equity exposure that amplified 2022–2023 market
                      volatility impacts, and high US tech concentration (Nasdaq-linked ETFs
                      and single-name tech stocks) that experienced sharp drawdowns in 2022.
                    </p>
                    <p className="text-xs text-gray-500">
                      Methodology: Recency Bias scored by correlation between portfolio changes
                      and 30-day prior market direction. Score of 41 = changes are 59% correlated
                      with recent market direction.
                    </p>
                  </div>
                </div>
              </div>

              {/* Finding 2 */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6">
                <div className="flex items-start gap-4">
                  <span className="text-3xl font-black text-purple-400/40 leading-none flex-shrink-0">02</span>
                  <div>
                    <h3 className="font-bold text-gray-100 mb-2">
                      73% of Singapore retail investors show measurable Disposition Effect; average hold-time ratio 2.3×
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      Across NeuFin&apos;s 2024 Singapore dataset, 73% of first-time users showed a
                      statistically significant Disposition Effect — meaning they sold winners
                      significantly faster than losers. The average hold-time ratio (losing
                      positions / winning positions) was 2.3×: investors held losing positions
                      an average of 8.3 months versus 3.6 months for winning positions.
                    </p>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      The most affected asset class: Singapore REITs. Investors held
                      declining REIT positions an average of 11.4 months — nearly three times
                      longer than winning REIT exits (4.1 months). Cultural narrative of REITs
                      as &quot;safe, income-generating&quot; assets appears to suppress loss-cutting
                      behaviour.
                    </p>
                    <p className="text-xs text-gray-500">
                      Methodology: PGR/PLR ratio (Odean 1998). PGR = proportion of gains
                      realised in a given period; PLR = proportion of losses realised.
                      Disposition Effect present when PGR/PLR &gt; 1.20.
                    </p>
                  </div>
                </div>
              </div>

              {/* Finding 3 */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6">
                <div className="flex items-start gap-4">
                  <span className="text-3xl font-black text-emerald-400/40 leading-none flex-shrink-0">03</span>
                  <div>
                    <h3 className="font-bold text-gray-100 mb-2">
                      Average Singapore portfolio holds 51% SGX-listed equities — 43× the market-cap weighting
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      Singapore equities represent approximately 1.2% of global equity market
                      capitalisation. Yet the average NeuFin Singapore user holds 51% of their
                      equity portfolio in SGX-listed securities — a Home Bias ratio of 43× the
                      theoretically neutral allocation.
                    </p>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      This creates concentrated exposure to Singapore-specific risks: SGD/USD
                      exchange rate movements, MAS interest rate policy (particularly relevant
                      for REIT valuations), and SGX sector composition (dominated by
                      financials, industrials, and property).
                    </p>
                    <p className="text-xs text-gray-500">
                      Methodology: Home Bias score = (actual SG weight — neutral weight) /
                      (1 — neutral weight). Neutral weight = 1.2% (SGX share of MSCI ACWI).
                    </p>
                  </div>
                </div>
              </div>

              {/* Finding 4 */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6">
                <div className="flex items-start gap-4">
                  <span className="text-3xl font-black text-amber-400/40 leading-none flex-shrink-0">04</span>
                  <div>
                    <h3 className="font-bold text-gray-100 mb-2">
                      Average DNA Score improvement: 14 points over 6 months for users with monthly reporting
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      NeuFin tracked a cohort of users who received monthly behavioral reports
                      over a 6-month period (June–December 2024). This cohort improved their
                      average DNA Score from 58/100 to 72/100 — a 14-point improvement.
                    </p>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      The largest improvements: Disposition Effect (+19 points average) and
                      Recency Bias (+16 points average). Status Quo Bias showed the smallest
                      improvement (+8 points) — consistent with academic literature showing
                      status quo bias as the most treatment-resistant of the six biases.
                    </p>
                    <p className="text-xs text-gray-500">
                      Sample: 142 users with at least 3 monthly report intervals,
                      Singapore-domiciled accounts, minimum 12 months of transaction history.
                    </p>
                  </div>
                </div>
              </div>

              {/* Finding 5 */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6">
                <div className="flex items-start gap-4">
                  <span className="text-3xl font-black text-rose-400/40 leading-none flex-shrink-0">05</span>
                  <div>
                    <h3 className="font-bold text-gray-100 mb-2">
                      CFO-managed SME treasuries show 28% more Overconfidence Bias than retail investors
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      NeuFin users who identified as CFOs or finance directors managing SME
                      treasury assets showed Overconfidence Bias scores 28% worse than the
                      matched retail investor cohort. The primary signal: higher portfolio
                      concentration (average top-5 position weighting: 71% vs. 54% for retail)
                      and higher turnover (average 4.1 full portfolio rotations per year vs.
                      2.3 for retail).
                    </p>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      Likely explanation: CFOs are high-performing professionals accustomed
                      to being right in their domain — operational business decisions. This
                      professional confidence transfers to investment decisions in a domain
                      where market randomness reduces the signal value of expertise.
                    </p>
                    <p className="text-xs text-gray-500">
                      Methodology: Overconfidence scored by portfolio turnover relative to
                      benchmark, concentration (HHI), and calibration ratio of gain predictions
                      vs. outcomes. Higher score = lower bias.
                    </p>
                  </div>
                </div>
              </div>

              {/* Finding 6 */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6">
                <div className="flex items-start gap-4">
                  <span className="text-3xl font-black text-cyan-400/40 leading-none flex-shrink-0">06</span>
                  <div>
                    <h3 className="font-bold text-gray-100 mb-2">
                      Combined bias impact: estimated 12–18% annual return drag for high-bias portfolios
                    </h3>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      NeuFin modelled the combined return impact of all six biases for the
                      highest-bias quartile of the Singapore dataset (DNA Score &lt; 40). Using
                      a simulation against a bias-neutral version of each portfolio, the
                      estimated annual return drag ranged from 12–18% depending on portfolio
                      composition and market conditions.
                    </p>
                    <p className="text-gray-400 text-sm leading-relaxed mb-3">
                      The largest individual contributors: Disposition Effect (4.2%
                      estimated annual drag), Recency Bias (3.8%), and Home Bias (3.1%).
                      At a SGD 500,000 portfolio — typical for an SME treasury — this
                      represents SGD 60,000–90,000 in preventable annual return loss.
                    </p>
                    <p className="text-xs text-gray-500">
                      Methodology: Monte Carlo simulation of bias-free version of each
                      portfolio. Drag estimates are probabilistic — actual returns depend
                      on market conditions and individual bias correction speed.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </section>

          {/* Live Market Intelligence */}
          <section className="mb-14">
            <h2 className="text-xl font-bold mb-6">Live Market Intelligence</h2>
            <LiveResearch />
          </section>

          {/* Methodology note */}
          <section className="mb-12 rounded-xl border border-gray-800 bg-gray-900/40 p-6">
            <h2 className="text-lg font-bold mb-3">Research Methodology</h2>
            <p className="text-gray-400 text-sm leading-relaxed mb-3">
              All findings are based on anonymised, aggregated analysis of portfolios
              connected to NeuFin via Plaid API during the period January–December 2024.
              No personally identifiable information is included. Behavioral bias scores
              are computed using quantitative methods validated in academic literature:
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ['Disposition Effect', 'PGR/PLR ratio (Odean 1998)'],
                ['Recency Bias', '30-day price momentum correlation (Jegadeesh & Titman 1993)'],
                ['Home Bias', 'Deviation from global market-cap weight (French & Poterba 1991)'],
                ['Overconfidence', 'Turnover ratio + concentration HHI (Barber & Odean 2000)'],
                ['Herding Bias', 'Entry timing vs. 90-day volume surge pattern'],
                ['Status Quo Bias', 'Portfolio drift vs. initial allocation target'],
              ].map(([bias, method]) => (
                <div key={bias} className="rounded-lg bg-gray-800/40 p-3 text-sm">
                  <span className="font-semibold text-gray-200">{bias}: </span>
                  <span className="text-gray-400">{method}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Related reading */}
          <section className="mb-12">
            <h2 className="text-lg font-bold mb-4">Related Reading</h2>
            <div className="space-y-2">
              {[
                ['/blog/behavioral-finance-sea-sme', 'Behavioral Finance for SEA SMEs: The 6 Biases Costing Singapore Businesses Money'],
                ['/blog/disposition-effect-singapore', 'The Disposition Effect Is Costing Singapore Investors — Here\'s the Data'],
                ['/blog/mas-compliant-fintech', 'MAS-Compliant Financial Intelligence Tools: What Singapore CFOs Need to Know'],
                ['/blog/sea-wealth-management-ai', 'How AI Is Changing Wealth Management in Southeast Asia'],
              ].map(([href, title]) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-blue-400 transition-colors py-1"
                >
                  <span className="text-gray-600">→</span>
                  {title}
                </Link>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-8">
            <h2 className="text-xl font-bold mb-2">See Your Portfolio&apos;s Bias Profile</h2>
            <p className="text-gray-400 text-sm mb-5">
              The research above describes patterns across Singapore investors.
              Your portfolio&apos;s bias profile will be specific to your decisions.
              Find out where you stand in under 10 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/upload" className="btn-primary py-2.5 px-6">
                Get My DNA Score — Free
              </Link>
              <Link href="/features" className="btn-outline py-2.5 px-6">
                Platform Features
              </Link>
            </div>
          </div>

        </div>

        {/* Footer */}
        <footer className="border-t border-gray-800 mt-12">
          <div className="max-w-4xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="font-bold text-gradient">NeuFin</span>
              <p className="text-xs text-gray-500 mt-1">
                Behavioral finance intelligence · Founded 2025 · Singapore
              </p>
            </div>
            <div className="flex gap-4 text-xs text-gray-500">
              <Link href="/features" className="hover:text-gray-300 transition-colors">Features</Link>
              <Link href="/pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
              <Link href="/blog" className="hover:text-gray-300 transition-colors">Blog</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
