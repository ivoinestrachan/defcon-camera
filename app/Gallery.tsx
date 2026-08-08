"use client";

import { useCallback, useEffect, useState } from "react";
import type { Photo } from "@/lib/photos";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const ROTATIONS = [-3, 2.2, -1.4, 3, -2.6, 1.6, -2, 2.6, -1, 1.2];

function caption(name: string, index: number): string {
  return name.replace(IMAGE_RE, "").replace(/[_-]+/g, " ").toUpperCase() || `SHOT ${index + 1}`;
}

interface GalleryProps {
  photos: Photo[];
}

export default function Gallery({ photos }: GalleryProps) {
  const [active, setActive] = useState<number | null>(null);
  const close = useCallback(() => setActive(null), []);

  // Esc to close + lock body scroll while the overlay is open
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [active, close]);

  const activePhoto = active !== null ? photos[active] : null;

  return (
    <>
      <section className="grid grid-cols-2 gap-6 sm:grid-cols-3 sm:gap-8 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <figure
            key={photo.name}
            className="polaroid"
            style={{ ["--rot" as string]: `${ROTATIONS[i % ROTATIONS.length]}deg` }}
          >
            <button
              type="button"
              className="shot-btn"
              onClick={() => setActive(i)}
              aria-label={`View ${caption(photo.name, i)} larger`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={caption(photo.name, i)} className="shot pixelated" />
            </button>
            <figcaption className="px-1 pb-3 pt-3">
              <div className="font-mono text-[11px] tracking-wide text-neutral-700">
                {caption(photo.name, i)}
              </div>
              <a
                href={photo.downloadUrl}
                download={photo.name}
                className="download-btn mt-2 inline-block"
                aria-label={`Download ${photo.name}`}
              >
                ↓ Download
              </a>
            </figcaption>
          </figure>
        ))}
      </section>

      {activePhoto !== null && active !== null && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={caption(activePhoto.name, active)}
          onClick={close}
        >
          <button type="button" className="lightbox-close" onClick={close} aria-label="Close">
            ✕
          </button>
          {/* stop propagation so clicking the card itself doesn't close the overlay */}
          <figure className="polaroid lightbox-card" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activePhoto.url}
              alt={caption(activePhoto.name, active)}
              className="shot pixelated"
            />
            <figcaption className="flex items-center justify-between gap-3 px-1 pb-3 pt-3">
              <div className="font-mono text-[11px] tracking-wide text-neutral-700">
                {caption(activePhoto.name, active)}
              </div>
              <a
                href={activePhoto.downloadUrl}
                download={activePhoto.name}
                className="download-btn"
                aria-label={`Download ${activePhoto.name}`}
              >
                ↓ Download
              </a>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
