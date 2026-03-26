import { kv as vercelKv } from "@vercel/kv";

// @vercel/kv 只认这两组环境变量：KV_REST_API_URL / KV_REST_API_TOKEN
const hasVercelKv = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

export const kv = hasVercelKv ? vercelKv : null;

