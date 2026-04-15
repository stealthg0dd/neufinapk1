import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface PriceWarningProps {
  failedTickers: string[];
  onDismiss: () => void;
}

export const PriceWarningBanner: React.FC<PriceWarningProps> = ({
  failedTickers,
  onDismiss,
}) => {
  if (failedTickers.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-amber-950/90 border border-amber-500/50 backdrop-blur-md p-4 rounded-xl shadow-2xl flex items-start gap-3">
        <div className="p-2 bg-amber-500/20 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>

        <div className="flex-1">
          <h4 className="text-sm font-bold text-amber-100">
            Market Data Latency
          </h4>
          <p className="text-xs text-amber-200/80 leading-relaxed mt-1">
            Real-time verification failed for:{" "}
            <span className="font-mono font-bold text-amber-400">
              {failedTickers.join(", ")}
            </span>
            . Using last-known close prices.
          </p>
        </div>

        <button
          onClick={onDismiss}
          className="p-1 hover:bg-white/10 rounded-md transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-amber-400" />
        </button>
      </div>
    </div>
  );
};
