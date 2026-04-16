"use client";

import { useEffect, useState } from "react";

export type ReportTheme = "dark" | "light";
export type ReportMode = "standard" | "ic_memo" | "advisor_report";

const STORAGE_KEY = "neufin-report-theme";
const MODE_STORAGE_KEY = "neufin-report-mode";

export function getStoredReportTheme(): ReportTheme {
  if (typeof window === "undefined") return "light";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" ? v : "light";
}

export function storeReportTheme(theme: ReportTheme) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, theme);
  }
}

export function getStoredReportMode(): ReportMode {
  if (typeof window === "undefined") return "standard";
  const v = localStorage.getItem(MODE_STORAGE_KEY);
  return v === "standard" || v === "ic_memo" || v === "advisor_report" ? v : "standard";
}

export function storeReportMode(mode: ReportMode) {
  if (typeof window !== "undefined") {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }
}

const REPORT_MODES: Array<{
  value: ReportMode;
  label: string;
  description: string;
}> = [
  {
    value: "standard",
    label: "Standard Report",
    description: "Full portfolio briefing with all sections",
  },
  {
    value: "ic_memo",
    label: "IC Memo",
    description: "Institutional committee format · concise executive + risk",
  },
  {
    value: "advisor_report",
    label: "Advisor Report",
    description: "Client-ready narrative with institutional diagnostics",
  },
];

interface ReportThemeModalProps {
  onSelect: (theme: ReportTheme, mode: ReportMode) => void;
  onClose: () => void;
}

export function ReportThemeModal({ onSelect, onClose }: ReportThemeModalProps) {
  const [hovered, setHovered] = useState<ReportTheme | null>(null);
  const [selectedMode, setSelectedMode] = useState<ReportMode>(
    getStoredReportMode(),
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSelect = (theme: ReportTheme) => {
    storeReportTheme(theme);
    storeReportMode(selectedMode);
    onSelect(theme, selectedMode);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(11, 15, 20, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#161D2E",
          border: "1px solid #2A3550",
          borderRadius: 16,
          padding: "32px 36px",
          maxWidth: 520,
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: "#F0F4FF", fontSize: 17, fontWeight: 700 }}>
            Choose Report Style
          </div>
          <div style={{ color: "#64748B", fontSize: 12, marginTop: 4 }}>
            Your preference will be remembered for future reports.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          {/* Dark theme */}
          <button
            onMouseEnter={() => setHovered("dark")}
            onMouseLeave={() => setHovered(null)}
            onClick={() => handleSelect("dark")}
            style={{
              flex: 1,
              padding: "20px 16px",
              borderRadius: 12,
              background: "#0B0F14",
              border: `2px solid ${hovered === "dark" ? "#1EB8CC" : "#2A3550"}`,
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 80,
                borderRadius: 8,
                background: "#0B0F14",
                border: "1px solid #2A3550",
                marginBottom: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 10,
              }}
            >
              <div
                style={{
                  width: "70%",
                  height: 6,
                  background: "#1EB8CC",
                  borderRadius: 3,
                }}
              />
              <div
                style={{
                  width: "90%",
                  height: 4,
                  background: "#2A3550",
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  width: "60%",
                  height: 4,
                  background: "#2A3550",
                  borderRadius: 2,
                }}
              />
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {["#22C55E", "#F5A623", "#EF4444"].map((c) => (
                  <div
                    key={c}
                    style={{
                      width: 16,
                      height: 16,
                      background: c,
                      borderRadius: 3,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ color: "#F0F4FF", fontSize: 13, fontWeight: 600 }}>
              Dark (Default)
            </div>
            <div style={{ color: "#64748B", fontSize: 11, marginTop: 3 }}>
              IC-grade dark theme · Best on screen
            </div>
          </button>

          {/* Light theme */}
          <button
            onMouseEnter={() => setHovered("light")}
            onMouseLeave={() => setHovered(null)}
            onClick={() => handleSelect("light")}
            style={{
              flex: 1,
              padding: "20px 16px",
              borderRadius: 12,
              background: "#161D2E",
              border: `2px solid ${hovered === "light" ? "#1EB8CC" : "#2A3550"}`,
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 80,
                borderRadius: 8,
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                marginBottom: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 10,
              }}
            >
              <div
                style={{
                  width: "70%",
                  height: 6,
                  background: "#0891B2",
                  borderRadius: 3,
                }}
              />
              <div
                style={{
                  width: "90%",
                  height: 4,
                  background: "#CBD5E1",
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  width: "60%",
                  height: 4,
                  background: "#CBD5E1",
                  borderRadius: 2,
                }}
              />
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {["#16A34A", "#D97706", "#DC2626"].map((c) => (
                  <div
                    key={c}
                    style={{
                      width: 16,
                      height: 16,
                      background: c,
                      borderRadius: 3,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ color: "#F0F4FF", fontSize: 13, fontWeight: 600 }}>
              Light (Print-Friendly)
            </div>
            <div style={{ color: "#64748B", fontSize: 11, marginTop: 3 }}>
              White background · Best for printing
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "8px 0",
            background: "transparent",
            border: "1px solid #2A3550",
            borderRadius: 8,
            color: "#64748B",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>

        {/* Report mode selector */}
        <div style={{ marginTop: 24 }}>
          <div style={{ color: "#F0F4FF", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            Report Mode
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {REPORT_MODES.map((rm) => {
              const active = selectedMode === rm.value;
              return (
                <button
                  key={rm.value}
                  onClick={() => setSelectedMode(rm.value)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: active ? "#0B1929" : "transparent",
                    border: `2px solid ${active ? "#1EB8CC" : "#2A3550"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{ color: "#F0F4FF", fontSize: 12, fontWeight: 600 }}>
                    {rm.label}
                  </div>
                  <div style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>
                    {rm.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
