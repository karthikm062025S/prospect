import { sanitizeJobHtml } from "@/lib/jd-snapshot";

// The ONE renderer for a captured posting. Both detail
// panes use it, so the posting reads the same everywhere.
//
// Server-safe: no hooks, no "use client" — it only escapes and prints.
//
// TRD §6/§9a: the stored snapshot was already sanitized at capture, but this is
// a trust boundary and the value reaches dangerouslySetInnerHTML, so it is
// re-sanitized here (defense in depth). sanitizeJobHtml is idempotent, so a
// second pass costs one linear scan and changes nothing.
//
// note: Tailwind arbitrary variants on one wrapper instead of a stylesheet —
// the sanitizer's allowlist is 11 tags, so there is nothing else to style. No
// max-height, no border, no background: the CALLER decides the container.

export function JdHtml({ html, className }: { html: string; className?: string }) {
  const safe = sanitizeJobHtml(html);
  if (!safe) return null;
  return (
    <div
      className={[
        // D31: 15px/1.6 body, one notch up from the old 14px
        "text-[15px] leading-[1.6] text-text",
        "[&_p]:my-3",
        "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-[17px] [&_h1]:font-medium",
        "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-medium",
        "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-medium",
        "[&_h4]:mt-5 [&_h4]:mb-2 [&_h4]:text-base [&_h4]:font-medium",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
        // nested lists sit inside their parent <li>, not below it
        "[&_li>ul]:my-1 [&_li>ol]:my-1",
        "[&_strong]:font-medium",
        "[&_a]:text-sage [&_a]:underline",
        // first block flush with the top of whatever box the caller gives us
        "[&>*:first-child]:mt-0 [&>p:first-child]:mt-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
