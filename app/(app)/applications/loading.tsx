// D17 / SC-4: the Applications route skeleton — sized to the real content
// footprint (doc 3 §2): v6 DX3's 45/55 split filling <main>, the list
// column's count line + chips + controls row + rows on the left and the
// detail pane's header + section rows on the right, behind the hairline.
// Static blocks, no pulse (doc 4 §4).
export default function ApplicationsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading applications"
      className="grid gap-6 md:h-full md:min-h-0 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden"
    >
      <div className="flex min-w-0 flex-col gap-6 pb-6 pt-4 md:-mx-1 md:min-h-0 md:overflow-hidden md:px-1 md:pr-2">
        {/* mocks/applications.html header footprint: eyebrow + h1 + stat trio. */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-32 rounded bg-hairline" />
            <div className="h-8 w-64 max-w-full rounded bg-hairline" />
          </div>
          <div className="flex gap-6">
            <div className="h-6 w-10 rounded bg-hairline" />
            <div className="h-6 w-10 rounded bg-hairline" />
            <div className="h-6 w-14 rounded bg-hairline" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <div className="h-11 w-16 rounded-full border border-hairline" />
            <div className="h-11 w-24 rounded-full border border-hairline" />
            <div className="h-11 w-24 rounded-full border border-hairline" />
          </div>
          <div className="h-11 w-40 rounded-pill border border-hairline" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-11 w-full max-w-xs rounded border border-hairline" />
          <div className="h-11 w-40 rounded-pill border border-hairline" />
        </div>
        <ul className="overflow-hidden rounded-card border border-hairline bg-raised">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
              <div className="h-10 w-10 shrink-0 rounded-full bg-hairline" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-4 w-40 max-w-[60%] rounded bg-hairline" />
                <div className="h-3 w-56 max-w-[80%] rounded bg-hairline" />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden flex-col gap-1 md:flex md:min-h-0 md:overflow-hidden md:border-l md:border-hairline md:pb-6 md:pl-6 md:pr-2 md:pt-4">
        <div className="flex flex-col gap-2 border-b border-hairline pb-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <div className="h-5 w-40 rounded bg-hairline" />
              <div className="h-4 w-64 rounded bg-hairline" />
            </div>
            <div className="h-11 w-28 rounded border border-hairline" />
          </div>
          <div className="h-4 w-48 rounded bg-hairline" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex min-h-11 items-center gap-2 border-b border-hairline">
            <div className="h-5 w-5 rounded bg-hairline" />
            <div className="h-4 w-28 rounded bg-hairline" />
            <div className="ml-auto h-3 w-12 rounded bg-hairline" />
          </div>
        ))}
      </div>
    </div>
  );
}
