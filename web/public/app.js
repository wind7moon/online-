// 前端：通过后端 API 上传/读取/清空图片
(() => {
  const els = {
    status: document.getElementById("status"),
    fileInput: document.getElementById("fileInput"),
    clearBtn: document.getElementById("clearBtn"),
    grid: document.getElementById("grid"),
    modalOverlay: document.getElementById("modalOverlay"),
    modalImg: document.getElementById("modalImg"),
    modalCaption: document.getElementById("modalCaption"),
    modalCloseBtn: document.getElementById("modalCloseBtn"),
  };

  const API = {
    photos: "/api/photos",
  };

  // 当前页面内存态（用于点击缩略图快速定位）
  let currentPhotos = [];

  const setStatus = (msg) => {
    els.status.textContent = msg || "";
  };

  const fetchJson = async (url, options) => {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data && data.message) || `请求失败：${res.status}`);
    }
    if (data && data.ok === false) {
      throw new Error(data.message || "请求失败");
    }
    return data;
  };

  const fetchPhotos = async () => {
    const data = await fetchJson(API.photos, { method: "GET" });
    currentPhotos = (data && data.photos) || [];
    return currentPhotos;
  };

  const uploadPhotos = async (files) => {
    const form = new FormData();
    for (const f of files) form.append("photos", f);
    const data = await fetchJson(API.photos, { method: "POST", body: form });
    return (data && data.photos) || [];
  };

  const clearPhotos = async () => {
    await fetchJson(API.photos, { method: "DELETE" });
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });

  const renderGrid = (photos) => {
    els.grid.innerHTML = "";
    if (!photos || photos.length === 0) {
      els.grid.innerHTML = `<div class="status">暂无照片。点击“选择图片”上传。</div>`;
      return;
    }

    // 最新的排在前面（createdAt 越大越靠前）
    photos
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .forEach((p) => {
        const card = document.createElement("div");
        card.className = "card";

        const btn = document.createElement("button");
        btn.className = "card__btn";
        btn.type = "button";
        btn.setAttribute("data-id", p.id);

        const img = document.createElement("img");
        img.className = "card__img";
        img.loading = "lazy";
        img.alt = p.name || "照片";
        img.src = p.url;

        btn.appendChild(img);

        const meta = document.createElement("div");
        meta.className = "card__meta";
        meta.innerHTML = `<div class="card__name" title="${escapeHtml(p.name || "")}">${escapeHtml(
          p.name || ""
        )}</div>`;

        card.appendChild(btn);
        card.appendChild(meta);
        els.grid.appendChild(card);
      });
  };

  const openModal = (photo) => {
    els.modalImg.src = photo.url;
    els.modalImg.alt = photo.name || "照片";
    els.modalCaption.textContent = photo.name || "—";
    els.modalOverlay.setAttribute("data-open", "true");
    els.modalOverlay.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    els.modalOverlay.setAttribute("data-open", "false");
    els.modalOverlay.setAttribute("aria-hidden", "true");
    els.modalImg.src = "";
    els.modalCaption.textContent = "—";
  };

  // 事件：上传
  els.fileInput.addEventListener("change", async () => {
    const files = Array.from(els.fileInput.files || []).filter((f) =>
      f && f.type && f.type.startsWith("image/")
    );
    if (files.length === 0) {
      setStatus("请选择图片文件（image/*）。");
      return;
    }

    setStatus("正在上传图片中...");
    try {
      await uploadPhotos(files);
      const photos = await fetchPhotos();
      renderGrid(photos);
      setStatus(`上传完成：${files.length} 张图片。`);
    } catch (e) {
      console.error(e);
      setStatus("上传失败：请检查图片大小/类型，或后端是否正常运行。");
    } finally {
      // 允许重复选择同一批文件
      els.fileInput.value = "";
    }
  });

  // 事件：清空
  els.clearBtn.addEventListener("click", async () => {
    const ok = window.confirm("确定要清空服务器上的所有已保存照片吗？此操作不可撤销。");
    if (!ok) return;
    setStatus("正在清空中...");
    try {
      await clearPhotos();
      currentPhotos = [];
      renderGrid([]);
      setStatus("已清空。");
    } catch (e) {
      console.error(e);
      setStatus("清空失败，请重试。");
    }
  });

  // 事件：点击缩略图查看
  els.grid.addEventListener("click", async (ev) => {
    const btn = ev.target && ev.target.closest && ev.target.closest("button.card__btn");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (!id) return;

    try {
      const photo = currentPhotos.find((p) => p.id === id);
      if (!photo) return;
      openModal(photo);
    } catch (e) {
      console.error(e);
      setStatus("打开失败，请重试。");
    }
  });

  // 事件：关闭弹窗
  els.modalCloseBtn.addEventListener("click", closeModal);
  els.modalOverlay.addEventListener("click", (e) => {
    // 点击遮罩区域关闭；点击弹窗内容不关闭
    if (e.target === els.modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // 初始化：加载已有照片
  (async () => {
    try {
      setStatus("正在加载已保存的照片...");
      const photos = await fetchPhotos();
      renderGrid(photos);
      setStatus(photos.length ? `已加载 ${photos.length} 张照片。` : "暂无照片。");
    } catch (e) {
      console.error(e);
      setStatus("加载失败：请确认后端服务器已启动（GET /api/photos）。");
    }
  })();
})();

