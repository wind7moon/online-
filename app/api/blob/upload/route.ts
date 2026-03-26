import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** 客户端直传 Blob：用于突破 Vercel Function 4.5MB 请求体限制（multipart 大文件） */
export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN 未配置" }, { status: 400 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, _multipart) => {
        if (!pathname.startsWith("photos/")) {
          throw new Error("pathname 必须以 photos/ 开头");
        }
        const uuidLike =
          /^photos\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[^/]+$/i;
        if (!uuidLike.test(pathname)) {
          throw new Error("pathname 格式不合法");
        }
        let payload: { id?: string; name?: string } = {};
        try {
          payload = clientPayload ? JSON.parse(clientPayload) : {};
        } catch {
          throw new Error("clientPayload 不是合法 JSON");
        }
        const fileId = pathname.replace(/^photos\//, "").split(".")[0];
        if (!payload.id || payload.id !== fileId) {
          throw new Error("id 与 pathname 不一致");
        }

        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/heic",
            "image/heif",
            "image/avif",
            "image/svg+xml",
          ],
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: false,
          tokenPayload: clientPayload,
        };
      },
      onUploadCompleted: async () => {
        // 元数据由浏览器在上传成功后调用 /api/photos/register 写入（本地开发不依赖 webhook）
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload handler error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
