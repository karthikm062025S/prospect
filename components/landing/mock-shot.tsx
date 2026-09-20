import { findMockShot } from "@/components/landing/mocks";

// The screenshot slot the two product bands carry.
// Spec: build/research/wishlabs/components/04-feed.md.
//
// MISSION D-UI6: the capture is a REAL screenshot of the running app, dropped
// into public/mocks by the orchestrator (a worker cannot reach localhost).
// Until then the slot renders a NAMED empty state that says which file it is
// waiting for, in the same box, at the same aspect ratio, so nothing moves when
// the capture lands (zero CLS).

export function MockShot({ name, caption }: { name: string; caption: string }) {
  const shot = findMockShot(name);

  return (
    <figure className="w-full">
      {shot ? (
        // Read at request time from the filesystem, so next/image has no
        // build-time input to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shot.src}
          alt={shot.alt}
          width={1200}
          height={900}
          className="aspect-[4/3] w-full rounded-card border border-hairline object-cover object-top"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-card border border-dashed border-hairline bg-raised px-6 text-center">
          <p className="font-label text-step-2xs uppercase tracking-label text-text-dim">
            App screenshot pending
          </p>
          <p className="mt-3 max-w-[32ch] text-pretty text-step-xs text-text-dim">
            Waiting for public/mocks/{name}.png, a real capture of this screen.
          </p>
        </div>
      )}
      <figcaption className="mt-3 font-label text-step-2xs uppercase tracking-label text-text-dim">
        {caption}
      </figcaption>
    </figure>
  );
}
