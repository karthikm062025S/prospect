// v7 S4 (OD2). One vendored brand mark (public/brand/<slug>.svg, written by
// scripts/brand-icons.mjs) painted as a CSS mask filled with `currentColor`, so
// a single file is legible in both themes and inherits the surrounding ink.
//
// A mask rather than an <img>/inline svg on purpose: several thesvg mono files
// pin their own paint (`style="fill:#221f1f"`), which would beat the inherited
// `fill: currentColor` USAGE.md describes. A mask uses only the shape.
export function BrandGlyph({ src, size }: { src: string; size: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: "currentColor",
        WebkitMask: `url(${src}) center / contain no-repeat`,
        mask: `url(${src}) center / contain no-repeat`,
      }}
    />
  );
}
