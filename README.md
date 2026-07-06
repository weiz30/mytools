# MyTools

MyTools 是一個可擴充的個人工具網站。第一版包含：

- 翻譯功能：英翻中、中翻英
- 圖片截字：上傳圖片後以 OCR 擷取文字
- 檔案庫：上傳、下載、刪除檔案
- 圖片庫：上傳、瀏覽、下載、刪除圖片

## 使用方式

直接開啟 `index.html`，或部署到 GitHub Pages。

翻譯使用 MyMemory 公開翻譯 API。圖片截字使用 `tesseract.js` CDN，第一次使用需要網路載入 OCR 模組。

檔案庫與圖片庫使用瀏覽器 IndexedDB，本機保存，不會自動同步到雲端。

## 擴充新功能

1. 在 `index.html` 的 `.menu` 新增功能按鈕。
2. 在主內容區新增對應的 `.tool-panel`。
3. 在 `app.js` 的 `tools` 物件註冊名稱。
4. 加入該功能需要的事件處理與資料流程。
