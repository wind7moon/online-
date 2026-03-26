"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";

type Photo = {
  id: string;
  name: string;
  url: string;
  createdAt: number;
};

const USE_BLOB_CLIENT =
  typeof process.env.NEXT_PUBLIC_USE_BLOB_CLIENT_UPLOAD === "string" &&
  process.env.NEXT_PUBLIC_USE_BLOB_CLIENT_UPLOAD === "1";

const BLOB_HANDLE_URL = process.env.NEXT_PUBLIC_BLOB_HANDLE_URL || "/api/blob/upload";

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data as { message?: string }).message) || `请求失败：${res.status}`);
  }
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error((data as { message?: string }).message || "请求失败");
  }
  return data;
}

export function PhotoGallery() {
  const [status, setStatus] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [modal, setModal] = useState<{ open: boolean; photo: Photo | null }>({
    open: false,
    photo: null,
  });

  const loadPhotos = useCallback(async (): Promise<Photo[]> => {
    const data = (await fetchJson("/api/photos", {
      method: "GET",
      cache: "no-store",
    })) as { photos?: Photo[] };
    const list = data.photos || [];
    setPhotos(list);
    return list;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setStatus("正在加载已保存的照片...");
        const list = await loadPhotos();
        setStatus(list.length ? `已加载 ${list.length} 张照片。` : "暂无照片。");
      } catch (e) {
        console.error(e);
        setStatus(
          e instanceof Error
            ? `加载失败：${e.message}`
            : "加载失败：请确认后端可用（GET /api/photos）。"
        );
      }
    })();
  }, [loadPhotos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal({ open: false, photo: null });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const sorted = [...photos].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const onFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type && f.type.startsWith("image/"));
    if (imgs.length === 0) {
      setStatus("请选择图片文件（image/*）。");
      return;
    }

    setStatus("正在上传图片中...");
    try {
      if (USE_BLOB_CLIENT) {
        for (const file of imgs) {
          const id = crypto.randomUUID();
          const dot = file.name.lastIndexOf(".");
          const ext = dot >= 0 ? file.name.slice(dot) : "";
          const pathname = `photos/${id}${ext}`;
          const result = await upload(pathname, file, {
            access: "public",
            handleUploadUrl: BLOB_HANDLE_URL,
            multipart: true,
            clientPayload: JSON.stringify({ id, name: file.name }),
          });
          await fetchJson("/api/photos/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              name: file.name,
              url: result.url,
              blobPathname: result.pathname,
            }),
          });
        }
      } else {
        const form = new FormData();
        for (const f of imgs) form.append("photos", f);
        await fetchJson("/api/photos", { method: "POST", body: form });
      }
      await loadPhotos();
      setStatus(`上传完成：${imgs.length} 张图片。`);
    } catch (e) {
      console.error(e);
      setStatus(
        e instanceof Error ? e.message : "上传失败：请检查网络、环境变量，或图片是否过大。"
      );
    }
  };

  const clearAll = async () => {
    const ok = window.confirm("确定要清空服务器上的所有已保存照片吗？此操作不可撤销。");
    if (!ok) return;
    setStatus("正在清空中...");
    try {
      await fetchJson("/api/photos", { method: "DELETE" });
      setPhotos([]);
      setStatus("已清空。");
    } catch (e) {
      console.error(e);
      setStatus("清空失败，请重试。");
    }
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar__left">
          <h1 className="title">照片查看器</h1>
          <p className="subtitle">
            {USE_BLOB_CLIENT
              ? "大图片使用客户端直传到 Vercel Blob（multipart），列表元数据在 Upstash Redis。"
              : "本地模式：上传走 /api/photos（小文件）；部署到 Vercel 请设置 NEXT_PUBLIC_USE_BLOB_CLIENT_UPLOAD=1。"}
          </p>
        </div>
        <div className="topbar__right">
          <label className="btn btn--primary" htmlFor="fileInput">
            选择图片
          </label>
          <input
            id="fileInput"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              e.target.value = "";
              void onFiles(list);
            }}
          />
          <button className="btn btn--danger" type="button" onClick={() => void clearAll()}>
            清空所有照片
          </button>
        </div>
      </header>

      <main className="container">
        <div className="status" aria-live="polite">
          {status}
        </div>
        <div className="grid" aria-label="照片网格">
          {sorted.length === 0 ? (
            <div className="status">暂无照片。点击「选择图片」上传。</div>
          ) : (
            sorted.map((p) => (
              <div key={p.id} className="card">
                <button
                  className="card__btn"
                  type="button"
                  onClick={() => setModal({ open: true, photo: p })}
                >
                  <img className="card__img" loading="lazy" alt={p.name || "照片"} src={p.url} />
                </button>
                <div className="card__meta">
                  <div className="card__name" title={p.name || ""}>
                    {p.name || ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <div
        id="modalOverlay"
        className="modalOverlay"
        aria-hidden={!modal.open}
        data-open={modal.open ? "true" : "false"}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal({ open: false, photo: null });
        }}
      >
        <div className="modal" role="dialog" aria-modal="true" aria-label="查看照片">
          <div className="modal__top">
            <div className="modal__caption">{modal.photo?.name || "—"}</div>
            <button
              className="iconBtn"
              type="button"
              aria-label="关闭查看"
              onClick={() => setModal({ open: false, photo: null })}
            >
              关闭
            </button>
          </div>
          <div className="modal__body">
            {modal.photo ? (
              <img className="modal__img" alt={modal.photo.name || ""} src={modal.photo.url} />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
