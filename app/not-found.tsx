import Link from "next/link";
import { MagnifyingGlassIcon } from "@/components/icons";

// Root not-found (D15 pre-deployment checklist: a custom 404, not Next's
// default). Lives outside (app) so it renders for a signed-out visitor too —
// no gate, no data fetch, nothing that can itself fail.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xs flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-text-dim">
        <MagnifyingGlassIcon />
      </span>
      <h1 className="font-display text-step-2 text-text">
        Page not found
      </h1>
      <p className="text-sm text-text-dim">
        There&apos;s nothing here. It may have moved, or the link was wrong.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-11 items-center border border-hairline px-3 font-sans text-sm font-medium text-sage hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Go home
      </Link>
    </main>
  );
}
