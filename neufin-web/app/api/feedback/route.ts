import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

function stars(n: number) {
  return n ? "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n)) : "Not rated";
}

function npsLabel(n: number) {
  return n >= 9 ? "Promoter" : n >= 7 ? "Passive" : "Detractor";
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("[feedback] RESEND_API_KEY missing");
      return NextResponse.json(
        { error: "Feedback email service unavailable" },
        { status: 500 },
      );
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const data = (await request.json()) as Record<string, unknown>;

    const missingRequired =
      !data?.name || data?.nps === undefined || !data?.pay_intent;
    if (missingRequired) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, sans-serif; max-width: 700px; margin: 0 auto;
    padding: 24px; color: #111; background: #f5f5f0; }
  .card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb;
    padding: 24px; margin-bottom: 16px; }
  .badge { display: inline-block; background: #0B0F14; color: #1EB8CC;
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
    padding: 4px 10px; border-radius: 20px; margin-bottom: 16px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  .meta { font-size: 13px; color: #6B7280; margin-bottom: 0; }
  h2 { font-size: 13px; font-weight: 600; letter-spacing: 0.07em;
    text-transform: uppercase; color: #9CA3AF; margin: 0 0 14px;
    padding-bottom: 8px; border-bottom: 1px solid #F3F4F6; }
  .row { display: flex; gap: 16px; margin-bottom: 10px; }
  .label { font-size: 13px; color: #6B7280; min-width: 180px; flex-shrink: 0; }
  .value { font-size: 13px; color: #111; font-weight: 500; flex: 1; }
  .nps-score { font-size: 40px; font-weight: 700; color: #059669; }
  .nps-label { font-size: 13px; color: #6B7280; }
  .stars { font-size: 18px; color: #F59E0B; letter-spacing: 2px; }
  .pill { display: inline-block; background: #F3F4F6; color: #374151;
    font-size: 12px; padding: 3px 10px; border-radius: 20px;
    margin: 2px 2px 2px 0; }
  .open-answer { background: #F9FAFB; border-left: 3px solid #1EB8CC;
    border-radius: 0 8px 8px 0; padding: 12px 14px; font-size: 14px;
    color: #111; line-height: 1.6; white-space: pre-wrap; margin-top: 4px; }
  .footer { font-size: 12px; color: #9CA3AF; text-align: center;
    padding: 16px 0 0; }
</style>
</head>
<body>
<div class="badge">NeuFin Beta Feedback</div>
<div class="card">
  <h1>${String(data.name ?? "")}</h1>
  <p class="meta">${String(data.email ?? "No email provided")} &nbsp;·&nbsp;
    ${String(data.role ?? "Role not specified")} &nbsp;·&nbsp;
    ${new Date(String(data.submitted_at ?? Date.now())).toLocaleString(
      "en-SG",
      {
        timeZone: "Asia/Singapore",
        dateStyle: "medium",
        timeStyle: "short",
      },
    )} SGT</p>
</div>
<div class="card">
  <h2>NPS &amp; Intent</h2>
  <div style="display:flex;align-items:center;gap:20px;margin-bottom:16px">
    <div>
      <div class="nps-score">${String(data.nps ?? "—")}</div>
      <div class="nps-label">NPS Score · ${data.nps !== null && data.nps !== undefined ? npsLabel(Number(data.nps)) : "—"}</div>
    </div>
    <div style="flex:1">
      <div class="row"><span class="label">Would pay after trial</span><span class="value">${String(data.pay_intent ?? "—")}</span></div>
      <div class="row"><span class="label">Price preference</span><span class="value">${String(data.price_preference ?? "—")}</span></div>
      <div class="row"><span class="label">Call availability</span><span class="value">${String(data.call_ok ?? "—")}</span></div>
    </div>
  </div>
</div>
<div class="card">
  <h2>Feature Ratings</h2>
  <div class="row"><span class="label">Landing page</span><span class="value"><span class="stars">${stars(Number(data.landing_rating ?? 0))}</span> (${String(data.landing_rating ?? 0)}/5)</span></div>
  <div class="row"><span class="label">AI analysis quality</span><span class="value"><span class="stars">${stars(Number(data.ai_rating ?? 0))}</span> (${String(data.ai_rating ?? 0)}/5)</span></div>
  <div class="row"><span class="label">Navigation ease</span><span class="value">${String(data.nav_ease ?? "—")} / 5</span></div>
  <div class="row"><span class="label">Speed / performance</span><span class="value">${String(data.speed_feel ?? "—")} / 5</span></div>
</div>
<div class="card">
  <h2>Feature Journey</h2>
  <div class="row"><span class="label">First impression</span><span class="value">${String(data.first_action ?? "—")}</span></div>
  <div class="row"><span class="label">CSV upload</span><span class="value">${String(data.csv_upload ?? "—")}</span></div>
  <div class="row"><span class="label">DNA score</span><span class="value">${String(data.dna_score ?? "—")}</span></div>
  <div class="row"><span class="label">Swarm analysis</span><span class="value">${String(data.swarm ?? "—")}</span></div>
  <div class="row"><span class="label">Market regime</span><span class="value">${String(data.regime ?? "—")}</span></div>
  <div class="row"><span class="label">Comparison to current tools</span><span class="value">${String(data.compare ?? "—")}</span></div>
</div>
<div class="card">
  <h2>What was confusing</h2>
  ${
    String(data.confusing_parts ?? "")
      .split(", ")
      .filter(Boolean)
      .map((p) => `<span class="pill">${p}</span>`)
      .join("") ||
    '<span style="color:#9CA3AF;font-size:13px">Nothing selected</span>'
  }
</div>
<div class="card">
  <h2>Most valuable features</h2>
  ${
    String(data.valuable_features ?? "")
      .split(", ")
      .filter(Boolean)
      .map((p) => `<span class="pill">${p}</span>`)
      .join("") ||
    '<span style="color:#9CA3AF;font-size:13px">Nothing selected</span>'
  }
</div>
${data.bugs ? `<div class="card"><h2>Bugs &amp; errors reported</h2><div class="open-answer">${String(data.bugs)}</div></div>` : ""}
${data.fix_priority ? `<div class="card"><h2>Most important thing to fix</h2><div class="open-answer">${String(data.fix_priority)}</div></div>` : ""}
${data.impressive ? `<div class="card"><h2>Most impressive thing</h2><div class="open-answer">${String(data.impressive)}</div></div>` : ""}
${data.first_impression ? `<div class="card"><h2>First dashboard impression</h2><div class="open-answer">${String(data.first_impression)}</div></div>` : ""}
${data.missing ? `<div class="card"><h2>What's missing</h2><div class="open-answer">${String(data.missing)}</div></div>` : ""}
${data.ux_change ? `<div class="card"><h2>UX change they'd make</h2><div class="open-answer">${String(data.ux_change)}</div></div>` : ""}
${data.other ? `<div class="card"><h2>Other notes</h2><div class="open-answer">${String(data.other)}</div></div>` : ""}
<div class="footer">
  Submitted via NeuFin Beta Feedback Form ·
  ${new Date(String(data.submitted_at ?? Date.now())).toISOString()} ·
  Source: ${String(data.source ?? "Not specified")}
</div>
</body>
</html>`;

    const fromEmail =
      process.env.FEEDBACK_FROM_EMAIL ||
      process.env.RESEND_FROM_EMAIL ||
      "onboarding@resend.dev";
    const emailResult = await resend.emails.send({
      from: `NeuFin Feedback <${fromEmail}>`,
      to: ["info@neufin.ai"],
      replyTo: String(data.email || "info@neufin.ai"),
      subject: `[Beta Feedback] ${String(data.name)} · NPS ${String(data.nps ?? "?")} · ${String(data.pay_intent || "Undecided")}`,
      html: emailHtml,
    });

    if (emailResult.error) {
      console.error("[feedback] Resend error:", {
        error: emailResult.error,
        fromEmail,
        to: "info@neufin.ai",
      });
      return NextResponse.json(
        {
          error: "Failed to send feedback email",
          detail:
            "Email delivery failed. Verify RESEND_API_KEY and FEEDBACK_FROM_EMAIL domain settings.",
        },
        { status: 500 },
      );
    }

    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      await supabase.from("beta_feedback").insert({
        name: data.name,
        email: data.email,
        role: data.role,
        nps_score: data.nps,
        pay_intent: data.pay_intent,
        landing_rating: data.landing_rating,
        ai_rating: data.ai_rating,
        nav_ease: data.nav_ease,
        speed_feel: data.speed_feel,
        csv_upload: data.csv_upload,
        dna_score: data.dna_score,
        swarm_used: data.swarm,
        confusing_parts: data.confusing_parts,
        valuable_features: data.valuable_features,
        fix_priority: data.fix_priority,
        impressive: data.impressive,
        call_requested: data.call_ok,
        raw_data: data,
        submitted_at: data.submitted_at || new Date().toISOString(),
      });
    } catch (dbErr) {
      console.error("[feedback] Supabase insert failed (non-fatal):", dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[feedback] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
