/*
 * MANUAL SETUP REQUIRED:
 * Go to https://dashboard.stripe.com/webhooks
 * Add endpoint: https://neufin-web.vercel.app/api/stripe/webhook
 * Select events:
 *   - checkout.session.completed
 *   - invoice.paid
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 * Copy the signing secret to STRIPE_WEBHOOK_SECRET in Vercel env vars
 *
 * LOCAL + `stripe listen`:
 * The CLI prints a signing secret (whsec_…) that is NOT the same as Dashboard / Vercel.
 * Set STRIPE_WEBHOOK_SECRET_CLI in neufin-web/.env.local to that value. Leave
 * STRIPE_WEBHOOK_SECRET for production (Vercel). Do not commit real secrets into this file.
 */

/*
 * SUPABASE MIGRATION REQUIRED (run in Supabase SQL editor):
 *
 * ALTER TABLE user_profiles
 *   ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
 *   ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
 *   ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive',
 *   ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
 *
 * CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer
 *   ON user_profiles(stripe_customer_id);
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** App Router: force Node (raw body + Stripe SDK); Edge is unsupported here. */
export const runtime = "nodejs";

/** Never statically optimize — body must be read fresh per request. */
export const dynamic = "force-dynamic";

/** Lazy init — avoids Stripe/Supabase constructor at module load (CI builds often omit secrets). */
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** Trim + strip accidental wrapping quotes from .env (breaks signing if left in). */
function normalizeStripeWebhookSecret(
  raw: string | undefined,
): string | undefined {
  if (raw == null) return undefined;
  let s = raw.trim();
  if (s.length >= 2) {
    const q = s[0];
    if ((q === '"' || q === "'") && s.endsWith(q)) {
      s = s.slice(1, -1).trim();
    }
  }
  return s || undefined;
}

/**
 * Prefer STRIPE_WEBHOOK_SECRET_CLI whenever set (local `stripe listen`).
 * Do not set STRIPE_WEBHOOK_SECRET_CLI on Vercel — only STRIPE_WEBHOOK_SECRET there.
 */
function resolveWebhookSecret(): string | undefined {
  const cli = normalizeStripeWebhookSecret(
    process.env.STRIPE_WEBHOOK_SECRET_CLI,
  );
  if (cli) return cli;
  return normalizeStripeWebhookSecret(process.env.STRIPE_WEBHOOK_SECRET);
}

let warnedMissingCliSecret = false;

function warnIfLocalStripeListenSecretMissing(): void {
  if (warnedMissingCliSecret) return;
  warnedMissingCliSecret = true;
  if (process.env.VERCEL === "1") return;
  if (normalizeStripeWebhookSecret(process.env.STRIPE_WEBHOOK_SECRET_CLI))
    return;
  console.warn(
    "\n[webhook] STRIPE_WEBHOOK_SECRET_CLI is unset. `stripe listen` uses a different whsec_ than STRIPE_WEBHOOK_SECRET.\n" +
      "          Add to neufin-web/.env.local (use the whsec_ shown when you run stripe listen):\n" +
      "          STRIPE_WEBHOOK_SECRET_CLI=whsec_...\n",
  );
}

export async function POST(req: Request) {
  warnIfLocalStripeListenSecretMissing();

  // 1. MUST read raw text — never req.json() / formData first (breaks signing).
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = resolveWebhookSecret();

  if (process.env.NODE_ENV !== "production") {
    const rawForLog =
      process.env.STRIPE_WEBHOOK_SECRET_CLI ??
      process.env.STRIPE_WEBHOOK_SECRET;
    console.log("[webhook] stripe-signature present:", Boolean(sig));
    console.log(
      "[webhook] using secret from:",
      process.env.STRIPE_WEBHOOK_SECRET_CLI
        ? "STRIPE_WEBHOOK_SECRET_CLI"
        : "STRIPE_WEBHOOK_SECRET",
      "prefix:",
      rawForLog ? `${rawForLog.trim().slice(0, 12)}…` : "(missing)",
    );
  }

  if (!sig || !webhookSecret) {
    return new Response("Webhook Error: Missing signature or secret", {
      status: 400,
    });
  }

  const stripe = getStripe();
  if (!stripe) {
    console.error("[webhook] STRIPE_SECRET_KEY not set");
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Webhook signature verification failed.", message);
    const localHint =
      process.env.NODE_ENV !== "production"
        ? "\n\n[dev] Add STRIPE_WEBHOOK_SECRET_CLI=<whsec_ from `stripe listen`> to neufin-web/.env.local (must differ from STRIPE_WEBHOOK_SECRET). Restart next dev."
        : "";
    return new Response(`Webhook Error: ${message}${localHint}`, {
      status: 400,
    });
  }

  console.log(`[webhook] Received: ${event.type}`);

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error(
      "[webhook] Supabase service client not configured (URL or SUPABASE_SERVICE_ROLE_KEY missing)",
    );
    await reportStripeWebhookFailure("supabase_admin_missing", {
      stripe_event_id: event.id,
      stripe_event_type: event.type,
    });
    return NextResponse.json({ received: true });
  }

  try {
    await dispatchStripeWebhookEvent(supabase, event);
  } catch (handlerErr) {
    await reportStripeWebhookFailure(
      "webhook_handler_unhandled",
      {
        stripe_event_id: event.id,
        stripe_event_type: event.type,
      },
      handlerErr,
    );
  }

  return NextResponse.json({ received: true });
}

function emailDomainOnly(email: string | null | undefined): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  return email.split("@")[1]?.toLowerCase();
}

/** Paid user may not get upgraded if we swallow DB errors — log loudly + Sentry, still return 200 to Stripe. */
async function reportStripeWebhookFailure(
  reason: string,
  context: Record<string, unknown>,
  error?: unknown,
): Promise<void> {
  const payload = { reason, ...context, error };
  console.error(
    "[webhook] CRITICAL — subscription data may be out of sync:",
    payload,
  );

  try {
    const Sentry = await import("@sentry/nextjs");
    const err =
      error instanceof Error ? error : new Error(`[stripe webhook] ${reason}`);
    Sentry.captureException(err, {
      level: "error",
      tags: { area: "stripe_webhook", reason },
      extra: context,
    });
  } catch {
    /* Sentry unavailable (e.g. misconfigured DSN) — console above is enough */
  }
}

async function dispatchStripeWebhookEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const email =
        session.customer_email || session.customer_details?.email || null;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!email) {
        await reportStripeWebhookFailure(
          "checkout.session.completed_missing_email",
          {
            stripe_event_id: event.id,
            checkout_session_id: session.id,
            customer_id: customerId ?? null,
          },
        );
        return;
      }

      const { data: rows, error } = await supabase
        .from("user_profiles")
        .update({
          subscription_tier: "advisor",
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: subscriptionId ?? null,
          trial_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("email", email)
        .select("id");

      if (error) {
        await reportStripeWebhookFailure(
          "checkout.session.completed_supabase_error",
          {
            stripe_event_id: event.id,
            checkout_session_id: session.id,
            customer_id: customerId ?? null,
            email_domain: emailDomainOnly(email),
          },
          error,
        );
        return;
      }

      if (!rows?.length) {
        await reportStripeWebhookFailure(
          "checkout.session.completed_no_profile_row",
          {
            stripe_event_id: event.id,
            checkout_session_id: session.id,
            customer_id: customerId ?? null,
            email_domain: emailDomainOnly(email),
            hint: "No user_profiles row matched this checkout email — paid user may need manual tier fix",
          },
          new Error(
            "No user_profiles row updated for checkout.session.completed",
          ),
        );
        return;
      }

      console.log(
        `[webhook] Upgraded to advisor: ${email_domain_only_log(email)}`,
      );
      return;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;
      if (!customerId) {
        await reportStripeWebhookFailure("invoice.paid_missing_customer", {
          stripe_event_id: event.id,
          invoice_id: invoice.id,
        });
        return;
      }

      const { data: rows, error } = await supabase
        .from("user_profiles")
        .update({
          subscription_tier: "advisor",
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId)
        .select("id");

      if (error) {
        await reportStripeWebhookFailure(
          "invoice.paid_supabase_error",
          {
            stripe_event_id: event.id,
            invoice_id: invoice.id,
            customer_id: customerId,
          },
          error,
        );
        return;
      }

      if (!rows?.length) {
        await reportStripeWebhookFailure(
          "invoice.paid_no_profile_row",
          {
            stripe_event_id: event.id,
            invoice_id: invoice.id,
            customer_id: customerId,
          },
          new Error("No user_profiles row matched stripe_customer_id"),
        );
        return;
      }

      console.log(`[webhook] Invoice paid for customer: ${customerId}`);
      return;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (!customerId) {
        await reportStripeWebhookFailure(
          "subscription.updated_missing_customer",
          {
            stripe_event_id: event.id,
            subscription_id: sub.id,
          },
        );
        return;
      }

      const { data: rows, error } = await supabase
        .from("user_profiles")
        .update({
          subscription_status: sub.status,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId)
        .select("id");

      if (error) {
        await reportStripeWebhookFailure(
          "subscription.updated_supabase_error",
          {
            stripe_event_id: event.id,
            subscription_id: sub.id,
            customer_id: customerId,
          },
          error,
        );
        return;
      }

      if (!rows?.length) {
        await reportStripeWebhookFailure(
          "subscription.updated_no_profile_row",
          {
            stripe_event_id: event.id,
            subscription_id: sub.id,
            customer_id: customerId,
          },
          new Error("No user_profiles row matched"),
        );
        return;
      }

      console.log(`[webhook] Sub updated: ${customerId} → ${sub.status}`);
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      if (!customerId) {
        await reportStripeWebhookFailure(
          "subscription.deleted_missing_customer",
          {
            stripe_event_id: event.id,
            subscription_id: sub.id,
          },
        );
        return;
      }

      const { data: rows, error } = await supabase
        .from("user_profiles")
        .update({
          subscription_tier: "free",
          subscription_status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_customer_id", customerId)
        .select("id");

      if (error) {
        await reportStripeWebhookFailure(
          "subscription.deleted_supabase_error",
          {
            stripe_event_id: event.id,
            subscription_id: sub.id,
            customer_id: customerId,
          },
          error,
        );
        return;
      }

      if (!rows?.length) {
        await reportStripeWebhookFailure(
          "subscription.deleted_no_profile_row",
          {
            stripe_event_id: event.id,
            subscription_id: sub.id,
            customer_id: customerId,
          },
          new Error("No user_profiles row matched"),
        );
        return;
      }

      console.log(`[webhook] Sub cancelled: ${customerId}`);
      return;
    }

    default:
      console.log(`[webhook] Unhandled event type: ${event.type}`);
  }
}

function email_domain_only_log(email: string): string {
  const d = emailDomainOnly(email);
  return d ? `*@${d}` : "(redacted)";
}
