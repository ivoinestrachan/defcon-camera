"use client";

import { type CSSProperties, useCallback, useEffect, useState } from "react";
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
  const [items, setItems] = useState<Photo[]>(photos);
  const [active, setActive] = useState<number | null>(null);
  const [manage, setManage] = useState(false);
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

  async function deletePhoto(photo: Photo) {
    if (!window.confirm(`Delete "${caption(photo.name, 0)}"? This removes it from the gallery for good.`)) {
      return;
    }
    const send = (token: string) =>
      fetch("/api/photos", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "x-admin-token": token } : {}),
        },
        body: JSON.stringify({ name: photo.name, url: photo.url }),
      });

    let token = localStorage.getItem("adminToken") ?? "";
    let res = await send(token);
    if (res.status === 401) {
      token = window.prompt("Enter the admin token to delete photos:") ?? "";
      if (!token) return;
      res = await send(token);
      if (res.ok) localStorage.setItem("adminToken", token);
    }
    if (!res.ok) {
      if (res.status === 401) localStorage.removeItem("adminToken");
      window.alert(res.status === 401 ? "Wrong admin token." : "Delete failed — try again.");
      return;
    }
    setItems((prev) => prev.filter((p) => p.name !== photo.name));
    setActive(null);
  }

  const activePhoto = active !== null ? items[active] : null;

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <span className="font-mono text-[11px] text-[color:var(--muted)]">
          {items.length} {items.length === 1 ? "frame" : "frames"}
        </span>
        <button
          type="button"
          onClick={() => setManage((m) => !m)}
          className="curate-toggle"
          aria-pressed={manage}
        >
          {manage ? "Done" : "Curate"}
        </button>
      </div>

      <section className="grid grid-cols-2 gap-6 sm:grid-cols-3 sm:gap-8 lg:grid-cols-4">
        {items.map((photo, i) => (
          <figure
            key={photo.name}
            className="polaroid"
            style={
              {
                ["--rot" as string]: `${ROTATIONS[i % ROTATIONS.length]}deg`,
                ["--i" as string]: i,
              } as CSSProperties
            }
          >
            <div className="relative">
              <button
                type="button"
                className="shot-btn"
                onClick={() => setActive(i)}
                aria-label={`View ${caption(photo.name, i)} larger`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={caption(photo.name, i)} className="shot pixelated" />
              </button>
              {manage && (
                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => deletePhoto(photo)}
                  aria-label={`Delete ${caption(photo.name, i)}`}
                >
                  ✕
                </button>
              )}
            </div>
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => deletePhoto(activePhoto)}
                  className="delete-inline"
                  aria-label={`Delete ${activePhoto.name}`}
                >
                  Delete
                </button>
                <a
                  href={activePhoto.downloadUrl}
                  download={activePhoto.name}
                  className="download-btn"
                  aria-label={`Download ${activePhoto.name}`}
                >
                  ↓ Download
                </a>
              </div>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
