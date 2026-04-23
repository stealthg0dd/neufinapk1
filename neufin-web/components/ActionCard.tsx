import { parseActionItem } from "@/utils/parseActionItem";

const SEVERITY_STYLES = {
  HIGH: "border-red-500 bg-red-500/10 text-red-400",
  MEDIUM: "border-amber-500 bg-amber-500/10 text-amber-400",
  LOW: "border-green-500 bg-green-500/10 text-green-400",
  INFO: "border-blue-400 bg-blue-400/10 text-blue-300",
} as const;

export function ActionCard({ raw }: { raw: string | object }) {
  const item = parseActionItem(raw);
  const styles = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.INFO;
  const chrome = styles.split(" ").slice(0, 2).join(" ");

  return (
    <div className={`my-2 rounded-r-lg border-l-4 p-3 ${chrome}`}>
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${styles}`}
        >
          {item.severity}
        </span>
        {item.time_horizon ? (
          <span className="text-xs text-[#52607a]">⏱ {item.time_horizon}</span>
        ) : null}
      </div>
      <p className="text-sm font-medium text-[#0f172a]">{item.action}</p>
      {item.rationale ? (
        <p className="mt-1 text-xs text-[#52607a]">Why: {item.rationale}</p>
      ) : null}
    </div>
  );
}
