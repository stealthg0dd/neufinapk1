import Link from "next/link";
import Image from "next/image";

const FOOTER_LINKS = {
  Product: [
    { href: "/upload", label: "Analyze" },
    { href: "/pricing", label: "Pricing" },
    { href: "/research", label: "Research" },
    { href: "/features", label: "Features" },
  ],
  Developers: [
    { href: "/partners", label: "API & partners" },
    { href: "/developer", label: "Developer hub" },
    { href: "/developer/docs", label: "Docs" },
  ],
  Company: [
    { href: "/about", label: "About" },
    { href: "/contact-sales", label: "Contact sales" },
    { href: "mailto:info@neufin.ai", label: "info@neufin.ai", external: true },
  ],
  Legal: [
    { href: "/terms-and-conditions", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
    { href: "https://status.neufin.ai", label: "Status", external: true },
  ],
} as const;

export default function Footer() {
  return (
    <footer className="border-t border-border/60 bg-surface py-section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Image
              src="/logo.png"
              alt="NeuFin"
              width={160}
              height={40}
              className="h-10 w-auto"
            />
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              IC-grade portfolio intelligence in about a minute. Built for
              advisors, wealth platforms, and teams who need committee-ready
              output without a research bench.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/upload"
                className="inline-flex justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Analyze a portfolio
              </Link>
              <Link
                href="/contact-sales"
                className="inline-flex justify-center rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
              >
                Book a demo
              </Link>
            </div>
          </div>
          {(
            Object.entries(FOOTER_LINKS) as [
              keyof typeof FOOTER_LINKS,
              (typeof FOOTER_LINKS)["Product"],
            ][]
          ).map(([title, links]) => (
            <div key={title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {links.map((item) => {
                  const ext = "external" in item && item.external;
                  const newTab = ext && item.href.startsWith("http");
                  return (
                    <li key={item.label}>
                      {ext ? (
                        <a
                          href={item.href}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                          {...(newTab
                            ? { target: "_blank", rel: "noreferrer" }
                            : {})}
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className="text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {item.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border/40 pt-8">
          <div className="grid gap-6 text-sm text-muted-foreground md:grid-cols-2">
            <div>
              <p className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground/70">
                Registered
              </p>
              <p>
                NeuFin OÜ · Harju maakond, Tallinn, Kesklinna linnaosa,
                Vesivärva tn 50-201, 10152 · Estonia (EU)
              </p>
              <p className="mt-1">
                Neufin Inc. — United States registered office
              </p>
            </div>
            <div className="md:text-right">
              <p>
                © {new Date().getFullYear()} Neufin OÜ. All rights reserved.
              </p>
              <p className="mt-1">www.neufin.ai</p>
            </div>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground/80">
            NeuFin provides tools for informational purposes only. This is not
            investment advice. Past performance does not indicate future
            results.
          </p>
        </div>
      </div>
    </footer>
  );
}
