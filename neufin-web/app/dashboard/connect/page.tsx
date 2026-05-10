import Link from "next/link";
import { ConnectionPathCards } from "@/components/upload/ConnectionPathCards";
import { isPlaidConnectEnabled } from "@/lib/featureFlags";

export default function ConnectPortfolioPage() {
  const plaid = isPlaidConnectEnabled();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">
          Portfolio connection hub
        </h1>
        <p className="mt-1 text-sm text-slate2">
          Same three pathways as the public upload page. Your CSV flow is unchanged;
          this is the dashboard entry point.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/upload" className="font-medium text-primary hover:underline">
            Open full upload experience →
          </Link>
        </p>
      </div>

      <ConnectionPathCards variant="nav" plaidEnabled={plaid} />
    </div>
  );
}
