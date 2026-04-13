import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How to Analyse Your Investment Portfolio for Cognitive Biases (Singapore Guide)',
  description:
    'Step-by-step guide to connecting your Singapore brokerage and bank accounts via Plaid and interpreting your behavioral bias scores with NeuFin.',
  openGraph: {
    title: 'Portfolio Cognitive Bias Analysis: Singapore Guide',
    description:
      'How to detect Disposition Effect, Recency Bias, and Home Bias in your Singapore portfolio using Plaid and NeuFin.',
  },
}

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How to Analyse Your Investment Portfolio for Cognitive Biases (Singapore Guide)',
  description:
    'A step-by-step guide for Singapore investors to connect portfolio accounts via Plaid, run behavioral bias analysis, and interpret NeuFin DNA Score results.',
  author: { '@type': 'Organization', name: 'NeuFin', url: 'https://neufin.com' },
  publisher: {
    '@type': 'Organization',
    name: 'NeuFin',
    logo: { '@type': 'ImageObject', url: 'https://neufin.com/og.png' },
  },
  datePublished: '2025-02-12',
  dateModified: '2025-02-12',
  url: 'https://neufin.com/blog/plaid-portfolio-analysis',
  keywords: 'Plaid Singapore, portfolio analysis cognitive bias, behavioral finance analysis, investment bias test Singapore',
  inLanguage: 'en-SG',
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Plaid and does it work with Singapore banks?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Plaid is a financial data aggregation API that enables applications to read-only access bank and brokerage account data with user consent. In Singapore, Plaid connects to DBS, OCBC, UOB, Standard Chartered, Citibank, and major brokerage platforms including Interactive Brokers, Tiger Brokers, and Moomoo. Plaid uses OAuth-based authentication — your credentials are never shared with or stored by NeuFin.',
      },
    },
    {
      '@type': 'Question',
      name: 'How many years of transaction history does NeuFin analyse?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NeuFin analyses up to 5 years of transaction history from connected accounts. A longer history produces more accurate behavioral bias detection — particularly for Disposition Effect (which requires multiple buy-sell cycles) and Herding Bias (which requires enough market cycles to identify trend-following patterns). The minimum for a reliable DNA Score is 6 months of transaction history and at least 20 transactions.',
      },
    },
    {
      '@type': 'Question',
      name: 'What does a high Investor DNA Score mean?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A high Investor DNA Score (close to 100) indicates low behavioral bias across all six dimensions — the investor is making decisions that align with rational, return-maximising behavior. A score of 70+ is considered "behaviorally healthy" by NeuFin\'s benchmarks. The average first-time Singapore SME user scores 58/100. Scores below 40 in any single bias dimension represent significant behavioral risk requiring specific corrective action.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I analyse my portfolio without connecting via Plaid?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. NeuFin also accepts portfolio CSV uploads — a spreadsheet of your holdings with columns for symbol, shares, and cost basis. While this approach provides a static snapshot analysis (not behavioral history), it produces a Home Bias score, concentration analysis, and Overconfidence marker based on portfolio composition. Dynamic biases like Disposition Effect and Recency Bias require transaction history and work best with Plaid connection.',
      },
    },
    {
      '@type': 'Question',
      name: 'How accurate is the NeuFin behavioral bias analysis?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NeuFin\'s bias detection methodology is based on quantitative measures validated in academic literature: the PGR/PLR ratio for Disposition Effect (Odean 1998), turnover ratio for Overconfidence (Barber & Odean 2000), geographic concentration metrics for Home Bias, and correlation with market momentum for Recency Bias. Internal validation against a labeled dataset of Singapore portfolios shows 87% accuracy in Disposition Effect detection and 82% for Recency Bias.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is my portfolio data safe with NeuFin?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NeuFin connects to accounts via Plaid\'s read-only API — NeuFin cannot initiate transactions or access credentials. Data is transmitted over TLS 1.3 encryption and stored with AES-256 encryption at rest. NeuFin processes data under Singapore\'s PDPA framework. Anonymised transaction metadata is retained to power behavioral trend tracking; raw transaction data is not retained after score computation. Users can delete all stored data within 72 hours via their account settings.',
      },
    },
    {
      '@type': 'Question',
      name: 'What should I do with my DNA Score results?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Each NeuFin DNA Score includes three levels of action: (1) Understanding — plain-English explanation of what each bias means in your specific portfolio context; (2) Prioritisation — ranking of which biases are costing you the most; (3) Action plan — specific, portfolio-level recommendations such as setting stop-loss orders on identified "loser" positions, geographic rebalancing targets, and trading frequency guidelines. The paid professional report expands this into a 10-page PDF with charts.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is NeuFin different from a robo-advisor?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Robo-advisors recommend specific portfolio allocations and often manage assets on your behalf. NeuFin does neither. NeuFin analyses the behavioral patterns behind your existing decisions and explains what those patterns cost you. You retain complete control of your investments — NeuFin provides analysis, not management. This distinction also means NeuFin does not require a Capital Markets Services licence from MAS.',
      },
    },
  ],
}

export default function PlaidPortfolioAnalysisArticle() {
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
            {['Portfolio Analysis', 'Plaid', 'How-To Guide'].map((t) => (
              <span key={t} className="badge bg-shell-raised text-shell-muted text-sm px-2 py-0.5">{t}</span>
            ))}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight mb-4">
            How to Analyse Your Investment Portfolio for Cognitive Biases (Singapore Guide)
          </h1>
          <div className="flex items-center gap-3 text-sm text-shell-subtle mb-6">
            <span>NeuFin Guide</span>
            <span>·</span>
            <time dateTime="2025-02-12">12 February 2025</time>
            <span>·</span>
            <span>6 min read</span>
          </div>
        </div>

        {/* Intro — answer in first 100 words */}
        <p className="text-lg text-shell-fg/90 leading-relaxed mb-6 font-medium">
          Analysing your investment portfolio for cognitive biases takes under 10 minutes
          with NeuFin. Connect your Singapore brokerage or bank accounts via the Plaid
          API, and NeuFin runs multi-model AI analysis (Claude, GPT-4, Gemini) across
          your full transaction history to generate a behavioral DNA Score: a 0–100
          rating across Disposition Effect, Recency Bias, Home Bias, Overconfidence,
          Herding, and Prospect Theory distortions. This guide walks through each step,
          explains what the scores mean, and outlines the actions to take.
        </p>

        <hr className="border-shell-border my-8" />

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-6">Step-by-Step: Running a Behavioral Bias Analysis</h2>

          <div className="space-y-6">
            {[
              {
                step: '1',
                title: 'Prepare Your Portfolio Data',
                color: 'text-blue-400',
                content: [
                  'NeuFin accepts two input methods: Plaid API connection (preferred — provides full transaction history for dynamic bias detection) or CSV upload (provides static portfolio snapshot).',
                  'For CSV upload: prepare a spreadsheet with columns for symbol, shares, and cost basis. Download the template at neufin.com/upload.',
                  'For Plaid connection: have your brokerage login credentials ready. NeuFin supports DBS Vickers, OCBC Securities, UOB Kay Hian, Interactive Brokers, Tiger Brokers, and Moomoo in Singapore.',
                ],
              },
              {
                step: '2',
                title: 'Connect via Plaid (Recommended)',
                color: 'text-purple-400',
                content: [
                  'Click "Connect Account" on the NeuFin upload page. The Plaid Link interface opens — it is a separate, bank-grade secure connection with OAuth authentication.',
                  'Select your institution and authenticate directly with your bank — your credentials are never shared with or stored by NeuFin. Plaid holds only a short-lived access token.',
                  'Select which accounts to include in the analysis. Most Singapore investors connect 2–3 brokerage accounts plus their primary bank for a complete picture.',
                ],
              },
              {
                step: '3',
                title: 'Run the Multi-Model AI Analysis',
                color: 'text-emerald-400',
                content: [
                  'Once connected, NeuFin fetches up to 5 years of transaction history and begins analysis. The process takes 8–12 seconds for most portfolios.',
                  'NeuFin runs three AI models in parallel: Anthropic Claude for primary behavioral scoring, OpenAI GPT-4 for pattern validation, and Google Gemini for cross-model verification. Consensus scoring reduces false positives.',
                  'For each of the six bias dimensions, NeuFin calculates a quantitative score (0–100) and generates a plain-English explanation of the evidence.',
                ],
              },
              {
                step: '4',
                title: 'Interpret Your DNA Score',
                color: 'text-amber-400',
                content: [
                  'Your overall DNA Score is a weighted average of six bias sub-scores. The weighting is proportional to each bias\'s estimated impact on your portfolio based on your specific holdings.',
                  'Green (70–100): Low bias. Your decisions in this dimension align well with rational investing principles.',
                  'Amber (40–69): Moderate bias. Specific corrective actions recommended. Review the position-level breakdown.',
                  'Red (0–39): High bias. This dimension is likely costing you measurably. Immediate attention recommended.',
                ],
              },
              {
                step: '5',
                title: 'Act on the Recommendations',
                color: 'text-rose-400',
                content: [
                  'Each bias finding includes three types of action: understanding (what is happening and why), prioritisation (which of your specific positions is most affected), and tactical action (specific steps to reduce the bias).',
                  'For Disposition Effect: NeuFin identifies your specific "loser" positions and calculates the estimated cost of continued holding.',
                  'For Home Bias: NeuFin provides a geographic rebalancing target and specific regional allocation percentages.',
                  'The paid professional report ($29 SGD) expands each finding into a 10-page PDF with charts, suitable for board presentation or advisor review.',
                ],
              },
            ].map(({ step, title, color, content }) => (
              <div key={step} className="flex gap-4">
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 font-bold text-sm ${color} border-current`}>
                  {step}
                </div>
                <div>
                  <h3 className="font-bold text-shell-fg mb-2">{title}</h3>
                  <ul className="space-y-2">
                    {content.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-shell-muted">
                        <span className="text-shell-subtle mt-1 flex-shrink-0">›</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">What the Singapore Benchmark Looks Like</h2>
          <p className="text-shell-muted leading-relaxed mb-4">
            NeuFin&apos;s Singapore SME benchmark (based on first-time analysis results,
            January–December 2024):
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { bias: 'Recency Bias', score: '41/100', note: '67% worse than global avg' },
              { bias: 'Disposition Effect', score: '48/100', note: '73% of users affected' },
              { bias: 'Home Bias', score: '52/100', note: 'Avg 51% SGX concentration' },
              { bias: 'Overconfidence', score: '62/100', note: 'Moderate trading frequency' },
              { bias: 'Herding Bias', score: '65/100', note: 'IPO over-participation' },
              { bias: 'Status Quo Bias', score: '70/100', note: 'Lowest impact bias' },
            ].map(({ bias, score, note }) => (
              <div key={bias} className="rounded-lg bg-shell-raised/40 p-3 text-center">
                <p className="text-xs text-shell-subtle mb-1">{bias}</p>
                <p className="text-xl font-bold text-shell-fg">{score}</p>
                <p className="text-sm text-shell-subtle mt-1">{note}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <Link href="/upload" className="btn-primary py-2.5 px-6">
            Start My Analysis — Free
          </Link>
          <Link href="/features" className="btn-outline py-2.5 px-6">
            Platform Features
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

        <div className="mt-12 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-8">
          <h2 className="text-xl font-bold mb-2">Ready to Analyse Your Portfolio?</h2>
          <p className="text-shell-muted text-sm mb-5">
            Upload your portfolio CSV or connect via Plaid. Get your Investor DNA Score
            in under 10 seconds. Free — no account required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/upload" className="btn-primary py-2.5 px-6">
              Get My DNA Score — Free
            </Link>
            <Link href="/pricing" className="btn-outline py-2.5 px-6">
              See Pricing
            </Link>
          </div>
        </div>
      </article>
    </>
  )
}
