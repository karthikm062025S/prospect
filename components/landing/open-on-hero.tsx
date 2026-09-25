"use client";

import { useEffect } from "react";

// v9 landing entry. Every redirect that lands a visitor on /welcome -- sign-out,
// an expired session, the signed-out proxy gate, the auth error and notice
// paths -- has to open on the hero. It did not: Next keeps the PREVIOUS
// focusAndScrollRef.hashFragment whenever a navigation's URL has no hash
// (node_modules/next/dist/client/components/segment-cache/navigation.js), so a
// fragment left over from earlier in the session re-scrolls the landing to that
// section on arrival, and ScrollBehavior.Default on a server-action redirect
// (server-action-reducer.js) does not reset it either.
//
// Putting the fragment on the redirect instead (/welcome#hero) was tried and
// reverted: a hash in the ENTRY url poisons Next's stored canonical URL, which
// appends each later hash to it, so the nav logo and every section link then
// build "#hero#hero" / "#hero#feed" -- ids that resolve to nothing. Cross-route
// links to the landing therefore stay hashless and the correction lives here.
//
// An effect, not a layout effect, so it runs after the layout-effect scroll
// handler in layout-router.tsx and wins. A visitor who asked for a section by
// name keeps it.
//
// note: forces the hero on every hashless mount of the landing, so a soft
// browser Back from /privacy gives up its restored scroll position. Guard on the
// navigation type if that ever matters more than this does.
export function OpenOnHero() {
  useEffect(() => {
    if (window.location.hash) return;
    const toHero = () => window.scrollTo({ top: 0, behavior: "instant" });
    toHero();
    // Next may apply the carried-forward fragment on a later commit than the one
    // that mounted this island; re-assert once on the next frame so that loses.
    const frame = requestAnimationFrame(toHero);
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
