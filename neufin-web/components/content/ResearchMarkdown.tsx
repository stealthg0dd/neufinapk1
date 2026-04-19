import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/**
 * Canonical research / report markdown rendering — one place for prose tokens,
 * GFM, and sanitization (no raw HTML/script injection from LLM output).
 */
const researchSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  attributes: {
    ...defaultSchema.attributes,
    th: ["colspan", "rowspan", "align"],
    td: ["colspan", "rowspan", "align"],
  },
};

const proseClass =
  "prose prose-neutral dark:prose-invert max-w-none " +
  "prose-p:text-muted-foreground prose-headings:text-foreground " +
  "prose-li:text-muted-foreground prose-a:text-primary prose-strong:text-foreground " +
  "prose-code:text-foreground prose-code:bg-surface-2 prose-pre:bg-surface-2 prose-pre:text-foreground " +
  "prose-table:text-sm prose-th:border prose-td:border prose-table:border-border";

export function ResearchMarkdown({
  markdown,
  className = "",
}: {
  markdown: string;
  className?: string;
}) {
  const src = (markdown ?? "").trim();
  if (!src) {
    return (
      <p className="text-sm italic text-muted-foreground">No content available.</p>
    );
  }
  return (
    <div className={`${proseClass} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, researchSchema]]}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
}
