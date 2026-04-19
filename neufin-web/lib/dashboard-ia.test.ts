import { describe, expect, it } from "vitest";
import { DASHBOARD_TABS, getTabByPath } from "./dashboard-ia";

describe("dashboard-ia", () => {
  it("resolves overview", () => {
    expect(getTabByPath("/dashboard")?.id).toBe("overview");
  });

  it("resolves portfolio and nested routes", () => {
    expect(getTabByPath("/dashboard/portfolio")?.id).toBe("portfolio");
    expect(getTabByPath("/dashboard/portfolio/extra")?.id).toBe("portfolio");
  });

  it("returns null for unknown dashboard subpaths", () => {
    expect(getTabByPath("/dashboard/settings")).toBeNull();
  });

  it("has consistent workflow coverage", () => {
    expect(DASHBOARD_TABS.overview.nextInJourney.tabId).toBe("actions");
    expect(getTabByPath("/dashboard/actions")?.id).toBe("actions");
    expect(DASHBOARD_TABS.reports.nextInJourney.tabId).toBe("billing");
  });
});
