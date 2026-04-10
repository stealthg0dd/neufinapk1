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

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Lazy init — avoids Stripe/Supabase constructor at module load (CI builds often omit secrets). */
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' })
}

function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  const stripe = getStripe()
  if (!stripe) {
    console.error('[webhook] STRIPE_SECRET_KEY not set')
    return NextResponse.json(
      { error: 'Stripe not configured' },
      { status: 500 }
    )
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  const body = await req.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  console.log(`[webhook] Received: ${event.type}`)

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[webhook] Supabase service client not configured (URL or SUPABASE_SERVICE_ROLE_KEY missing)')
    return NextResponse.json({ received: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const email = session.customer_email
          || session.customer_details?.email
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        if (email) {
          await supabase
            .from('user_profiles')
            .update({
              subscription_tier: 'advisor',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              trial_started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('email', email)

          console.log(`[webhook] Upgraded to advisor: ${email}`)
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        await supabase
          .from('user_profiles')
          .update({
            subscription_tier: 'advisor',
            subscription_status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)

        console.log(`[webhook] Invoice paid for customer: ${customerId}`)
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        const status = sub.status

        await supabase
          .from('user_profiles')
          .update({
            subscription_status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)

        console.log(`[webhook] Sub updated: ${customerId} → ${status}`)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string

        await supabase
          .from('user_profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)

        console.log(`[webhook] Sub cancelled: ${customerId}`)
        break
      }

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`)
    }
  } catch (dbErr) {
    console.error('[webhook] Supabase update failed:', dbErr)
    // Return 200 to Stripe even on DB error — prevents retry storm
    // Log to Sentry here if available
  }

  return NextResponse.json({ received: true })
}
