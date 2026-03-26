import { NextResponse } from "next/server";
import { head } from "@vercel/blob";
import { kv } from "../../../../lib/kv";

export const runtime = "nodejs";

type Body = {
  id: string;
  name: string;
  url: string;
  blobPathname: string;
};

/** 客户端直传 Blob 成功后，登记元数据到 Upstash Redis */
export async function POST(request: Request) {
  if (!kv || !process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ ok: false, message: "未配置 Redis / Blob" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "请求体不是 JSON" }, { status: 400 });
  }

  const { id, name, url, blobPathname } = body;
  if (!id || !name || !url || !blobPathname) {
    return NextResponse.json({ ok: false, message: "缺少 id/name/url/blobPathname" }, { status: 400 });
  }
  if (!blobPathname.startsWith(`photos/${id}`)) {
    return NextResponse.json({ ok: false, message: "blobPathname 与 id 不匹配" }, { status: 400 });
  }

  try {
    const meta = await head(url);
    if (meta.pathname !== blobPathname) {
      return NextResponse.json({ ok: false, message: "blob 元数据与登记信息不一致" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, message: "无法校验 Blob（url 无效或无权访问）" }, { status: 400 });
  }

  const createdAt = Date.now();
  const photo = { id, name, url, createdAt, blobPathname };
  await kv.set(`photo:${id}`, JSON.stringify(photo));
  // photos:ids 可能因为历史版本导致类型不一致（WRONGTYPE），这里做容错并自动重建
  let ids: string[] = [];
  try {
    const idsValue = await kv.get<unknown>("photos:ids");
    if (Array.isArray(idsValue)) {
      ids = idsValue.filter((x): x is string => typeof x === "string");
    } else if (typeof idsValue === "string") {
      try {
        const parsed = JSON.parse(idsValue);
        if (Array.isArray(parsed)) ids = parsed.filter((x: unknown): x is string => typeof x === "string");
      } catch {
        ids = [];
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("WRONGTYPE") || msg.includes("wrong kind of value")) {
      await kv.del("photos:ids");
      ids = [];
    } else {
      throw e;
    }
  }

  if (!ids.includes(id)) ids.push(id);
  await kv.set("photos:ids", ids);

  return NextResponse.json({ ok: true });
}
