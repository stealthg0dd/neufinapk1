/**
 * Single navigation source for dashboard shell, AppHeader, and journey CTAs.
 * Paths align with `lib/dashboard-ia.ts` — no duplicate mental models.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ListOrdered,
  PieChart,
  Bot,
  BookOpen,
  Code2,
  FileText,
  CreditCard,
} from "lucide-react";
import { DASHBOARD_TABS, type DashboardTabId } from "@/lib/dashboard-ia";

const TAB_ICONS: Record<DashboardTabId, LucideIcon> = {
  overview: LayoutDashboard,
  actions: ListOrdered,
  portfolio: PieChart,
  swarm: Bot,
  research: BookOpen,
  quant: Code2,
  reports: FileText,
  billing: CreditCard,
};

export type ProductNavItem = {
  tabId: DashboardTabId;
  href: string;
  label: string;
  icon: LucideIcon;
};

function item(tabId: DashboardTabId): ProductNavItem {
  const t = DASHBOARD_TABS[tabId];
  return {
    tabId,
    href: t.path,
    label: t.label,
    icon: TAB_ICONS[tabId],
  };
}

/** Sidebar: three groups matching IA sections */
export const SIDEBAR_NAV = {
  overview: [item("overview"), item("actions"), item("portfolio"), item("swarm")],
  insights: [item("research"), item("quant"), item("reports")],
  account: [item("billing")],
} as const;

/** Compact top nav for AppHeader (authenticated product surfaces) */
export const APP_HEADER_PRIMARY_NAV: ProductNavItem[] = [
  item("overview"),
  item("portfolio"),
  item("swarm"),
  item("research"),
  item("reports"),
  item("actions"),
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
