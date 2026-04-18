"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const AuthProvider = dynamic(
  () => import("@/lib/auth-context").then((m) => m.AuthProvider),
  { ssr: false },
);
const PostHogProvider = dynamic(
  () => import("@/lib/posthog").then((m) => m.PostHogProvider),
  { ssr: false },
);
const SentryUserContext = dynamic(
  () =>
    import("@/components/SentryUserContext").then((m) => m.SentryUserContext),
  { ssr: false },
);
const WebVitals = dynamic(
  () => import("@/app/components/WebVitals").then((m) => m.WebVitals),
  { ssr: false },
);
const Toaster = dynamic(
  () => import("react-hot-toast").then((m) => m.Toaster),
  { ssr: false },
);

export default function RootProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublicLanding = useMemo(() => pathname === "/", [pathname]);

  // Skip heavy auth/analytics and runtime widgets on the marketing landing route.
  if (isPublicLanding) return <>{children}</>;

  return (
    <PostHogProvider>
      <AuthProvider>
        <SentryUserContext />
        {children}
        <WebVitals />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            className: "",
            style: {
              background: "var(--glass-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--glass-border)",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 500,
              backdropFilter: "blur(12px)",
              boxShadow: "var(--shadow-md)",
            },
            success: {
              duration: 3500,
              style: {
                background: "var(--success-bg)",
                color: "var(--text-primary)",
                border: "1px solid rgba(34, 197, 94, 0.35)",
              },
              iconTheme: {
                primary: "var(--success)",
                secondary: "var(--surface)",
              },
            },
            error: {
              duration: 6000,
              style: {
                background: "var(--danger-bg)",
                color: "var(--text-primary)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
              },
              iconTheme: {
                primary: "var(--danger)",
                secondary: "var(--surface)",
              },
            },
          }}
        />
      </AuthProvider>
    </PostHogProvider>
  );
}
