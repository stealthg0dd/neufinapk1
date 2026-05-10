"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getSubscription, type SubscriptionInfo } from "@/lib/api";
import { apiFetch, apiGet } from "@/lib/api-client";
import { canAccessAdvisorProduct } from "@/lib/advisor-access";
import { isAdvisorModeEnabled } from "@/lib/featureFlags";

type CommType = "email" | "whatsapp" | "pdf" | "talking_points";

type ClientRow = { id: string; display_name?: string | null };

type ClientsResponse = { clients: ClientRow[] };

type CommRow = {
  id: string;
  client_id: string;
  channel?: string;
  subject?: string | null;
  body?: string | null;
  status?: string | null;
  sent_at?: string | null;
  compliance_status?: string | null;
  communication_type?: string | null;
  created_at?: string | null;
  metadata?: { disclaimer?: string };
};

type ListResponse = { communications: CommRow[] };

type GenerateResponse = {
  id: string;
  subject: string;
  content: string;
  disclaimer: string;
  compliance_status?: string;
  status?: string;
  type?: CommType;
};

const TYPE_LABELS: Record<CommType, string> = {
  email: "Client email",
  whatsapp: "WhatsApp summary",
  pdf: "PDF memo (client summary)",
  talking_points: "Advisor talking points",
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CommunicationsStudioPage() {
  const searchParams = useSearchParams();
  const { token, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [clientId, setClientId] = useState("");
  const [commType, setCommType] = useState<CommType>("email");
  const [contextNotes, setContextNotes] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [disclaimer, setDisclaimer] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<CommType | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const advisorMode = isAdvisorModeEnabled();
  const entitled = canAccessAdvisorProduct(sub);

  useEffect(() => {
    if (!token) {
      setSub(null);
      return;
    }
    void getSubscription(token)
      .then(setSub)
      .catch(() => setSub(null));
  }, [token]);

  useEffect(() => {
    const c = searchParams.get("client");
    const t = searchParams.get("type") as CommType | null;
    if (c) setClientId(c);
    if (t && ["email", "whatsapp", "pdf", "talking_points"].includes(t)) {
      setCommType(t);
    }
  }, [searchParams]);

  const { data: clientList } = useSWR(
    advisorMode && entitled && token ? "/api/advisor/clients" : null,
    (url: string) => apiGet<ClientsResponse>(url),
  );
  const clients = useMemo(
    () =>
      (clientList?.clients ?? []).map((c) => ({
        id: c.id,
        label: c.display_name ?? `Client ${c.id.slice(0, 8)}`,
      })),
    [clientList],
  );

  const listKey =
    advisorMode && entitled && token && clientId.trim()
      ? `/api/advisor/communications?client_id=${encodeURIComponent(clientId.trim())}`
      : null;

  const { data: listData, mutate: mutateList } = useSWR(
    listKey,
    (url: string) => apiGet<ListResponse>(url),
  );

  const rows = listData?.communications ?? [];

  const loadRowIntoEditor = useCallback((row: CommRow) => {
    setSelectedId(row.id);
    setSubject(row.subject ?? "");
    setBody(row.body ?? "");
    const d =
      row.metadata && typeof row.metadata === "object" && "disclaimer" in row.metadata
        ? String((row.metadata as { disclaimer?: string }).disclaimer ?? "")
        : "";
    setDisclaimer(d);
    const ct = row.communication_type as CommType | undefined;
    setSelectedType(ct ?? null);
    setSelectedStatus(row.status ?? null);
  }, []);

  const onGenerate = useCallback(async () => {
    if (!clientId.trim()) {
      setToast("Select a client first.");
      setTimeout(() => setToast(null), 3500);
      return;
    }
    setGenerating(true);
    setToast(null);
    try {
      const res = await apiFetch("/api/advisor/communications/generate", {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId.trim(),
          type: commType,
          context_notes: contextNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const d = j.detail;
        const msg =
          typeof d === "string"
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x.msg).join(", ")
              : "Generation failed";
        throw new Error(msg);
      }
      const data = (await res.json()) as GenerateResponse;
      setSelectedId(data.id);
      setSubject(data.subject ?? "");
      setBody(data.content ?? "");
      setDisclaimer(data.disclaimer ?? "");
      setSelectedType((data.type as CommType) ?? commType);
      setSelectedStatus(data.status ?? "draft");
      await mutateList();
      setToast("Draft saved. Review before sending from your own channels.");
      setTimeout(() => setToast(null), 4000);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : "Could not generate.");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setGenerating(false);
    }
  }, [clientId, commType, contextNotes, mutateList]);

  const patchComm = async (payload: Record<string, unknown>) => {
    if (!selectedId) throw new Error("Nothing selected.");
    const res = await apiFetch(
      `/api/advisor/communications/${encodeURIComponent(selectedId)}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const d = j.detail;
      const msg =
        typeof d === "string"
          ? d
          : Array.isArray(d)
            ? d.map((x: { msg?: string }) => x.msg).join(", ")
            : "Update failed";
      throw new Error(msg);
    }
    return res.json() as Promise<CommRow>;
  };

  const onSaveDraft = async () => {
    if (!selectedId) {
      setToast("Generate or select a communication first.");
      setTimeout(() => setToast(null), 3500);
      return;
    }
    setSaving(true);
    try {
      const updated = await patchComm({
        subject,
        body,
        status: "draft",
      });
      setSelectedStatus(updated.status ?? "draft");
      await mutateList();
      setToast("Draft saved.");
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : "Save failed.");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const onApproveAndDownload = async () => {
    if (!selectedId) {
      setToast("Generate or select a communication first.");
      setTimeout(() => setToast(null), 3500);
      return;
    }
    setSaving(true);
    try {
      await patchComm({ subject, body, status: "approved" });
      setSelectedStatus("approved");
      const effType = selectedType ?? commType;
      if (effType === "pdf") {
        const res = await apiFetch(
          `/api/advisor/communications/${encodeURIComponent(selectedId)}/pdf`,
        );
        if (!res.ok) {
          throw new Error("Could not build PDF.");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "client-summary.pdf";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const text = `${subject}\n\n${body}\n\n---\n${disclaimer || ""}\n`;
        const ext =
          effType === "whatsapp"
            ? "txt"
            : effType === "talking_points"
              ? "txt"
              : "txt";
        downloadText(`communication-${selectedId.slice(0, 8)}.${ext}`, text);
      }
      await mutateList();
      setToast("Marked approved. File ready — send from your own email or WhatsApp.");
      setTimeout(() => setToast(null), 4500);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : "Approve/download failed.");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const onMarkSent = async () => {
    if (!selectedId) {
      setToast("Select a communication.");
      setTimeout(() => setToast(null), 3500);
      return;
    }
    setSaving(true);
    try {
      const updated = await patchComm({ status: "sent" });
      setSelectedStatus(updated.status ?? "sent");
      await mutateList();
      setToast("Logged as sent (you delivered this outside NeuFin).");
      setTimeout(() => setToast(null), 4000);
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : "Update failed.");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!advisorMode || !entitled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-xl font-semibold text-navy">Communication studio</h1>
        <p className="mt-2 text-sm text-muted2">
          Advisor access and advisor mode are required. NeuFin drafts messages; you send
          them from your own email or WhatsApp.
        </p>
        <Link href="/pricing" className="mt-4 inline-block text-sm text-primary">
          View plans →
        </Link>
      </div>
    );
  }

  const activeType = selectedType ?? commType;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl flex-col px-4 pb-28 pt-6 md:px-6">
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/morning-brief" className="text-muted2 hover:text-primary-dark">
          Morning brief
        </Link>
        <span className="text-border">|</span>
        <Link href="/advisor/clients" className="text-muted2 hover:text-primary-dark">
          Client book
        </Link>
        <span className="text-border">|</span>
        <Link href="/dashboard/meeting-prep" className="text-muted2 hover:text-primary-dark">
          Meeting prep
        </Link>
      </div>

      <header className="mb-6">
        <p className="text-label">Advisor</p>
        <h1 className="text-2xl font-bold text-navy">Client communication studio</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted2">
          Generate client-ready drafts (email, WhatsApp, PDF memo, or talking points).
          NeuFin never sends on your behalf: review here, then send from your own channels.
        </p>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-h-0 flex-col space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-3 border-b border-border pb-4">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted2">Client</label>
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setSelectedId(null);
                  setSubject("");
                  setBody("");
                  setDisclaimer("");
                }}
                className="input-base w-full text-sm"
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-xs font-medium text-muted2">Type</label>
              <select
                value={commType}
                onChange={(e) => setCommType(e.target.value as CommType)}
                className="input-base w-full text-sm"
              >
                {(Object.keys(TYPE_LABELS) as CommType[]).map((k) => (
                  <option key={k} value={k}>
                    {TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full items-end sm:w-auto">
              <button
                type="button"
                disabled={generating || !clientId.trim()}
                onClick={() => void onGenerate()}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {generating ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </span>
                ) : (
                  "Generate Client Message"
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted2">
              Context notes (optional)
            </label>
            <textarea
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              rows={2}
              placeholder="e.g. client prefers plain language; follow-up after regime shift..."
              className="input-base w-full resize-y text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted2">Subject / title</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input-base w-full text-sm"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <label className="mb-1 block text-xs font-medium text-muted2">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="input-base min-h-[280px] w-full flex-1 resize-y font-sans text-sm leading-relaxed"
              spellCheck
            />
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-2/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted2">
                History for this client
              </p>
              <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => loadRowIntoEditor(r)}
                      className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-white ${
                        selectedId === r.id ? "bg-white ring-1 ring-primary/30" : ""
                      }`}
                    >
                      <span className="font-medium text-navy">
                        {(r.communication_type ?? r.channel ?? "note").toString()}
                      </span>
                      <span className="text-muted2"> · </span>
                      <span className="text-muted2">{r.status ?? "draft"}</span>
                      <span className="block truncate text-xs text-muted2">
                        {r.subject ?? "(no subject)"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-bold uppercase tracking-wide text-primary">Metadata</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted2">Client</dt>
              <dd className="font-medium text-navy">
                {clients.find((c) => c.id === clientId)?.label ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted2">Communication type</dt>
              <dd className="text-readable">{TYPE_LABELS[activeType] ?? activeType}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted2">Record status</dt>
              <dd className="capitalize text-readable">{selectedStatus ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted2">Compliance</dt>
              <dd className="text-readable text-xs leading-snug">
                Drafts require advisor review. No outbound send from NeuFin. Disclaimer
                below is for your client materials only.
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted2">Disclaimer (reference)</dt>
              <dd className="max-h-40 overflow-y-auto text-xs leading-snug text-muted2">
                {disclaimer || "—"}
              </dd>
            </div>
          </dl>
          <p className="rounded-md bg-amber-50 px-2 py-2 text-xs text-amber-950 ring-1 ring-amber-200">
            There is no Send button. Copy or download, then send from your own email or
            WhatsApp so your compliance and archiving stay in your systems.
          </p>
        </aside>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur md:pl-[var(--sidebar-width,0px)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving || !selectedId}
            onClick={() => void onSaveDraft()}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            type="button"
            disabled={saving || !selectedId}
            onClick={() => void onApproveAndDownload()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            Approve &amp; Download
          </button>
          <button
            type="button"
            disabled={saving || !selectedId}
            onClick={() => void onMarkSent()}
            className="rounded-lg border border-primary/40 bg-primary-light px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary-light/80 disabled:opacity-50"
          >
            Mark as Sent
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 max-w-lg -translate-x-1/2 rounded-lg bg-navy px-4 py-2 text-center text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
