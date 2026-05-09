import { redirect } from "next/navigation";
import { isAdvisorModeEnabled } from "@/lib/featureFlags";
import { RawInputClient } from "./RawInputClient";

export default function RawPortfolioInputPage() {
  if (!isAdvisorModeEnabled()) {
    redirect("/upload");
  }
  return <RawInputClient />;
}
