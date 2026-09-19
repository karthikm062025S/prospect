// Next's route-segment Suspense fallback while JourneyPage's server reads
// (profile, roadmap, nodes, nudges, feed) resolve. Distinct from the
// client-side agent-run progress inside RoadmapBoard, which uses
// components/roadmap/roadmap-loading-steps.tsx once the page has rendered.
export default function JourneyLoading() {
  return (
    <div className="flex flex-col gap-4 py-4" aria-busy="true" aria-label="Loading your journey">
      <div className="h-16 animate-pulse border border-hairline bg-raised motion-reduce:animate-none" style={{ borderRadius: "var(--radius-card, 16px)" }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="h-96 animate-pulse border border-hairline bg-raised motion-reduce:animate-none" style={{ borderRadius: "var(--radius-card, 16px)" }} />
        <div className="h-96 animate-pulse border border-hairline bg-raised motion-reduce:animate-none" style={{ borderRadius: "var(--radius-card, 16px)" }} />
      </div>
    </div>
  );
}
