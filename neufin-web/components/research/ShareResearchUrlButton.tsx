"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Share2 } from "lucide-react";

export function ShareResearchUrlButton() {
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try {
      setBusy(true);
      const url = typeof window !== "undefined" ? window.location.href : "";
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface"
    >
      <Share2 className="h-3.5 w-3.5" />
      Share
    </button>
  );
}
