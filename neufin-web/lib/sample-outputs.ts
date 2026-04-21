import { getSampleIcMemoUrl } from "@/lib/demo-environment";

export type SampleOutputKind =
  | "ic_memo"
  | "dna"
  | "advisor_pdf"
  | "research"
  | "results";

export type SampleOutputCard = {
  kind: SampleOutputKind;
  title: string;
  description: string;
  /** In-app or marketing route */
  href: string;
  external?: boolean;
};

export function getSampleOutputGallery(): SampleOutputCard[] {
  const sampleIc = getSampleIcMemoUrl();

  return [
    {
      kind: "ic_memo",
      title: "Sample IC memo",
      description: "Committee-style synthesis with regime, risks, and actions.",
      href: sampleIc ?? "/sample/ic-memo",
      external: Boolean(sampleIc),
    },
    {
      kind: "dna",
      title: "Sample DNA report",
      description: "Behavioral and structural diagnostics for the book.",
      href: "/sample/dna-report",
    },
    {
      kind: "advisor_pdf",
      title: "Sample advisor PDF",
      description: "White-label brief ready for client-facing review.",
      href: "/dashboard/reports/preview",
    },
    {
      kind: "research",
      title: "Sample research memo",
      description: "Regime and desk commentary from the research hub.",
      href: "/research",
    },
    {
      kind: "results",
      title: "Sample results view",
      description: "Full post-upload intelligence layout after analysis completes.",
      href: "/results",
    },
  ];
}
