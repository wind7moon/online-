import { Redis } from "@upstash/redis";

// 兼容两套变量名：
// 1) Upstash 官方：UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// 2) Vercel KV 常见：KV_REST_API_URL / KV_REST_API_TOKEN
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// 仅在 Vercel/Upstash 配置环境变量后才启用；本地可走 dev fallback（在 route 里处理）
export const redis =
  redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken,
      })
    : null;

