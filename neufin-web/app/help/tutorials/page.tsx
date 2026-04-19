import Link from "next/link";
import { TUTORIAL_CATEGORIES, TUTORIALS } from "@/lib/onboarding-catalog";
import { ProductTourEmbed } from "@/components/onboarding/ProductTourEmbed";
import { TutorialTopicCard } from "@/components/onboarding/TutorialTopicCard";

export const metadata = {
  title: "Help & tutorials | NeuFin",
  description:
    "Getting started, portfolio upload, DNA score, regime, reports, and API workflows.",
};

export default function HelpTutorialsPage() {
  return (
    <div className="min-h-screen bg-app">
      <div className="page-container max-w-3xl py-10">
        <p className="text-label text-primary">Help center</p>
        <h1 className="mt-2 font-sans text-3xl font-bold text-navy">
          Tutorials & walkthroughs
        </h1>
        <p className="mt-2 text-readable">
          Self-serve guides. In-product tips use the same structure — launch
          vendors like Storylane or Guidde via env without coupling the core app.
        </p>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-navy">Interactive tour</h2>
          <div className="mt-3">
            <ProductTourEmbed />
          </div>
        </div>

        <div className="mt-10 space-y-8">
          {TUTORIAL_CATEGORIES.map((cat) => {
            const items = TUTORIALS.filter((t) => t.category === cat.id);
            if (!items.length) return null;
            return (
              <section key={cat.id}>
                <h2 className="text-sm font-bold uppercase tracking-wider text-readable">
                  {cat.label}
                </h2>
                <ul className="mt-3 space-y-3">
                  {items.map((t) => (
                    <li key={t.slug}>
                      <TutorialTopicCard t={t} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-readable">
          <Link href="/" className="font-medium text-primary-dark hover:underline">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
