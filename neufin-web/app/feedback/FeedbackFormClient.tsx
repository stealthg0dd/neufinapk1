"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

type FormState = {
  name: string;
  email: string;
  role: string;
  how_heard: string;
  first_action: string;
  landing_rating: number;
  first_impression: string;
  csv_upload: string;
  dna_score: string;
  swarm: string;
  ai_rating: number;
  regime: string;
  nav_ease: number;
  speed_feel: number;
  confusing_parts: string[];
  bugs: string;
  valuable_features: string[];
  missing: string;
  compare: string;
  nps: number | null;
  pay_intent: string;
  price_preference: string;
  fix_priority: string;
  impressive: string;
  ux_change: string;
  other: string;
  call_ok: string;
};

const REQUIRED_KEYS: Array<keyof FormState> = [
  "name",
  "role",
  "first_action",
  "landing_rating",
  "csv_upload",
  "dna_score",
  "swarm",
  "ai_rating",
  "nav_ease",
  "speed_feel",
  "nps",
  "pay_intent",
  "fix_priority",
];

const initState: FormState = {
  name: "",
  email: "",
  role: "",
  how_heard: "",
  first_action: "",
  landing_rating: 0,
  first_impression: "",
  csv_upload: "",
  dna_score: "",
  swarm: "",
  ai_rating: 0,
  regime: "",
  nav_ease: 0,
  speed_feel: 0,
  confusing_parts: [],
  bugs: "",
  valuable_features: [],
  missing: "",
  compare: "",
  nps: null,
  pay_intent: "",
  price_preference: "",
  fix_priority: "",
  impressive: "",
  ux_change: "",
  other: "",
  call_ok: "",
};

export default function FeedbackFormClient() {
  const [form, setForm] = useState<FormState>(initState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const requiredAnswered = useMemo(
    () =>
      REQUIRED_KEYS.filter((k) => {
        const v = form[k];
        if (v === null) return false;
        if (typeof v === "number") return v > 0;
        if (Array.isArray(v)) return v.length > 0;
        return String(v).trim().length > 0;
      }).length,
    [form],
  );
  const progress = Math.round((requiredAnswered / REQUIRED_KEYS.length) * 100);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requiredAnswered < REQUIRED_KEYS.length) {
      toast.error("Please complete all required fields first.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        confusing_parts: form.confusing_parts.join(", "),
        valuable_features: form.valuable_features.join(", "),
        source: "neufin-web-feedback",
        submitted_at: new Date().toISOString(),
      };
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("submit failed");
      setSubmitted(true);
    } catch {
      toast.error("Failed to submit feedback. Please try again.");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0B0F14] px-6 py-section text-foreground">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/30 bg-primary/20 font-mono text-2xl font-bold text-primary">
            N
          </div>
          <CheckCircle2 className="mx-auto mb-3 h-7 w-7 text-positive" />
          <h1 className="text-2xl font-semibold">Thank you, {form.name}.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your feedback has been submitted and will be read by Varun, Ha, and
            Ray personally.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            If you opted in for a call, we&apos;ll reach out within 48 hours via{" "}
            {form.email || "your email"}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F14] text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-section">
        <h1 className="text-3xl font-semibold">NeuFin Beta Feedback</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Takes 5 minutes. Read by the founding team.
        </p>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {requiredAnswered} of {REQUIRED_KEYS.length} required fields
              answered
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-6">
          <Section title="1. About you">
            <Input
              label="Name*"
              value={form.name}
              onChange={(v) => setForm((s) => ({ ...s, name: v }))}
            />
            <Input
              label="Email"
              value={form.email}
              onChange={(v) => setForm((s) => ({ ...s, email: v }))}
            />
            <Input
              label="Role*"
              value={form.role}
              onChange={(v) => setForm((s) => ({ ...s, role: v }))}
            />
            <Input
              label="How did you hear about NeuFin?"
              value={form.how_heard}
              onChange={(v) => setForm((s) => ({ ...s, how_heard: v }))}
            />
          </Section>

          <Section title="2. First impressions">
            <Input
              label="First action after landing*"
              value={form.first_action}
              onChange={(v) => setForm((s) => ({ ...s, first_action: v }))}
            />
            <Star
              label="Landing page rating*"
              value={form.landing_rating}
              onChange={(v) => setForm((s) => ({ ...s, landing_rating: v }))}
            />
            <Textarea
              label="First dashboard impression"
              value={form.first_impression}
              onChange={(v) => setForm((s) => ({ ...s, first_impression: v }))}
            />
          </Section>

          <Section title="3. Core features">
            <Input
              label="CSV upload experience*"
              value={form.csv_upload}
              onChange={(v) => setForm((s) => ({ ...s, csv_upload: v }))}
            />
            <Input
              label="DNA score usefulness*"
              value={form.dna_score}
              onChange={(v) => setForm((s) => ({ ...s, dna_score: v }))}
            />
            <Input
              label="Swarm analysis experience*"
              value={form.swarm}
              onChange={(v) => setForm((s) => ({ ...s, swarm: v }))}
            />
            <Star
              label="AI analysis quality*"
              value={form.ai_rating}
              onChange={(v) => setForm((s) => ({ ...s, ai_rating: v }))}
            />
            <Input
              label="Market regime usefulness"
              value={form.regime}
              onChange={(v) => setForm((s) => ({ ...s, regime: v }))}
            />
          </Section>

          <Section title="4. Usability">
            <Scale
              label="Navigation ease*"
              value={form.nav_ease}
              onChange={(v) => setForm((s) => ({ ...s, nav_ease: v }))}
            />
            <Scale
              label="Speed/performance*"
              value={form.speed_feel}
              onChange={(v) => setForm((s) => ({ ...s, speed_feel: v }))}
            />
            <Pills
              label="What was confusing?"
              options={[
                "Pricing",
                "Charts",
                "Swarm output",
                "Upload flow",
                "Navigation",
                "Billing",
              ]}
              values={form.confusing_parts}
              onToggle={(v) => toggleArray("confusing_parts", v)}
            />
            <Textarea
              label="Bugs or errors"
              value={form.bugs}
              onChange={(v) => setForm((s) => ({ ...s, bugs: v }))}
            />
          </Section>

          <Section title="5. Value & relevance">
            <Pills
              label="Most valuable features"
              options={[
                "DNA score",
                "Swarm report",
                "Research feed",
                "Market regime",
                "Portfolio charts",
              ]}
              values={form.valuable_features}
              onToggle={(v) => toggleArray("valuable_features", v)}
            />
            <Textarea
              label="What is missing?"
              value={form.missing}
              onChange={(v) => setForm((s) => ({ ...s, missing: v }))}
            />
            <Input
              label="Compare vs your current tools"
              value={form.compare}
              onChange={(v) => setForm((s) => ({ ...s, compare: v }))}
            />
          </Section>

          <Section title="6. NPS & intent">
            <Scale10
              label="NPS (0-10)*"
              value={form.nps}
              onChange={(v) => setForm((s) => ({ ...s, nps: v }))}
            />
            <Input
              label="Would you pay after trial?*"
              value={form.pay_intent}
              onChange={(v) => setForm((s) => ({ ...s, pay_intent: v }))}
            />
            <PillsSingle
              label="Price preference"
              options={["$49", "$99", "$299", "Enterprise"]}
              value={form.price_preference}
              onChange={(v) => setForm((s) => ({ ...s, price_preference: v }))}
            />
          </Section>

          <Section title="7. Open feedback">
            <Textarea
              label="Most important thing to fix*"
              value={form.fix_priority}
              onChange={(v) => setForm((s) => ({ ...s, fix_priority: v }))}
            />
            <Textarea
              label="Most impressive thing"
              value={form.impressive}
              onChange={(v) => setForm((s) => ({ ...s, impressive: v }))}
            />
            <Textarea
              label="One UX change you'd make"
              value={form.ux_change}
              onChange={(v) => setForm((s) => ({ ...s, ux_change: v }))}
            />
            <Textarea
              label="Other notes"
              value={form.other}
              onChange={(v) => setForm((s) => ({ ...s, other: v }))}
            />
            <Input
              label="Open to a call?"
              value={form.call_ok}
              onChange={(v) => setForm((s) => ({ ...s, call_ok: v }))}
            />
          </Section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit feedback"}
          </button>
        </form>
      </div>
    </div>
  );

  function toggleArray(
    field: "confusing_parts" | "valuable_features",
    value: string,
  ) {
    setForm((s) => {
      const arr = s[field];
      return {
        ...s,
        [field]: arr.includes(value)
          ? arr.filter((x) => x !== value)
          : [...arr, value],
      };
    });
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-surface/40 p-5">
      <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-primary">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm text-foreground">
      <span className="mb-1.5 block text-xs text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm text-foreground">
      <span className="mb-1.5 block text-xs text-muted-foreground">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
      />
    </label>
  );
}

function Star({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`rounded px-2 py-1 text-lg ${value >= n ? "text-warning" : "text-muted-foreground"}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`rounded-md border px-3 py-1 text-xs ${value === n ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Scale10({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="grid grid-cols-6 gap-2 md:grid-cols-11">
        {Array.from({ length: 11 }).map((_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`rounded-md border px-2 py-1 text-xs ${value === n ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Pills({
  label,
  options,
  values,
  onToggle,
}: {
  label: string;
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`rounded-full border px-3 py-1 text-xs ${values.includes(o) ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function PillsSingle({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded-full border px-3 py-1 text-xs ${value === o ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
