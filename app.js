const tools = {
  translate: "翻譯功能",
  ocr: "圖片截字",
  files: "檔案庫",
  images: "圖片庫",
  links: "常用連結",
};

const state = {
  from: "en",
  to: "zh-TW",
  db: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setStatus(text) {
  $("#statusText").textContent = text;
}

function switchTool(toolId) {
  $$(".menu-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === toolId);
  });
  $$(".tool-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === toolId);
  });
  $("#pageTitle").textContent = tools[toolId];
}

function setDirection(from, to) {
  state.from = from;
  state.to = to;
  $$(".segment").forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.langFrom === from && button.dataset.langTo === to,
    );
  });
}

async function translateText() {
  const source = $("#sourceText").value.trim();
  if (!source) {
    $("#translatedText").value = "";
    return;
  }

  setStatus("翻譯中");
  $("#translateButton").disabled = true;

  try {
    const params = new URLSearchParams({
      q: source,
      langpair: `${state.from}|${state.to}`,
    });
    const response = await fetch(`https://api.mymemory.translated.net/get?${params}`);
    if (!response.ok) throw new Error("Translation service unavailable");
    const data = await response.json();
    $("#translatedText").value = data.responseData?.translatedText || "沒有取得翻譯結果";
    setStatus("完成");
  } catch (error) {
    $("#translatedText").value = "翻譯服務暫時無法使用，請稍後再試。";
    setStatus("失敗");
  } finally {
    $("#translateButton").disabled = false;
  }
}

async function runOcr(file) {
  if (!file) return;
  $("#ocrPreview").src = URL.createObjectURL(file);
  $("#ocrPreview").style.display = "block";
  $("#ocrText").value = "辨識中...";
  setStatus("OCR 中");

  try {
    if (!window.Tesseract) throw new Error("Tesseract not loaded");
    const result = await Tesseract.recognize(file, "eng+chi_tra+chi_sim", {
      logger(event) {
        if (event.status === "recognizing text") {
          setStatus(`${Math.round(event.progress * 100)}%`);
        }
      },
    });
    $("#ocrText").value = result.data.text.trim() || "沒有辨識到文字";
    setStatus("完成");
  } catch (error) {
    $("#ocrText").value = "OCR 模組載入或辨識失敗，請確認網路連線後重試。";
    setStatus("失敗");
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mytools-library", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("links")) {
        db.createObjectStore("links", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact(storeName, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = callback(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

function readAll(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveItem(storeName, file) {
  const item = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    createdAt: new Date().toISOString(),
    blob: file,
  };
  return transact(storeName, "readwrite", (store) => store.put(item));
}

function saveLink({ category, name, url }) {
  const item = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    category: category.trim(),
    name: name.trim(),
    url: normalizeUrl(url),
    createdAt: new Date().toISOString(),
  };
  return transact("links", "readwrite", (store) => store.put(item));
}

function deleteItem(storeName, id) {
  return transact(storeName, "readwrite", (store) => store.delete(id));
}

function normalizeUrl(url) {
  const value = url.trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function downloadBlob(item) {
  const url = URL.createObjectURL(item.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = item.name;
  link.click();
  URL.revokeObjectURL(url);
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function renderFiles() {
  const files = await readAll("files");
  const list = $("#fileList");
  list.innerHTML = "";
  if (!files.length) {
    list.innerHTML = '<div class="empty-state">目前沒有檔案。</div>';
    return;
  }

  files
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .forEach((item) => {
      const row = document.createElement("div");
      row.className = "library-row";
      row.innerHTML = `
        <div>
          <div class="library-name"></div>
          <div class="library-meta">${formatSize(item.size)} · ${new Date(item.createdAt).toLocaleString()}</div>
        </div>
        <button class="small-button" type="button">下載</button>
        <button class="small-button" type="button">刪除</button>
      `;
      row.querySelector(".library-name").textContent = item.name;
      const [downloadButton, deleteButton] = row.querySelectorAll("button");
      downloadButton.addEventListener("click", () => downloadBlob(item));
      deleteButton.addEventListener("click", async () => {
        await deleteItem("files", item.id);
        renderFiles();
      });
      list.appendChild(row);
    });
}

async function renderImages() {
  const images = await readAll("images");
  const grid = $("#imageGrid");
  grid.innerHTML = "";
  if (!images.length) {
    grid.innerHTML = '<div class="empty-state">目前沒有圖片。</div>';
    return;
  }

  images
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .forEach((item) => {
      const card = document.createElement("article");
      card.className = "image-card";
      const url = URL.createObjectURL(item.blob);
      card.innerHTML = `
        <img alt="">
        <div class="image-card-body">
          <div>
            <div class="library-name"></div>
            <div class="library-meta">${formatSize(item.size)}</div>
          </div>
          <div class="image-actions">
            <button class="small-button" type="button">下載</button>
            <button class="small-button" type="button">刪除</button>
          </div>
        </div>
      `;
      card.querySelector("img").src = url;
      card.querySelector("img").alt = item.name;
      card.querySelector(".library-name").textContent = item.name;
      const [downloadButton, deleteButton] = card.querySelectorAll("button");
      downloadButton.addEventListener("click", () => downloadBlob(item));
      deleteButton.addEventListener("click", async () => {
        URL.revokeObjectURL(url);
        await deleteItem("images", item.id);
        renderImages();
      });
      grid.appendChild(card);
    });
}

async function renderLinks() {
  const links = await readAll("links");
  const list = $("#linkList");
  const filter = $("#linkCategoryFilter").value;
  const categories = [...new Set(links.map((item) => item.category).filter(Boolean))].sort();

  $("#linkCategoryFilter").innerHTML = '<option value="">全部分類</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    option.selected = category === filter;
    $("#linkCategoryFilter").appendChild(option);
  });

  const visibleLinks = links
    .filter((item) => !filter || item.category === filter)
    .sort((a, b) => a.category.localeCompare(b.category, "zh-Hant") || a.name.localeCompare(b.name, "zh-Hant"));

  list.innerHTML = "";
  if (!visibleLinks.length) {
    list.innerHTML = '<div class="empty-state">目前沒有常用連結。</div>';
    return;
  }

  visibleLinks.forEach((item) => {
    const row = document.createElement("div");
    row.className = "link-row";
    row.innerHTML = `
      <div class="link-info">
        <span class="link-category"></span>
        <div class="library-name"></div>
        <a class="library-meta" target="_blank" rel="noopener noreferrer"></a>
      </div>
      <button class="small-button" type="button">開啟</button>
      <button class="small-button" type="button">刪除</button>
    `;
    row.querySelector(".link-category").textContent = item.category || "未分類";
    row.querySelector(".library-name").textContent = item.name;
    const link = row.querySelector("a");
    link.href = item.url;
    link.textContent = item.url;
    const [openButton, deleteButton] = row.querySelectorAll("button");
    openButton.addEventListener("click", () => window.open(item.url, "_blank", "noopener,noreferrer"));
    deleteButton.addEventListener("click", async () => {
      await deleteItem("links", item.id);
      renderLinks();
    });
    list.appendChild(row);
  });
}

async function handleUploads(storeName, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  setStatus("儲存中");
  for (const file of files) {
    await saveItem(storeName, file);
  }
  if (storeName === "files") await renderFiles();
  if (storeName === "images") await renderImages();
  setStatus("完成");
}

async function handleLinkSubmit(event) {
  event.preventDefault();
  await saveLink({
    category: $("#linkCategory").value,
    name: $("#linkName").value,
    url: $("#linkUrl").value,
  });
  $("#linkForm").reset();
  await renderLinks();
  setStatus("已新增");
}

async function resetStorage() {
  await transact("files", "readwrite", (store) => store.clear());
  await transact("images", "readwrite", (store) => store.clear());
  await transact("links", "readwrite", (store) => store.clear());
  await renderFiles();
  await renderImages();
  await renderLinks();
  setStatus("已清除");
}

async function init() {
  state.db = await openDb();
  await renderFiles();
  await renderImages();
  await renderLinks();

  $$(".menu-item").forEach((button) => {
    button.addEventListener("click", () => switchTool(button.dataset.tool));
  });
  $$(".segment").forEach((button) => {
    button.addEventListener("click", () => setDirection(button.dataset.langFrom, button.dataset.langTo));
  });
  $("#translateButton").addEventListener("click", translateText);
  $("#swapButton").addEventListener("click", () => {
    const source = $("#sourceText").value;
    $("#sourceText").value = $("#translatedText").value;
    $("#translatedText").value = source;
    setDirection(state.to, state.from);
  });
  $("#ocrInput").addEventListener("change", (event) => runOcr(event.target.files[0]));
  $("#fileInput").addEventListener("change", (event) => handleUploads("files", event.target.files));
  $("#imageInput").addEventListener("change", (event) => handleUploads("images", event.target.files));
  $("#linkForm").addEventListener("submit", handleLinkSubmit);
  $("#linkCategoryFilter").addEventListener("change", renderLinks);
  $("#resetStorage").addEventListener("click", resetStorage);
}

init().catch(() => {
  setStatus("初始化失敗");
});
