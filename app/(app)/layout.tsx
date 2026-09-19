import { TabBarServer } from "@/components/tab-bar-server";
import { ViewTransitionResolver } from "@/components/view-transition";

// v6 DX1: the shell is a viewport-height flex column. The bar is a normal top
// child and <main> is the ONE scroll container (min-h-0 lets a flex item
// shrink below its content), so the document never scrolls and no row can
// render above or behind the bar. `px-gutter` is the single gutter the bar
// shares (V2). Vertical air is owned by each ROUTE, not by <main>: with
// `py-4` here the split pages' column hairline started 16px below the bar
// instead of running flush from it (v6 L3 A).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <ViewTransitionResolver />
      <TabBarServer />
      <main className="min-h-0 flex-1 overflow-y-auto px-gutter">{children}</main>
    </div>
  );
}
