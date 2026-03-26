import { kv as vercelKv } from "@vercel/kv";

// 仅当环境变量存在时才启用；否则让 route 走本地 fallback
const hasVercelKv =
  (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
  (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

export const kv = hasVercelKv ? vercelKv : null;

