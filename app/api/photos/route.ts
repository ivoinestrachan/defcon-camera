import { promises as fs } from "node:fs";
import path from "node:path";
import { del as blobDel, put as blobPut } from "@vercel/blob";
import {
  blobConfigured,
  cloudinary,
  cloudinaryConfigured,
  FOLDER,
  listPhotos,
} from "@/lib/photos";

// Photo intake for the badge polaroid.
//   POST /api/photos   body = raw PNG bytes (Content-Type: image/png)  -> stores a shot, returns it
//   GET  /api/photos   -> { photos: [{ name, url, downloadUrl }] } most recent first
//
// Storage is auto-selected: Cloudinary, then Vercel Blob, then local public/photos (dev).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // plenty for a 512px grayscale PNG
const LOCAL_DIR = path.join(process.cwd(), "public", "photos");

export async function GET(): Promise<Response> {
  try {
    const photos = await listPhotos();
    return Response.json({ photos });
  } catch (err) {
    return Response.json({ photos: [], error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  // Optional shared-secret so randos can't spam the gallery. Enabled only if UPLOAD_TOKEN is set.
  const requiredToken = process.env.UPLOAD_TOKEN;
  if (requiredToken && request.headers.get("x-upload-token") !== requiredToken) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("image/png")) {
    return Response.json({ error: "send a PNG with Content-Type: image/png" }, { status: 400 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return Response.json({ error: "empty or oversized image" }, { status: 400 });
  }

  // 1) Cloudinary
  if (cloudinaryConfigured) {
    try {
      const result = await new Promise<{ public_id: string; secure_url: string }>(
        (resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              { folder: FOLDER, resource_type: "image", format: "png" },
              (error: unknown, res?: { public_id: string; secure_url: string }) =>
                error || !res ? reject(error ?? new Error("no result")) : resolve(res),
            )
            .end(bytes);
        },
      );
      return Response.json({
        ok: true,
        name: result.public_id.split("/").pop() ?? result.public_id,
        url: result.secure_url,
      });
    } catch (err) {
      return Response.json({ error: `cloudinary upload failed: ${String(err)}` }, { status: 502 });
    }
  }

  // 2) Vercel Blob
  if (blobConfigured) {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const blob = await blobPut(`${FOLDER}/cam_${stamp}.png`, bytes, {
        access: "public",
        contentType: "image/png",
      });
      return Response.json({ ok: true, name: blob.pathname.split("/").pop(), url: blob.url });
    } catch (err) {
      return Response.json({ error: `blob upload failed: ${String(err)}` }, { status: 502 });
    }
  }

  // 3) local dev fallback
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  const existing = await fs.readdir(LOCAL_DIR).catch(() => [] as string[]);
  const n = existing.filter((f) => f.startsWith("cam_")).length + 1;
  const name = `cam_${String(n).padStart(3, "0")}.png`;
  await fs.writeFile(path.join(LOCAL_DIR, name), bytes);
  return Response.json({ ok: true, name });
}

export async function DELETE(request: Request): Promise<Response> {
  // Gated by ADMIN_TOKEN when set (set it in Vercel so only you can curate the hosted gallery).
  // When ADMIN_TOKEN is unset (local dev), deletes are open.
  const requiredToken = process.env.ADMIN_TOKEN;
  if (requiredToken && request.headers.get("x-admin-token") !== requiredToken) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let name = "";
  let url = "";
  try {
    ({ name = "", url = "" } = await request.json());
  } catch {
    /* bad body handled below */
  }
  name = String(name).split("/").pop() ?? "";
  if (!name) return Response.json({ error: "missing name" }, { status: 400 });

  try {
    if (cloudinaryConfigured) {
      const publicId = `${FOLDER}/${name.replace(/\.[a-z0-9]+$/i, "")}`;
      await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      return Response.json({ ok: true });
    }
    if (blobConfigured && url) {
      await blobDel(url);
      return Response.json({ ok: true });
    }
    await fs.rm(path.join(LOCAL_DIR, name), { force: true });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: `delete failed: ${String(err)}` }, { status: 502 });
  }
}
