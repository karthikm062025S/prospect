// v8 D1: Playwrite is removed. The sign-off line renders
// in the display face (font-display), upright: Karthik 2026-09-05, no italic.
export function HandLine({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={`font-display ${className}`.trim()}>{children}</p>;
}
