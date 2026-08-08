import { v2 as cloudinary } from "cloudinary";
import { list as blobList } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";

// Where badge shots live. On a hosted deploy (Vercel) the filesystem is read-only, so we use a
// storage provider — whichever is configured via env, checked in this order:
//   1. Cloudinary  (CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET)
//   2. Vercel Blob (BLOB_READ_WRITE_TOKEN)
//   3. local public/photos  (dev fallback, no accounts)

export const FOLDER = "defcon-polaroid";

export const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
);
export const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface Photo {
  name: string;
  url: string;
  downloadUrl: string;
}

const LOCAL_DIR = path.join(process.cwd(), "public", "photos");
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;

/** Turn a Cloudinary delivery URL into one that forces a file download. */
function toCloudinaryDownload(secureUrl: string): string {
  return secureUrl.replace("/image/upload/", "/image/upload/fl_attachment/");
}

/** List every stored shot, MOST RECENT FIRST. */
export async function listPhotos(): Promise<Photo[]> {
  if (cloudinaryConfigured) {
    const res = await cloudinary.api.resources({
      type: "upload",
      prefix: `${FOLDER}/`,
      max_results: 500,
    });
    return (res.resources as Array<{ public_id: string; secure_url: string; created_at: string }>)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)) // newest first
      .map((r) => ({
        name: r.public_id.split("/").pop() ?? r.public_id,
        url: r.secure_url,
        downloadUrl: toCloudinaryDownload(r.secure_url),
      }));
  }

  if (blobConfigured) {
    const { blobs } = await blobList({ prefix: `${FOLDER}/`, limit: 1000 });
    return blobs
      .filter((b) => IMAGE_RE.test(b.pathname))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .map((b) => ({
        name: b.pathname.split("/").pop() ?? b.pathname,
        url: b.url,
        downloadUrl: b.downloadUrl,
      }));
  }

  try {
    const files = await fs.readdir(LOCAL_DIR);
    const withTimes = await Promise.all(
      files
        .filter((f) => IMAGE_RE.test(f))
        .map(async (name) => ({
          name,
          mtime: (await fs.stat(path.join(LOCAL_DIR, name))).mtimeMs,
        })),
    );
    return withTimes
      .sort((a, b) => b.mtime - a.mtime) // most recent first
      .map(({ name }) => ({ name, url: `/photos/${name}`, downloadUrl: `/photos/${name}` }));
  } catch {
    return [];
  }
}

export { cloudinary };
