# 照片查看器（Vercel 部署版）

这是一个 Next.js（App Router）实现的照片查看器：
- 前端页面：`app/page.tsx` + `components/PhotoGallery.tsx` + `public/styles.css`
- API：`app/api/photos/route.ts`、`app/api/blob/upload/route.ts`、`app/api/photos/register/route.ts`
- 图片存储：Vercel Blob（生产环境，**客户端直传 + multipart**，可上传更大图片）
- 照片列表/元数据：Upstash Redis（生产环境）

## 本地运行

```bash
cd web
npm install
npm run dev -- --hostname 127.0.0.1
```

本地如果你没有配置 `BLOB_READ_WRITE_TOKEN` / `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`，API 会自动走本地 fallback：
- 图片写入：`web/public/dev_uploads/`
- 元数据写入：`web/.dev_store/photos.json`

## Vercel 部署步骤（关键）

1. 在 Vercel 导入这个仓库时，把 **Root Directory** 设置为 `web/`
2. 框架选择：Next.js
3. Build Command：`npm run build`
4. Output（一般自动识别）
5. 环境变量（Environment Variables）：
   - `BLOB_READ_WRITE_TOKEN`
     - 由你在 Vercel Storage（Vercel Blob）里创建 Blob store 后自动提供
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `NEXT_PUBLIC_USE_BLOB_CLIENT_UPLOAD=1`（**必须**，用于启用浏览器端直传大文件）
   - （可选）`NEXT_PUBLIC_BLOB_HANDLE_URL=/api/blob/upload`（默认即为该路径，一般不用改）

部署后：
- 页面会从同域的 `/api/photos` 获取列表
- 上传走 **客户端直传** → Vercel Blob，然后在 `/api/photos/register` 写入 Upstash Redis

## 重要说明
- 已改为 **Vercel Blob client upload**（`@vercel/blob/client` 的 `upload`，`multipart: true`），避免 Vercel Function **4.5MB** 的 server upload 限制。
- 服务端在 `onBeforeGenerateToken` 里将单张上限设为 **500MB**（可按需调整 `app/api/blob/upload/route.ts`）。
- 本地若未配置 Blob/Redis，会继续使用 `POST /api/photos` 写入 `public/dev_uploads/`（小文件联调）。

