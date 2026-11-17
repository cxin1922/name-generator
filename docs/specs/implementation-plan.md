取名產生器網站，實作計畫

依賴順序，不是設計文件的章節順序。每一步標明對應設計文件（`name-generator-design.md`）的章節，避免執行時要整份翻找。

檔案結構

```
/index.html                首頁
/baby-name/index.html      寶寶取名工具頁
/novel-name/index.html     小說角色取名工具頁
/articles/<slug>.html      文章（陸續產出，先建好模板）
/css/style.css             全站共用樣式（色彩系統、頁首頁尾、按鈕/卡片）
/js/shared.js              共用工具函式（色階公式、localStorage 收藏、複製/分享）
/js/baby-name.js           寶寶取名比對/評分/表單邏輯
/js/novel-name.js          小說取名比對/評分/表單邏輯
/data/chars-base.json      共用漢字基礎資料
/data/baby-extra.json      寶寶取名專屬標籤（生肖宜忌、月份意象、字輩）
/data/novel-extra-gufeng.json    小說古風專屬標籤
/data/novel-extra-modern.json    小說現代專屬標籤
/data/novel-fantasy.json         西方奇幻音譯姓名庫（獨立，非漢字語意資料）
/data/novel-japanese.json        日系音譯姓名庫（獨立）
```

對應：檔案架構見第七節；色彩系統見第六節；URL 結構見 4.5、5.5。

建置順序

1. 共用漢字基礎資料（`chars-base.json`）。對應第七節。初版先建一批常用取名字（含性別傾向、寓意分類標籤），數量以能跑通比對邏輯、產出有意義的候選為準，不是一次補滿 200~300 字，完整量體之後再擴充。
2. `css/style.css`。對應第六節色票、10.1 排序色階公式、11.1/11.2 首頁與導覽樣式。
3. 寶寶取名工具頁。對應 4.1~4.5、第十節。表單兩頁、寓意/祝福拖曳排序（桌面）、比對/加權評分邏輯、結果頁 5 張候選卡（複製/收藏/分享）。用步驟 1 的資料跑通。
4. 首頁＋全站導覽元件。對應第十一節。
5. `baby-extra.json`、`novel-extra-gufeng.json`、`novel-extra-modern.json`。對應第七節專屬層。
6. 小說角色取名工具頁。對應 5.1~5.5、第十節（沿用同一套候選/篩選架構）。
7. `novel-fantasy.json`、`novel-japanese.json`（獨立姓名庫）。
8. 手機版適配。對應第十二節：首頁卡片改單欄、寓意/祝福排序改箭頭按鈕。
9. GA4 埋點、廣告版位（手動廣告單元，先埋版位標記，實際廣告碼待有 AdSense 帳號再補）。對應第二節、第八節。
10. 文章模板＋依清單陸續產出。對應第八節，分批發布不是一次做完。

驗證方式

每步做完用瀏覽器實際操作驗證，不是寫完就宣稱完成：核心流程（填表單、產生候選、排序、複製/收藏/分享）、RWD 手機尺寸、視覺跟色票比對。JSON 資料額外跑結構檢查（欄位完整、無重複、標籤值合法）。發現問題就地修正，不留到後面。
