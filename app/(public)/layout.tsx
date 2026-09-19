// MISSION v7 D14: an ungated route group for standalone public pages
// (/privacy, /terms) that need the root layout's fonts/tokens but neither the
// (app) tab bar nor any auth check. No wrapper markup of its own — each page
// owns its own <main>.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
