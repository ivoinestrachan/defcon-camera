import Gallery from "./Gallery";
import { listPhotos } from "@/lib/photos";

// re-fetch the roll on every load so new badge shots show up without a rebuild
export const dynamic = "force-dynamic";

export default async function Home() {
  const photos = await listPhotos();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
      <header className="mb-10 sm:mb-14">
        <h1 className="font-mono text-4xl font-semibold tracking-tight sm:text-6xl">
          DEFCON<span className="text-[color:var(--acc)]">/</span>POLAROID
        </h1>
        <p className="mt-3 max-w-prose text-sm leading-6 text-[color:var(--muted)]">
          1-bit shots pulled straight off the badge&rsquo;s camera. Tap a frame to blow it up, or hit
          download to save the full-resolution image.
        </p>
      </header>

      {photos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/15 bg-[color:var(--panel)] p-12 text-center">
          <p className="font-mono text-sm text-[color:var(--muted)]">
            No frames yet. Drop images into{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[color:var(--ink)]">
              public/photos/
            </code>{" "}
            (that&rsquo;s where the badge dumps its shots).
          </p>
        </div>
      ) : (
        <Gallery photos={photos} />
      )}

      <footer className="mt-16 border-t border-white/10 pt-6 font-mono text-[11px] text-[color:var(--muted)]">
        shot on a hacked Baochip badge
      </footer>
    </main>
  );
}
