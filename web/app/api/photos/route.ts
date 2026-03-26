import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { del, list } from "@vercel/blob";
import { kv } from "../../../lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Photo = {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  blobPathname?: string;
};

const META_KEY_IDS = "photos:ids";

// 仅用于本地联调：当未配置 Vercel Blob / Upstash Redis 时，走文件系统保存
const DEV_IMAGE_DIR = path.join(process.cwd(), "public", "dev_uploads");
const DEV_META_DIR = path.join(process.cwd(), ".dev_store");
const DEV_META_PATH = path.join(DEV_META_DIR, "photos.json");

function ensureDevDirs() {
  fs.mkdirSync(DEV_IMAGE_DIR, { recursive: true });
  fs.mkdirSync(DEV_META_DIR, { recursive: true });
}

function readDevPhotos(): Photo[] {
  try {
    if (!fs.existsSync(DEV_META_PATH)) return [];
    const raw = fs.readFileSync(DEV_META_PATH, "utf8");
    return JSON.parse(raw) as Photo[];
  } catch {
    return [];
  }
}

function writeDevPhotos(photos: Photo[]) {
  ensureDevDirs();
  fs.writeFileSync(DEV_META_PATH, JSON.stringify(photos), "utf8");
}

function listToLatest(photos: Photo[]) {
  return photos
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function photoFromBlobPathname(pathname: string, url: string, uploadedAtMs: number): Photo | null {
  if (!pathname.startsWith("photos/")) return null;
  const filename = pathname.slice("photos/".length);
  const dot = filename.lastIndexOf(".");
  const id = dot > 0 ? filename.slice(0, dot) : filename;
  if (!id) return null;
  return {
    id,
    name: filename,
    url,
    createdAt: uploadedAtMs,
    blobPathname: pathname,
  };
}

export async function GET() {
  try {
    // 1) 生产：Vercel KV（使用单 key 保存 id 列表）
    if (kv) {
      let ids: string[] = [];
      try {
        const idsValue = await kv.get<unknown>(META_KEY_IDS);
      if (Array.isArray(idsValue)) {
          ids = idsValue.filter((x: unknown): x is string => typeof x === "string");
        } else if (typeof idsValue === "string") {
          try {
            const parsed = JSON.parse(idsValue);
            if (Array.isArray(parsed)) {
              ids = parsed.filter((x: unknown): x is string => typeof x === "string");
            }
          } catch {
          // 兼容旧数据：如果之前把数组直接写成了 "a,b" 这种形式
          ids = idsValue
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          }
        }
      } catch (e) {
        // 发生 WRONGTYPE 时，删除旧 key 并返回空列表（让系统可自愈）
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("WRONGTYPE") || msg.includes("wrong kind of value")) {
          await kv.del(META_KEY_IDS);
        }
        ids = [];
      }

      if (ids.length === 0) {
        // 兜底：索引为空时，从 Blob 列表恢复展示（避免“上传成功但刷新后看不到”）
        try {
          const blobs = await list({ prefix: "photos/" });
          const photos = blobs.blobs
            .map((b) => photoFromBlobPathname(b.pathname, b.url, new Date(b.uploadedAt).getTime()))
            .filter(Boolean) as Photo[];
          return NextResponse.json({ ok: true, photos: listToLatest(photos) });
        } catch {
          return NextResponse.json({ ok: true, photos: [] });
        }
      }

      const photos: Photo[] = [];
      for (const id of ids) {
        // 同样避免旧类型导致单个 photo key 异常把整个接口打挂
        try {
          const v = await kv.get<string | null>(`photo:${id}`);
          if (!v) continue;
          photos.push(JSON.parse(v) as Photo);
        } catch {
          // ignore corrupted/wrong-type entry
        }
      }
      return NextResponse.json({ ok: true, photos: listToLatest(photos) });
    }

    // 2) 本地 fallback：文件系统
    const photos = listToLatest(readDevPhotos());
    return NextResponse.json({ ok: true, photos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "GET /api/photos failed";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const entries = formData.getAll("photos");
  const files = entries.filter((e) => typeof e !== "string") as File[];

  if (!files || files.length === 0) {
    return NextResponse.json({ ok: false, message: "未接收到图片文件" }, { status: 400 });
  }
  if (files.length > 20) {
    return NextResponse.json({ ok: false, message: "一次最多上传 20 张图片" }, { status: 400 });
  }
  for (const file of files) {
    if (!file.type || !file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, message: "仅允许上传 image/* 文件" }, { status: 400 });
    }
  }

  // 生产环境（Blob + Redis）：大文件请使用客户端直传 + /api/photos/register，避免 4.5MB 限制
  if (kv && process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "已启用 Blob：请使用客户端上传。请在 Vercel 环境变量中设置 NEXT_PUBLIC_USE_BLOB_CLIENT_UPLOAD=1，并重新部署。",
      },
      { status: 405 }
    );
  }

  // 本地 fallback：写入 public/dev_uploads + .dev_store/photos.json
  ensureDevDirs();
  const existing = readDevPhotos();
  const photos: Photo[] = existing.slice();

  for (const file of files) {
    const id = crypto.randomUUID();
    const originalName = file.name || `photo_${id}`;
    const extRaw = path.extname(originalName) || "";
    const safeExt = extRaw.replace(/[^.\w]/g, "") || "";
    const filename = `${id}${safeExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const outPath = path.join(DEV_IMAGE_DIR, filename);
    fs.writeFileSync(outPath, buffer);

    const url = `/dev_uploads/${encodeURIComponent(filename)}`;
    photos.push({
      id,
      name: originalName,
      url,
      createdAt: Date.now(),
    });
  }

  writeDevPhotos(photos);
  return NextResponse.json({ ok: true, photos: listToLatest(photos) });
}

export async function DELETE() {
  // 1) 生产：Upstash + Blob
  // 生产：Vercel KV
  if (kv && process.env.BLOB_READ_WRITE_TOKEN) {
    const idsValue = await kv.get<unknown>(META_KEY_IDS);
    let ids: string[] = [];
    if (Array.isArray(idsValue)) {
      ids = idsValue.filter((x: unknown): x is string => typeof x === "string");
    } else if (typeof idsValue === "string") {
      try {
        const parsed = JSON.parse(idsValue);
        if (Array.isArray(parsed)) {
          ids = parsed.filter((x: unknown): x is string => typeof x === "string");
        }
      } catch {
        ids = [];
      }
    }
    if (ids.length === 0) return NextResponse.json({ ok: true });

    const photos: Photo[] = [];
    for (const id of ids) {
      const v = await kv.get<string | null>(`photo:${id}`);
      if (!v) continue;
      try {
        photos.push(JSON.parse(v) as Photo);
      } catch {
        // ignore
      }
    }

    const blobPathnames = photos.map((p) => p.blobPathname).filter(Boolean) as string[];
    if (blobPathnames.length) await del(blobPathnames);

    await kv.del(META_KEY_IDS);
    for (const id of ids) {
      await kv.del(`photo:${id}`);
    }
    return NextResponse.json({ ok: true });
  }

  // 2) 本地 fallback
  const photos = readDevPhotos();
  ensureDevDirs();
  for (const p of photos) {
    const urlPath = p.url || "";
    const filename = decodeURIComponent(urlPath.split("/").pop() || "");
    if (!filename) continue;
    const outPath = path.join(DEV_IMAGE_DIR, filename);
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  }
  if (fs.existsSync(DEV_META_PATH)) fs.unlinkSync(DEV_META_PATH);
  return NextResponse.json({ ok: true });
}

