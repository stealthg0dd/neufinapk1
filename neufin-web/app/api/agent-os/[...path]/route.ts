/**
 * Agent OS proxy route.
 * Forwards all /api/agent-os/* requests to the CTech Agent OS backend,
 * injecting the server-only x-api-key so the key never reaches the browser.
 *
 * Examples:
 *   GET  /api/agent-os/health             → Agent OS /health
 *   POST /api/agent-os/agent/neufin/pm    → Agent OS /agent/neufin/pm
 *   GET  /api/agent-os/router/status      → Agent OS /router/status
 *   GET  /api/agent-os/morning-engine/latest
 */

import { NextRequest, NextResponse } from "next/server";

const AGENT_OS_URL = process.env.AGENT_OS_URL || "http://localhost:8001";
const AGENT_OS_KEY = process.env.AGENT_OS_API_KEY || "";

async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const tail = path.join("/");
  const search = req.nextUrl.search;
  const target = `${AGENT_OS_URL}/${tail}${search}`;

  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    "x-api-key": AGENT_OS_KEY,
    ...(AGENT_OS_KEY ? { Authorization: `Bearer ${AGENT_OS_KEY}` } : {}),
  };

  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.text()
      : undefined;

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
  });

  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") || "application/json",
    },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
