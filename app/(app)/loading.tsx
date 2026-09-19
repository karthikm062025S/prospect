// D17 / SC-4: Home's route-level skeleton — "skeleton sized to the real
// content footprint counts as rendered" (doc 3 §2, TRD §11). Mirrors the
// real page's structure and spacing (v6 DX3: the 45/55 split fills <main>;
// the list column holds the velocity line, chips, controls row and rows at
// the RoleRow footprint; the pane column is the hairline-divided empty
// column) so content landing causes zero layout shift. Static blocks, no
// pulse (doc 4 §4 anti-slop budget).
export default function HomeLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading roles"
      className="grid gap-6 md:h-full md:min-h-0 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden"
    >
      <div className="flex min-w-0 flex-col gap-3 pb-6 pt-4 md:-mx-1 md:min-h-0 md:overflow-hidden md:px-1 md:pr-2">
        <div className="flex h-5 items-center">
          <div className="h-3 w-64 rounded bg-hairline" />
        </div>
        <div className="flex items-center gap-1">
          <div className="h-11 w-16 rounded-full border border-hairline" />
          <div className="h-11 w-20 rounded-full border border-hairline" />
          <div className="h-11 w-20 rounded-full border border-hairline" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-11 w-full max-w-xs rounded border border-hairline" />
          <div className="h-11 w-40 rounded border border-hairline" />
          <div className="ml-auto h-11 w-20 rounded border border-hairline" />
        </div>
        <ul>
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className="flex min-h-11 items-center gap-3 border-b border-hairline py-1.5">
              <div className="h-4 w-32 rounded bg-hairline" />
              <div className="h-4 w-72 max-w-[50%] rounded bg-hairline" />
              <div className="ml-auto h-4 w-24 rounded bg-hairline" />
            </li>
          ))}
        </ul>
      </div>
      <div className="hidden md:block md:border-l md:border-hairline md:pb-6 md:pl-6 md:pr-2 md:pt-4" />
    </div>
  );
}
