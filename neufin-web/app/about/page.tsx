import Link from 'next/link'
import { GlassCard } from '@/components/ui/GlassCard'

const founders = [
  {
    name: 'Varun Srivastava',
    title: 'Founder & CEO',
    bio: `Cyber Defense and AI leader with global experience in threat intelligence and risk systems. Previously led teams countering nation-state cyberattacks. Brings deep expertise in AI, cybersecurity, and behavioral finance.`,
    tags: ['AI', 'Cybersecurity', 'Behavioral Finance'],
  },
  {
    name: 'Ha Pham',
    title: 'Co-Founder & Chief Strategy Officer',
    bio: `15+ years in digital banking, scaling Vietnam International Bank to 93% digital transactions and 60% adoption. Recognized by The Banker and The Asset.`,
    tags: ['Digital Banking', 'Platform Strategy', 'AI Personalization'],
  },
  {
    name: 'Ray Nee',
    title: 'Co-Founder & Chief of Hustle',
    bio: `Operations and program leader with experience across Singapore, Japan, and New Zealand. Managed multi-million-dollar upskilling programs and global brand campaigns.`,
    tags: ['Operations', 'Partnerships', 'Human-Centered Tech'],
  },
] as const

const values = ['AI-First', 'Data Privacy', 'Measurable Results', 'Community Driven'] as const

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-24">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary">ABOUT NEUFIN</p>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to home →
          </Link>
        </div>

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Built by people who&apos;ve seen what broken finance costs
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Neufin is creating the world&apos;s first finance-native intelligence layer, designed to transform overwhelming
          market noise into personalized, profitable insights.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {founders.map((f) => (
            <GlassCard key={f.name} className="flex h-full flex-col p-6">
              <p className="text-sm font-semibold text-foreground">{f.name}</p>
              <p className="mt-1 font-mono text-[11px] text-primary">{f.title}</p>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">{f.bio}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {f.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>

        <div className="mt-14">
          <h2 className="text-xl font-bold text-foreground">Our mission</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            We believe institutions deserve an intelligence layer that is explainable, measurable, and safe to deploy
            across jurisdictions. Our goal is to help teams make faster decisions while reducing behavioral bias and
            operational drag.
          </p>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-bold text-foreground">Values</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {values.map((v) => (
              <div key={v} className="rounded-xl border border-border bg-surface p-5 text-center">
                <p className="font-mono text-[11px] text-muted-foreground">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

