"use client";

import { useEffect, useState } from "react";
import { getSubscriptionStatus } from "@/lib/api";
import TrialBanner from "@/components/TrialBanner";
import { useAuth } from "@/lib/auth-context";

export default function TrialBannerLoader() {
  const { token } = useAuth();
  const [status, setStatus] = useState<"trial" | "active" | "expired">(
    "active",
  );
  const [days, setDays] = useState<number | undefined>();

  useEffect(() => {
    if (!token) return;
    getSubscriptionStatus(token)
      .then((res) => {
        setStatus(res.status);
        setDays(res.days_remaining ?? undefined);
      })
      .catch(() => setStatus("active"));
  }, [token]);

  return <TrialBanner status={status} daysRemaining={days} />;
}
