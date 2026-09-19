"use client";

/*
 * Vendored from motion-primitives (`components/core/progressive-blur.tsx`),
 * design/vendor/motion-primitives — MIT License, Copyright (c) 2024 ibelick.
 *
 * Changes for this codebase: `cn` dropped, the wrapper is absolutely
 * positioned by its caller instead of `relative`, and the layers are plain
 * <div>s rather than motion.div — nothing here animates, so there is no reason
 * to pay for a motion component per layer.
 */

export const GRADIENT_ANGLES = { top: 0, right: 90, bottom: 180, left: 270 } as const;

export type ProgressiveBlurProps = {
  direction?: keyof typeof GRADIENT_ANGLES;
  blurLayers?: number;
  className?: string;
  blurIntensity?: number;
};

export function ProgressiveBlur({
  direction = "bottom",
  blurLayers = 8,
  className = "",
  blurIntensity = 0.25,
}: ProgressiveBlurProps) {
  const layers = Math.max(blurLayers, 2);
  const segmentSize = 1 / (blurLayers + 1);

  return (
    <div aria-hidden="true" className={className}>
      {Array.from({ length: layers }).map((_, index) => {
        const angle = GRADIENT_ANGLES[direction];
        const stops = [
          index * segmentSize,
          (index + 1) * segmentSize,
          (index + 2) * segmentSize,
          (index + 3) * segmentSize,
        ].map((pos, i) => `rgba(255, 255, 255, ${i === 1 || i === 2 ? 1 : 0}) ${pos * 100}%`);
        const gradient = `linear-gradient(${angle}deg, ${stops.join(", ")})`;

        return (
          <div
            key={index}
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              maskImage: gradient,
              WebkitMaskImage: gradient,
              backdropFilter: `blur(${index * blurIntensity}px)`,
              WebkitBackdropFilter: `blur(${index * blurIntensity}px)`,
            }}
          />
        );
      })}
    </div>
  );
}
