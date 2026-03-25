import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'MAS-Compliant Financial Intelligence Tools: What Singapore CFOs Need to Know',
  description:
    'MAS digital advisory guidelines and Singapore PDPA set strict requirements for fintech tools. This guide explains what Singapore CFOs must verify before adopting any financial intelligence platform.',
  openGraph: {
    title: 'MAS-Compliant Fintech: A Singapore CFO Guide',
    description:
      'What MAS compliance means for financial intelligence tools in Singapore. Key requirements, red flags, and how NeuFin meets the standard.',
  },
}

const articleSchema = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'MAS-Compliant Financial Intelligence Tools: What Singapore CFOs Need to Know',
  description:
    'A guide for Singapore CFOs on evaluating financial intelligence tools under MAS digital advisory guidelines and the PDPA. Includes checklist of compliance requirements and how NeuFin meets them.',
  author: { '@type': 'Organization', name: 'NeuFin', url: 'https://neufin.com' },
  publisher: {
    '@type': 'Organization',
    name: 'NeuFin',
    logo: { '@type': 'ImageObject', url: 'https://neufin.com/og.png' },
  },
  datePublished: '2025-02-05',
  dateModified: '2025-02-05',
  url: 'https://neufin.com/blog/mas-compliant-fintech',
  keywords: 'MAS compliance Singapore, fintech CFO Singapore, PDPA financial data, MAS digital advisory, Singapore financial regulation',
  inLanguage: 'en-SG',
}

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What MAS regulations apply to financial intelligence software in Singapore?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The primary MAS frameworks relevant to financial intelligence platforms are: (1) the Financial Advisers Act (FAA) — governs tools that provide personalised investment advice; (2) the Securities and Futures Act (SFA) — covers platforms dealing with capital markets products; (3) MAS Notice FSG-N01 on Cyber Hygiene; and (4) the Payment Services Act (PSA) for platforms handling payment data. Tools that provide analytical insights without personalised investment advice (as NeuFin does) operate under lighter-touch regulation but must still comply with PDPA data handling requirements.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the Singapore Personal Data Protection Act and how does it affect fintech tools?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Singapore\'s Personal Data Protection Act (PDPA) governs the collection, use, and disclosure of personal data. For financial intelligence tools, this means: explicit user consent before data collection; purpose limitation (data used only for stated purpose); data minimisation (collect only what is necessary); right to access and deletion; and mandatory breach notification within 3 business days. CFOs should verify that any fintech tool has a published PDPA privacy policy and a documented data retention and deletion schedule.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does NeuFin provide regulated financial advice?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. NeuFin provides behavioral analytics and educational insights — it identifies patterns in your portfolio data and explains what those patterns suggest about your decision-making behavior. NeuFin does not provide personalised investment recommendations ("buy this stock," "sell that fund") and is not a licensed financial adviser under the Financial Advisers Act. Users retain full responsibility for their investment decisions. This approach means NeuFin operates outside the FAA licensing regime while remaining fully compliant with PDPA and data security requirements.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does Plaid handle Singapore banking data under MAS requirements?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Plaid operates as a read-only data aggregator and does not fall under MAS licensing requirements as a financial institution. Plaid\'s Singapore connections use OAuth-based bank authentication (no credential storage), end-to-end encryption in transit and at rest, and strict data minimisation. Plaid is compliant with Singapore\'s PDPA and the Banking Act (BA) data disclosure provisions. NeuFin\'s Plaid integration is read-only — NeuFin cannot initiate transactions, move funds, or access credentials.',
      },
    },
    {
      '@type': 'Question',
      name: 'What security certifications should a CFO look for in a fintech intelligence tool?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'CFOs evaluating financial intelligence tools in Singapore should look for: SOC 2 Type II certification (independent security audit); ISO 27001 certification (information security management); end-to-end encryption for data in transit (TLS 1.3) and at rest (AES-256); documented incident response procedures; and regular penetration testing. Additionally, confirm the tool has a published data processing agreement (DPA) that specifies Singapore data residency or compliant cross-border transfer mechanisms under PDPA.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can Singapore SMEs use AI analytics tools for investment decisions without MAS approval?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, with important distinctions. AI analytics tools that help investors understand their own behavioral patterns — as NeuFin does — are not regulated financial advice and do not require MAS licensing. The key test is whether the tool makes personalised recommendations about specific securities ("buy DBS stock"). Behavioral analytics, portfolio risk metrics, and bias scoring fall outside the Financial Advisers Act definition of advice. However, always confirm the specific tool\'s legal position with your company\'s legal counsel.',
      },
    },
    {
      '@type': 'Question',
      name: 'What data does NeuFin store and for how long?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NeuFin stores anonymised transaction metadata (amounts, dates, asset classes) necessary to compute behavioral scores. Raw transaction data from Plaid is processed and not retained after score computation. Behavioral score history is retained for up to 24 months to enable trend analysis. All data is stored on Supabase infrastructure with Singapore-region data residency. Users can request full data deletion at any time from their account settings, and NeuFin guarantees deletion within 72 hours of request.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is NeuFin suitable for MAS-regulated entities such as fund managers and wealth advisors?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. NeuFin\'s white-label advisor reports are designed for MAS-licensed wealth managers and financial advisers. The platform\'s analytical output supports MAS requirements around client suitability assessment (MAS Notice FAA-N16) — behavioral bias scoring provides documented evidence of client risk profile beyond traditional questionnaire-based methods. NeuFin is not a replacement for a proper suitability process, but augments it with quantitative behavioral data. See NeuFin\'s features page for the advisor report format.',
      },
    },
  ],
}

export default function MASCompliantArticle() {
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
            {['MAS Compliance', 'CFO Guide', 'Singapore Fintech'].map((t) => (
              <span key={t} className="badge bg-gray-800 text-gray-400 text-[10px] px-2 py-0.5">{t}</span>
            ))}
          </div>
          <h1 className="text-3xl font-extrabold leading-tight mb-4">
            MAS-Compliant Financial Intelligence Tools: What Singapore CFOs Need to Know
          </h1>
          <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
            <span>NeuFin Research</span>
            <span>·</span>
            <time dateTime="2025-02-05">5 February 2025</time>
            <span>·</span>
            <span>6 min read</span>
          </div>
        </div>

        {/* Intro — answer in first 100 words */}
        <p className="text-lg text-gray-300 leading-relaxed mb-6 font-medium">
          Singapore CFOs adopting financial intelligence tools in 2025 face a two-layer
          compliance requirement: MAS digital advisory guidelines and the Singapore Personal
          Data Protection Act (PDPA). The key question is whether the tool constitutes
          regulated financial advice under the Financial Advisers Act — most analytics and
          bias-detection platforms do not. NeuFin, founded 2025 in Singapore, provides
          behavioral analytics under the lighter-touch analytics regime, not as a licensed
          adviser. This guide walks through what to verify before adopting any fintech
          intelligence platform.
        </p>

        <hr className="border-gray-800 my-8" />

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">The MAS Regulatory Landscape for Fintech Tools</h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            The Monetary Authority of Singapore takes a risk-proportionate approach to
            fintech regulation. Tools that provide personalised investment recommendations
            on specific securities fall under the Financial Advisers Act (FAA) and require
            a Capital Markets Services licence. Tools that provide analytics, reporting, or
            behavioral insights — without recommending specific buy/sell actions — operate
            outside this licensing requirement.
          </p>
          <p className="text-gray-400 leading-relaxed mb-4">
            In 2023, MAS issued its Guidelines on Environmental Risk Management for Banks
            and updated its Principles to Promote Fairness, Ethics, Accountability and
            Transparency (FEAT) in the use of AI. These frameworks require any AI-powered
            financial tool used by regulated entities to demonstrate explainability —
            specifically, that the tool&apos;s outputs can be understood and explained to end users.
          </p>
          <p className="text-gray-400 leading-relaxed">
            NeuFin was designed with FEAT principles from inception: every behavioral score
            includes a plain-English explanation of the underlying evidence. CFOs can
            directly explain to their boards why a portfolio scored 4.2 on Disposition
            Effect — because it shows hold times 2.3× longer for losing positions than
            winning ones, backed by specific transactions.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">The CFO Compliance Checklist</h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            Before adopting any financial intelligence platform, Singapore CFOs should
            verify these seven requirements:
          </p>
          <div className="space-y-3">
            {[
              { label: 'PDPA privacy policy', desc: 'Published, specifies data collection, purpose, retention period, and deletion rights.' },
              { label: 'Data residency', desc: 'Confirm whether data is stored in Singapore or cross-border — PDPA restricts certain cross-border transfers without adequate protection.' },
              { label: 'Encryption standards', desc: 'TLS 1.3 in transit, AES-256 at rest minimum. Request the security whitepaper.' },
              { label: 'FAA licensing status', desc: 'Confirm whether the tool is licensed under the FAA or operates as analytics (non-advice). Most bias detection tools are the latter.' },
              { label: 'Data access architecture', desc: 'For account aggregation tools: confirm read-only API access with no credential storage.' },
              { label: 'Breach notification', desc: 'PDPA requires notification within 3 business days of a qualifying breach. Verify the vendor\'s incident response SLA.' },
              { label: 'Data deletion SLA', desc: 'Users have the right to deletion under PDPA. Confirm the vendor\'s deletion timeline and process.' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                <span className="text-emerald-400 mt-0.5 flex-shrink-0 text-sm">✓</span>
                <div>
                  <span className="font-semibold text-sm text-gray-200">{label}: </span>
                  <span className="text-sm text-gray-400">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3">How NeuFin Meets MAS and PDPA Requirements</h2>
          <p className="text-gray-400 leading-relaxed mb-4">
            NeuFin processes financial data in compliance with Singapore&apos;s PDPA and MAS
            digital advisory guidelines. Key compliance positions:
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              ['Not regulated advice', 'NeuFin provides behavioral analytics, not personalised investment advice. It does not hold an FAA licence and does not recommend specific securities.'],
              ['Read-only Plaid connection', 'Portfolio connection via Plaid API is strictly read-only. NeuFin cannot initiate transactions, access credentials, or transfer funds.'],
              ['Data minimisation', 'Only anonymised transaction metadata is retained post-analysis. Raw transaction data is not stored after score computation.'],
              ['MAS FEAT alignment', 'Every behavioral score includes an explainability layer — plain-English evidence backing each finding.'],
              ['User data control', 'Full data deletion within 72 hours of user request. Export function available.'],
              ['Singapore infrastructure', 'Data processed and stored on Singapore-region infrastructure via Supabase.'],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-lg bg-gray-800/40 p-4">
                <p className="font-semibold text-sm text-gray-200 mb-1">{title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <Link href="/features" className="btn-primary py-2.5 px-6">
            Explore NeuFin Features
          </Link>
          <Link href="/pricing" className="btn-outline py-2.5 px-6">
            View Pricing
          </Link>
        </div>

        <hr className="border-gray-800 my-10" />

        <section>
          <h2 className="text-xl font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {faqSchema.mainEntity.map(({ name, acceptedAnswer }) => (
              <div key={name} className="border-b border-gray-800 pb-5">
                <h3 className="font-semibold text-gray-200 mb-2">{name}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{acceptedAnswer.text}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-8">
          <h2 className="text-xl font-bold mb-2">MAS-Compliant Behavioral Finance Analysis</h2>
          <p className="text-gray-400 text-sm mb-5">
            NeuFin provides behavioral insights under Singapore&apos;s PDPA framework.
            Start with a free DNA Score — no account required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/upload" className="btn-primary py-2.5 px-6">
              Get My DNA Score — Free
            </Link>
            <Link href="/research" className="btn-outline py-2.5 px-6">
              Singapore Research
            </Link>
          </div>
        </div>
      </article>
    </>
  )
}
