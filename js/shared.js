/*
  全站共用工具函式：
  - 排序色階公式（設計文件第六節：深端錨點 #9E2020、淺端錨點 #E0A9A3 線性插值）
  - 已選標籤拖曳排序元件（桌面用滑鼠事件；觸控裝置長按拖曳，手機寬度另有上下箭頭按鈕，見第十二節、NOTES.md 第四十節）
  - 候選卡複製 / 收藏（localStorage）/ 分享（網址參數）（見 10.5 節）
*/

const NG = (function () {
  const SCALE_DARK = "#9E2020";
  const SCALE_LIGHT = "#E0A9A3";

  // 常見台灣姓氏，供「隨機姓氏」模式使用（寶寶取名、小說取名共用）。
  const COMMON_SURNAMES = [
    "陳", "林", "黃", "張", "李", "王", "吳", "劉", "蔡", "楊",
    "許", "鄭", "謝", "郭", "洪", "曾", "邱", "廖", "賴", "徐",
    "周", "葉", "蘇", "莊", "呂", "江", "何", "蕭", "羅", "高"
  ];

  function randomSurname() {
    return COMMON_SURNAMES[Math.floor(Math.random() * COMMON_SURNAMES.length)];
  }

  // ---------- 姓氏羅馬拼音對照（2026-11 新增，見 NOTES.md 第二十四節） ----------
  // 單字拆開存，一個字查一次：COMPOUND_SURNAMES（定義在 novel-name.js）是兩個字組成，
  // 這裡不用整個複姓當 key，是因為同一個字（例如「司」「公」「孫」）會在好幾個複姓裡重複
  // 出現，拆成單字查表可以共用、不用為每個複姓整體各寫一次。py 是漢語拼音（含聲調，
  // 跟 chars-base.json 的 pinyin 欄位同一種寫法），wg 是威妥瑪拼音（使用者確認用「簡化式」：
  // 不帶送氣撇號、不帶變音符號，一般英文文件/護照常見的寫法）。只收錄 COMMON_SURNAMES
  // 跟 COMPOUND_SURNAMES 裡實際會用到的字，使用者自訂輸入的姓氏查不到屬預期行為
  // （自訂輸入是任意文字，沒有查表依據，不臆測）。
  const SURNAME_ROMANIZATION = {
    "陳": { py: "chén", wg: "Chen" },
    "林": { py: "lín", wg: "Lin" },
    "黃": { py: "huáng", wg: "Huang" },
    "張": { py: "zhāng", wg: "Chang" },
    "李": { py: "lǐ", wg: "Li" },
    "王": { py: "wáng", wg: "Wang" },
    "吳": { py: "wú", wg: "Wu" },
    "劉": { py: "liú", wg: "Liu" },
    "蔡": { py: "cài", wg: "Tsai" },
    "楊": { py: "yáng", wg: "Yang" },
    "許": { py: "xǔ", wg: "Hsu" },
    "鄭": { py: "zhèng", wg: "Cheng" },
    "謝": { py: "xiè", wg: "Hsieh" },
    "郭": { py: "guō", wg: "Kuo" },
    "洪": { py: "hóng", wg: "Hung" },
    "曾": { py: "zēng", wg: "Tseng" },
    "邱": { py: "qiū", wg: "Chiu" },
    "廖": { py: "liào", wg: "Liao" },
    "賴": { py: "lài", wg: "Lai" },
    "徐": { py: "xú", wg: "Hsu" },
    "周": { py: "zhōu", wg: "Chou" },
    "葉": { py: "yè", wg: "Yeh" },
    "蘇": { py: "sū", wg: "Su" },
    "莊": { py: "zhuāng", wg: "Chuang" },
    "呂": { py: "lǚ", wg: "Lu" },
    "江": { py: "jiāng", wg: "Chiang" },
    "何": { py: "hé", wg: "Ho" },
    "蕭": { py: "xiāo", wg: "Hsiao" },
    "羅": { py: "luó", wg: "Lo" },
    "高": { py: "gāo", wg: "Kao" },
    "歐": { py: "ōu", wg: "Ou" },
    "陽": { py: "yáng", wg: "Yang" },
    "司": { py: "sī", wg: "Ssu" },
    "馬": { py: "mǎ", wg: "Ma" },
    "諸": { py: "zhū", wg: "Chu" },
    "葛": { py: "gě", wg: "Ko" },
    "上": { py: "shàng", wg: "Shang" },
    "官": { py: "guān", wg: "Kuan" },
    "皇": { py: "huáng", wg: "Huang" },
    "甫": { py: "fǔ", wg: "Fu" },
    "令": { py: "lìng", wg: "Ling" },
    "狐": { py: "hú", wg: "Hu" },
    "宇": { py: "yǔ", wg: "Yu" },
    "文": { py: "wén", wg: "Wen" },
    "長": { py: "zhǎng", wg: "Chang" },
    "孫": { py: "sūn", wg: "Sun" },
    "尉": { py: "yù", wg: "Yu" },
    "遲": { py: "chí", wg: "Chih" },
    "公": { py: "gōng", wg: "Kung" },
    "東": { py: "dōng", wg: "Tung" },
    "方": { py: "fāng", wg: "Fang" },
    "夏": { py: "xià", wg: "Hsia" },
    "侯": { py: "hóu", wg: "Hou" },
    "徒": { py: "tú", wg: "Tu" },
    "慕": { py: "mù", wg: "Mu" },
    "容": { py: "róng", wg: "Jung" },
    "赫": { py: "hè", wg: "Ho" },
    "連": { py: "lián", wg: "Lien" },
    "万": { py: "mò", wg: "Mo" },
    "俟": { py: "qí", wg: "Chi" },
    "澹": { py: "tán", wg: "Tan" },
    "臺": { py: "tái", wg: "Tai" },
    "鍾": { py: "zhōng", wg: "Chung" },
    "離": { py: "lí", wg: "Li" },
    "軒": { py: "xuān", wg: "Hsuan" },
    "轅": { py: "yuán", wg: "Yuan" },
    "端": { py: "duān", wg: "Tuan" },
    "木": { py: "mù", wg: "Mu" },
    "申": { py: "shēn", wg: "Shen" },
    "屠": { py: "tú", wg: "Tu" },
    "賀": { py: "hè", wg: "Ho" },
    "蘭": { py: "lán", wg: "Lan" },
    "完": { py: "wán", wg: "Wan" },
    "顏": { py: "yán", wg: "Yan" },
    "冶": { py: "yě", wg: "Yeh" },
    "宗": { py: "zōng", wg: "Tsung" },
    "政": { py: "zhèng", wg: "Cheng" },
    "濮": { py: "pú", wg: "Pu" },
    "淳": { py: "chún", wg: "Chun" },
    "于": { py: "yú", wg: "Yu" },
    "空": { py: "kōng", wg: "Kung" },
    "巫": { py: "wū", wg: "Wu" },
    "南": { py: "nán", wg: "Nan" },
    "宮": { py: "gōng", wg: "Kung" },
  };

  // 傳入完整姓氏字串（1 或 2 個字），逐字查表、逐字拼起來；只要姓氏裡有任何一個字查不到
  // 就整個回傳 null，不要「查到一半」的拼音（例如只有複姓裡其中一個字有資料，顯示出來
  // 會比完全不顯示更誤導）。
  function surnameRomanization(surname) {
    if (!surname) return null;
    const chars = Array.from(surname);
    const entries = chars.map((ch) => SURNAME_ROMANIZATION[ch]);
    if (entries.some((e) => !e)) return null;
    return {
      pinyin: entries.map((e) => e.py).join(" "),
      wadeGiles: entries.map((e) => e.wg).join(" "),
    };
  }

  // 組出「姓氏＋名字」的完整拼音／威妥瑪拼音字串，供候選卡顯示（10.5 節候選卡呈現內容）。
  // charInfos 是名字部分（不含姓氏）逐字查過 chars-base.json 的結果，每筆物件要有
  // pinyin／wadeGiles 欄位（charInfo 查不到的字，兩個欄位都會是空字串，這裡會自然略過，
  // 不會顯示 undefined 或空白字）。姓氏查不到羅馬拼音時（自訂輸入姓氏，或姓氏未收錄）
  // 就只顯示名字部分，不是整個不顯示——跟既有「部分字查不到拼音」的既有限制一致，
  // 使用者已經知道、接受這個限制（見 FAQ）。
  function buildRomanizedName(surname, charInfos) {
    const surnameRoman = surnameRomanization(surname);
    const givenPinyin = charInfos.map((i) => i.pinyin).filter(Boolean).join(" ");
    const givenWG = charInfos.map((i) => i.wadeGiles).filter(Boolean).join(" ");
    const pinyin = [surnameRoman ? surnameRoman.pinyin : "", givenPinyin].filter(Boolean).join(" ");
    const wadeGiles = [surnameRoman ? surnameRoman.wadeGiles : "", givenWG].filter(Boolean).join(" ");
    return { pinyin, wadeGiles };
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }

  function rgbToHex(r, g, b) {
    const toHex = (v) => Math.round(v).toString(16).padStart(2, "0");
    return "#" + toHex(r) + toHex(g) + toHex(b);
  }

  // 依使用者實際選了幾個標籤（N 個）自動算出 N 階漸層色，第 1 順位對應深端、第 N 順位對應淺端。
  function priorityColor(indexZeroBased, total) {
    if (total <= 1) return SCALE_DARK;
    const t = indexZeroBased / (total - 1);
    const a = hexToRgb(SCALE_DARK);
    const b = hexToRgb(SCALE_LIGHT);
    return rgbToHex(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t
    );
  }

  // 優先順序加權：第1順位×3、第2×2、第3×1（設計文件 4.3 定案數值）。
  // 第4順位之後沿用×1，屬實作時的合理延伸（文件原話：「權重具體數值待實作時微調」），詳見 NOTES.md。
  function priorityWeight(rankOneBased) {
    if (rankOneBased === 1) return 3;
    if (rankOneBased === 2) return 2;
    return 1;
  }

  // message 可以是字串或字串陣列；傳陣列時用換行符號疊加顯示（例如多欄位同時未填時，
  // 一次列出所有待修正項目，不要讓使用者填一個才看到下一個，見 NOTES.md）。
  function toast(message) {
    let el = document.getElementById("ng-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "ng-toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    const text = Array.isArray(message) ? message.join("\n") : message;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(el._timer);
    // 多行訊息字數較多，給比單行提示更長的閱讀時間。
    const duration = Array.isArray(message) && message.length > 1 ? 3200 : 1800;
    el._timer = setTimeout(() => el.classList.remove("show"), duration);
  }

  // successMessage 可自訂複製成功後的提示文字（例如分享連結不適合把整串網址塞進提示裡）。
  function copyText(text, successMessage) {
    const msg = successMessage || ("已複製「" + text + "」");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast(msg),
        () => fallbackCopy(text, msg)
      );
    } else {
      fallbackCopy(text, msg);
    }
  }

  function fallbackCopy(text, msg) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast(msg);
    } catch (e) {
      toast("複製失敗，請手動選取");
    }
    document.body.removeChild(ta);
  }

  // ---------- 收藏（localStorage，見 10.5） ----------
  // 兩個工具的收藏仍各自一把 key（ng_favorites_baby／ng_favorites_novel），資料不合併。
  // 第二十四輪起兩個工具頁都能透過側邊標籤讀寫「兩把 key」（同源 localStorage 本來就讀得到），見 NOTES.md 第三十節。
  const FAV_TOOLS = {
    baby: {
      label: "寶寶取名",
      dir: "baby-name",
      meaningFallback: "（字輩用字不在字庫收錄範圍內，暫無字義說明）",
    },
    novel: {
      label: "小說取名",
      dir: "novel-name",
      meaningFallback: "",
    },
  };
  // pageTool：目前所在的工具頁；viewTool：抽屜目前顯示哪個工具的收藏（由側邊標籤切換）。
  const favState = { pageTool: null, viewTool: null };

  function favKey(tool) {
    return "ng_favorites_" + tool;
  }

  function getFavorites(tool) {
    try {
      const raw = localStorage.getItem(favKey(tool));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function isFavorited(tool, candidateId) {
    return getFavorites(tool).some((c) => c.id === candidateId);
  }

  function toggleFavorite(tool, candidate) {
    const list = getFavorites(tool);
    const idx = list.findIndex((c) => c.id === candidate.id);
    let nowFavorited;
    if (idx >= 0) {
      list.splice(idx, 1);
      nowFavorited = false;
    } else {
      list.push(Object.assign({ savedAt: Date.now() }, candidate));
      nowFavorited = true;
    }
    try {
      localStorage.setItem(favKey(tool), JSON.stringify(list));
    } catch (e) {
      /* localStorage 不可用（隱私模式等）時，收藏在本次瀏覽仍可視覺切換，但不會被儲存 */
    }
    return nowFavorited;
  }

  // 第四十四節：收藏抽屜「清空收藏」——一次清掉目前正在看的那個工具的全部收藏（不影響另一個
  // 工具的收藏，兩邊本來就分開存放）。呼叫端自己負責先用 window.confirm 跟使用者確認，這裡
  // 只管清空本身，跟 toggleFavorite 一樣只處理資料，不管 UI 重繪。
  function clearAllFavorites(tool) {
    try {
      localStorage.setItem(favKey(tool), JSON.stringify([]));
    } catch (e) {
      /* 同上，localStorage 不可用時至少讓本次瀏覽視覺上清空 */
    }
  }

  // ---------- 分享（把單一候選編碼進網址參數，見 10.5） ----------
  // 注意：payload 是 base64 字串本身（未手動 encodeURIComponent），
  // URLSearchParams.set / .get 已自動處理網址層級的編碼/解碼，不需要再手動包一層。
  // 第二十四輪（側邊標籤跨工具收藏）：tool 選填。在 A 工具頁分享 B 工具的收藏時，連結要指向 B 工具頁
  // （分享區要用 B 工具的卡片渲染），所以 tool 不是目前頁面的工具時改用 "../<B 的資料夾>/" 當網址基底；
  // 沒傳或就是目前工具時維持原本「目前網址去掉參數」的做法。
  function buildShareUrl(candidate, tool) {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(candidate))));
    const url = tool && favState.pageTool && tool !== favState.pageTool && FAV_TOOLS[tool]
      ? new URL("../" + FAV_TOOLS[tool].dir + "/", window.location.href)
      : new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("shared", payload);
    return url.toString();
  }

  function readSharedFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("shared");
    if (!raw) return null;
    try {
      const json = decodeURIComponent(escape(atob(raw)));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  // ---------- 分享全部（把整批 5 個候選一起編碼進網址參數，見 NOTES.md） ----------
  // 用獨立的 ?sharedAll= 參數（不是重用 ?shared=），避免跟「分享單一候選」的舊連結
  // 解析邏輯混在一起、彼此誤判成另一種格式。
  function buildShareAllUrl(candidates) {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(candidates))));
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("sharedAll", payload);
    return url.toString();
  }

  function readSharedAllFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("sharedAll");
    if (!raw) return null;
    try {
      const json = decodeURIComponent(escape(atob(raw)));
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- 分享到社群平台（LINE／Facebook／X／Threads） ----------
  // 用各平台公開的分享 intent 網址，不需要串接任何平台的 API/SDK、不需要帳號權限。
  // 社群分享只用在頁尾「分享這個網站」（分享工具本身，不分享取名結果）。頁尾連結是寫死在
  // 各頁 HTML 裡的靜態網址（多數頁面沒載入本檔），組法與本函式一致；之後要改網址格式時兩邊要一起改。
  function buildPlatformShareLinks(url, text) {
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text || "");
    return {
      line: "https://social-plugins.line.me/lineit/share?url=" + encodedUrl,
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + encodedUrl,
      x: "https://twitter.com/intent/tweet?url=" + encodedUrl + (text ? "&text=" + encodedText : ""),
      // Threads 目前沒有獨立的 url 參數，照官方 intent 用法把文字跟網址併在同一個 text 參數裡。
      threads: "https://www.threads.net/intent/post?text=" + encodeURIComponent((text ? text + " " : "") + url),
    };
  }

  // ---------- 已選標籤排序元件 ----------
  // items: [{key, label}]；桌面用滑鼠事件拖曳；觸控裝置用「長按後拖曳」（NOTES.md 第四十節），
  // 手機寬度（CSS 判斷）另外保留箭頭按鈕上下移動當備援，三者共用同一份 order 陣列與 onChange callback。
  // 觸控長按：手指按住不動 TOUCH_HOLD_MS 才進入拖曳；在那之前手指移動超過 TOUCH_SLOP_PX 就當成捲動頁面、放棄拖曳，
  // 所以標籤上不設 touch-action: none（否則在標籤上滑動就捲不動頁面），改成進入拖曳後才在 touchmove 裡 preventDefault 擋捲動。
  const TOUCH_HOLD_MS = 350;
  const TOUCH_SLOP_PX = 10;
  function createTagSorter(container, onChange) {
    let order = []; // array of keys, index 0 = 最高優先
    let draggingIndex = -1; // 拖曳中的項目位置，render 後重新標上 .dragging

    function render() {
      container.innerHTML = "";
      if (order.length === 0) {
        container.classList.add("empty");
        return;
      }
      container.classList.remove("empty");
      order.forEach((item, i) => {
        const chip = document.createElement("div");
        chip.className = "selected-tag-chip";
        chip.draggable = false;
        chip.dataset.key = item.key;
        chip.style.backgroundColor = priorityColor(i, order.length);

        const label = document.createElement("span");
        label.textContent = item.label;
        chip.appendChild(label);

        const arrows = document.createElement("span");
        arrows.className = "tag-arrow-btns";
        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "▲";
        up.setAttribute("aria-label", "提高優先度");
        up.addEventListener("click", (e) => {
          e.stopPropagation();
          moveItem(i, i - 1);
        });
        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "▼";
        down.setAttribute("aria-label", "降低優先度");
        down.addEventListener("click", (e) => {
          e.stopPropagation();
          moveItem(i, i + 1);
        });
        arrows.appendChild(up);
        arrows.appendChild(down);
        chip.appendChild(arrows);

        const remove = document.createElement("span");
        remove.className = "remove-tag";
        remove.textContent = "×";
        remove.addEventListener("click", (e) => {
          e.stopPropagation();
          order.splice(i, 1);
          render();
          onChange(order.map((o) => o.key));
        });
        chip.appendChild(remove);

        chip.addEventListener("mousedown", (e) => startDrag(e, i));
        chip.addEventListener("touchstart", (e) => startTouchDrag(e, i), { passive: true });
        // Android 長按會跳出系統選單（contextmenu），拖曳用的長按要擋掉
        chip.addEventListener("contextmenu", (e) => e.preventDefault());
        if (i === draggingIndex) chip.classList.add("dragging");

        container.appendChild(chip);
      });
    }

    // 依指標（滑鼠/手指）目前位置，把拖曳中的項目移到指標下方那個標籤的位置；回傳新位置。
    function reorderAt(x, y, currentIndex) {
      const target = document.elementFromPoint(x, y);
      const chip = target ? target.closest(".selected-tag-chip") : null;
      if (chip && container.contains(chip)) {
        const hoverIndex = Array.from(container.children).indexOf(chip);
        if (hoverIndex !== -1 && hoverIndex !== currentIndex) {
          const [moved] = order.splice(currentIndex, 1);
          order.splice(hoverIndex, 0, moved);
          draggingIndex = hoverIndex;
          render();
          return hoverIndex;
        }
      }
      return currentIndex;
    }

    function moveItem(from, to) {
      if (to < 0 || to >= order.length) return;
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      render();
      onChange(order.map((o) => o.key));
    }

    function startDrag(e, index) {
      if (e.button !== 0) return;
      // 箭頭按鈕、× 移除鈕不從這裡起拖（跟 startTouchDrag 同一個判斷）。手機短按時瀏覽器會在 touchend 後
      // 補發模擬 mousedown/mouseup/click；若這裡照樣起拖，mouseup 的 onUp 會 render() 把按鈕整個換掉，
      // 瀏覽器找不到原本的按鈕就不派送 click，箭頭/× 就沒反應（NOTES.md 第四十九節）。
      if (e.target.closest("button, .remove-tag")) return;
      e.preventDefault();
      let currentIndex = index;
      // 一拿起來就馬上標上 .dragging＋容器加 .mouse-dragging（配合 CSS 的桌面拖曳視覺回饋，
      // NOTES.md 第四十三節），不用等滑鼠移到別的標籤上才第一次 render 出來。
      draggingIndex = currentIndex;
      container.classList.add("mouse-dragging");
      const chip = container.children[currentIndex];
      if (chip) chip.classList.add("dragging");
      const onMove = (moveEvt) => {
        currentIndex = reorderAt(moveEvt.clientX, moveEvt.clientY, currentIndex);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        draggingIndex = -1;
        container.classList.remove("mouse-dragging");
        render();
        onChange(order.map((o) => o.key));
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    // 觸控版：長按 TOUCH_HOLD_MS 後才開始拖曳。注意 touchmove/touchend 一律派送到 touchstart 當下的那個元素，
    // 即使它在拖曳途中被 render() 換掉、已經不在 DOM 裡；這時事件不會冒泡到 document，
    // 所以監聽器要直接掛在那個起始元素上（掛 document 的話第一次換位後就收不到後續事件）。
    function startTouchDrag(e, index) {
      if (e.touches.length !== 1) return;
      // 箭頭按鈕、× 移除鈕維持原本點按行為，不從這裡起拖
      if (e.target.closest("button, .remove-tag")) return;
      const el = e.target;
      const startX = e.touches[0].clientX;
      const startY = e.touches[0].clientY;
      let currentIndex = index;
      let active = false;
      const timer = setTimeout(() => {
        active = true;
        draggingIndex = currentIndex;
        container.classList.add("touch-dragging");
        const chip = container.children[currentIndex];
        if (chip) chip.classList.add("dragging");
      }, TOUCH_HOLD_MS);

      const cleanup = () => {
        clearTimeout(timer);
        el.removeEventListener("touchmove", onMove);
        el.removeEventListener("touchend", onEnd);
        el.removeEventListener("touchcancel", onEnd);
      };
      const onMove = (moveEvt) => {
        const t = moveEvt.touches[0];
        if (!active) {
          // 還沒長按到時間就移動＝使用者要捲動頁面，放棄這次拖曳
          if (Math.abs(t.clientX - startX) > TOUCH_SLOP_PX || Math.abs(t.clientY - startY) > TOUCH_SLOP_PX) cleanup();
          return;
        }
        moveEvt.preventDefault(); // 拖曳中不要捲動頁面
        currentIndex = reorderAt(t.clientX, t.clientY, currentIndex);
      };
      const onEnd = (endEvt) => {
        cleanup();
        if (!active) return; // 一般點按，交給原本的 click 行為
        // 擋掉手指放開後瀏覽器補發的模擬滑鼠事件（mousedown/click），避免再觸發一次滑鼠拖曳
        if (endEvt.cancelable) endEvt.preventDefault();
        draggingIndex = -1;
        container.classList.remove("touch-dragging");
        render();
        onChange(order.map((o) => o.key));
      };
      el.addEventListener("touchmove", onMove, { passive: false });
      el.addEventListener("touchend", onEnd);
      el.addEventListener("touchcancel", onEnd);
    }

    return {
      setItems(items) {
        // 保留已在 order 中且仍存在於 items 的項目順序，新加入的排在最後，移除不存在的
        const validKeys = new Set(items.map((it) => it.key));
        order = order.filter((o) => validKeys.has(o.key));
        items.forEach((it) => {
          if (!order.some((o) => o.key === it.key)) {
            order.push(it);
          } else {
            // 更新 label（分類定義不變，通常不需要，但保持一致）
            const existing = order.find((o) => o.key === it.key);
            existing.label = it.label;
          }
        });
        render();
        onChange(order.map((o) => o.key));
      },
      toggle(item) {
        const idx = order.findIndex((o) => o.key === item.key);
        if (idx >= 0) {
          order.splice(idx, 1);
        } else {
          order.push(item);
        }
        render();
        onChange(order.map((o) => o.key));
      },
      getOrder() {
        return order.map((o) => o.key);
      },
      isSelected(key) {
        return order.some((o) => o.key === key);
      },
    };
  }

  // ---------- 收藏抽屜＋側邊標籤（第二十四輪，見 NOTES.md 第三十節；取代第十九輪的懸浮按鈕） ----------
  // 兩個工具頁用同一組 DOM：#fav-tabs（兩個側邊標籤 [data-fav-tab="baby|novel"]）、#fav-drawer（抽屜本體）、
  // #fav-drawer-overlay（遮罩）、#fav-drawer-close、#fav-drawer-tool／#fav-drawer-count（抽屜標題）、
  // #fav-drawer-cross-note（看的是另一個工具時的說明）、#favorites-empty-hint、#favorites-grid。
  // 點標籤＝打開抽屜並顯示「那個標籤的工具」的收藏；抽屜已開著時點同一個標籤＝關閉，點另一個＝切換。
  // 點遮罩、按 Esc、點 × 都會關，開著時鎖住頁面捲動。
  //
  // 抽屜裡的收藏卡一律由這裡的 renderFavoriteCard 渲染（不再用各工具的 renderCandidateCard），
  // 因為在 A 工具頁要能渲染 B 工具的收藏，而 A 頁沒有載入 B 的 js。兩個工具的卡片在「沒有鎖定」時
  // 欄位完全一樣（姓名、拼音、字義、標籤、複製／收藏／分享），差別只有字義為空時的替代文字，放在 FAV_TOOLS。
  function renderFavoriteCard(tool, c) {
    const card = document.createElement("div");
    card.className = "candidate-card";

    const name = document.createElement("div");
    name.className = "candidate-name";
    name.textContent = c.fullName;
    card.appendChild(name);

    if (c.pinyin) {
      const py = document.createElement("div");
      py.className = "candidate-pinyin";
      py.textContent = c.wadeGiles ? c.pinyin + " ・ " + c.wadeGiles : c.pinyin;
      card.appendChild(py);
    }

    const meaning = document.createElement("div");
    meaning.className = "candidate-meaning";
    const meaningText = c.meaningSummary || FAV_TOOLS[tool].meaningFallback;
    meaningText.split("\n").forEach((line, idx) => {
      if (idx > 0) meaning.appendChild(document.createElement("br"));
      meaning.appendChild(document.createTextNode(line));
    });
    card.appendChild(meaning);

    if (c.matchedTags && c.matchedTags.length > 0) {
      const tags = document.createElement("div");
      tags.className = "candidate-tags";
      c.matchedTags.forEach((t) => {
        const tag = document.createElement("span");
        tag.className = "candidate-tag";
        tag.textContent = t;
        tags.appendChild(tag);
      });
      card.appendChild(tags);
    }

    const actions = document.createElement("div");
    actions.className = "candidate-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "icon-btn";
    copyBtn.textContent = "複製";
    copyBtn.addEventListener("click", () => copyText(c.fullName));
    actions.appendChild(copyBtn);

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "icon-btn" + (isFavorited(tool, c.id) ? " favorited" : "");
    favBtn.dataset.favId = c.id;
    favBtn.dataset.favTool = tool; // 讓 syncFavoriteButtons 知道這顆按鈕要對照哪一把 key
    favBtn.textContent = isFavorited(tool, c.id) ? "已收藏" : "收藏";
    favBtn.addEventListener("click", () => {
      const nowFav = toggleFavorite(tool, c);
      toast(nowFav ? "已加入收藏" : "已取消收藏");
      refreshFavorites();
    });
    actions.appendChild(favBtn);

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "icon-btn";
    shareBtn.textContent = "分享";
    shareBtn.addEventListener("click", () => {
      copyText(buildShareUrl(c, tool), "分享連結已複製，貼給朋友就能看到「" + c.fullName + "」");
    });
    actions.appendChild(shareBtn);

    card.appendChild(actions);
    return card;
  }

  // 收藏狀態一變（任何一邊新增/移除）就呼叫：更新兩個標籤的數字、抽屜標題、同步頁面上所有收藏按鈕、
  // 重畫抽屜目前顯示的那個工具的收藏列表。各工具頁的結果卡收藏後也呼叫這個（見 baby-name.js／novel-name.js）。
  function refreshFavorites() {
    Object.keys(FAV_TOOLS).forEach((tool) => {
      const n = String(getFavorites(tool).length);
      document.querySelectorAll('[data-fav-count="' + tool + '"]').forEach((el) => { el.textContent = n; });
    });
    if (favState.pageTool) syncFavoriteButtons(favState.pageTool);

    const tool = favState.viewTool;
    const gridEl = document.getElementById("favorites-grid");
    if (!tool || !gridEl) return;
    const favs = getFavorites(tool).slice().reverse(); // 最近收藏的排前面
    const toolEl = document.getElementById("fav-drawer-tool");
    const countEl = document.getElementById("fav-drawer-count");
    if (toolEl) toolEl.textContent = FAV_TOOLS[tool].label;
    if (countEl) countEl.textContent = String(favs.length);

    const note = document.getElementById("fav-drawer-cross-note");
    if (note) {
      const isOther = tool !== favState.pageTool;
      note.hidden = !isOther;
      note.innerHTML = "";
      if (isOther) {
        note.appendChild(document.createTextNode(
          "這是「" + FAV_TOOLS[tool].label + "」的收藏，跟目前頁面的收藏分開存放；分享連結會開啟" + FAV_TOOLS[tool].label + "頁面。"));
        const a = document.createElement("a");
        a.href = "/" + FAV_TOOLS[tool].dir + "/";
        a.textContent = "前往" + FAV_TOOLS[tool].label + " →";
        note.appendChild(a);
      }
    }

    const emptyHintEl = document.getElementById("favorites-empty-hint");
    gridEl.innerHTML = "";
    if (emptyHintEl) emptyHintEl.hidden = favs.length > 0;
    favs.forEach((c) => gridEl.appendChild(renderFavoriteCard(tool, c)));

    // 第四十四節：沒有收藏時「清空收藏」沒有對象可清，藏起來，避免使用者點了才發現沒東西可清。
    const clearBtn = document.getElementById("fav-drawer-clear");
    if (clearBtn) clearBtn.hidden = favs.length === 0;
  }

  // 候選卡的收藏按鈕帶 data-fav-id，收藏狀態一變就把頁面上所有同一個 id 的按鈕同步成最新狀態。
  // 第二十四輪：抽屜裡可能是另一個工具的卡，那些按鈕帶 data-fav-tool；沒帶的（結果區、分享區的卡）
  // 屬於目前頁面的工具，用參數 tool 對照。
  function syncFavoriteButtons(tool) {
    document.querySelectorAll("button[data-fav-id]").forEach((btn) => {
      const fav = isFavorited(btn.dataset.favTool || tool, btn.dataset.favId);
      btn.classList.toggle("favorited", fav);
      btn.textContent = fav ? "已收藏" : "收藏";
    });
  }

  function initFavoritesDrawer(pageTool) {
    favState.pageTool = pageTool;
    favState.viewTool = pageTool;
    const drawer = document.getElementById("fav-drawer");
    const overlay = document.getElementById("fav-drawer-overlay");
    const closeBtn = document.getElementById("fav-drawer-close");
    const tabs = Array.from(document.querySelectorAll("[data-fav-tab]"));
    if (!drawer || !overlay || tabs.length === 0) return;
    let lastTrigger = null;

    // 第五十一節：收藏只存在這台裝置的瀏覽器，第一次打開抽屜時在列表最上方提醒一次，之後不再出現。
    // 用 localStorage 旗標記「看過了」；兩個工具頁共用同一把旗標（同源），在哪一頁先看過都算。
    // 判斷時機是「從關閉變打開」的那一次 open()：抽屜開著時點另一個標籤切換工具也會呼叫 open()，
    // 那時不重新判斷，提示在這次打開期間維持顯示，關掉再開才消失。
    // localStorage 不可用（隱私模式等）時讀寫都會丟例外，這種情況收藏本來就存不住，每次打開都提醒。
    const STORAGE_WARNING_KEY = "ng_fav_warning_seen";
    const storageWarning = document.createElement("p");
    storageWarning.className = "fav-storage-warning";
    storageWarning.id = "fav-storage-warning";
    storageWarning.hidden = true;
    storageWarning.textContent = "💡 收藏只存在這台裝置的瀏覽器裡，清除瀏覽資料或換手機、換電腦就看不到了；想長期保留，請用卡片上的「分享」產生網址存起來。";
    const drawerBody = drawer.querySelector(".fav-drawer-body");
    if (drawerBody) drawerBody.insertBefore(storageWarning, drawerBody.firstChild);
    function shouldShowStorageWarning() {
      try {
        if (localStorage.getItem(STORAGE_WARNING_KEY) === "1") return false;
        localStorage.setItem(STORAGE_WARNING_KEY, "1");
      } catch (e) {
        /* localStorage 不可用：照樣顯示 */
      }
      return true;
    }

    function isOpen() {
      return drawer.classList.contains("open");
    }
    function markTabs() {
      tabs.forEach((t) => {
        const active = isOpen() && t.dataset.favTab === favState.viewTool;
        t.classList.toggle("active", active);
        t.setAttribute("aria-expanded", String(active));
      });
    }
    function open(tool, trigger) {
      if (!isOpen()) storageWarning.hidden = !shouldShowStorageWarning();
      favState.viewTool = tool;
      lastTrigger = trigger || null;
      refreshFavorites();
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      overlay.hidden = false;
      document.body.classList.add("fav-drawer-open");
      document.body.style.overflow = "hidden";
      markTabs();
      drawer.querySelector(".fav-drawer-body").scrollTop = 0;
      if (closeBtn) closeBtn.focus();
    }
    function close() {
      if (!isOpen()) return;
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      overlay.hidden = true;
      document.body.classList.remove("fav-drawer-open");
      document.body.style.overflow = "";
      markTabs();
      if (lastTrigger) lastTrigger.focus();
    }
    tabs.forEach((t) => {
      t.addEventListener("click", () => {
        const tool = t.dataset.favTab;
        if (isOpen() && favState.viewTool === tool) close();
        else open(tool, t);
      });
    });
    overlay.addEventListener("click", close);
    if (closeBtn) closeBtn.addEventListener("click", close);
    const clearBtn = document.getElementById("fav-drawer-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const tool = favState.viewTool;
        const n = getFavorites(tool).length;
        if (n === 0) return;
        if (!window.confirm("確定要清空「" + FAV_TOOLS[tool].label + "」的全部 " + n + " 筆收藏嗎？這個動作無法復原。")) return;
        clearAllFavorites(tool);
        refreshFavorites();
        toast("已清空「" + FAV_TOOLS[tool].label + "」的收藏");
      });
    }
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    // 同一個瀏覽器的其他分頁（例如另一個工具頁）改了收藏時，storage 事件會通知這一頁，數字跟列表即時同步。
    window.addEventListener("storage", (e) => {
      if (e.key === null || (e.key && e.key.indexOf("ng_favorites_") === 0)) refreshFavorites();
    });

    initFavTabsAdAvoidance(isOpen);
  }

  // 第五十一節：較窄螢幕（<1100px）收藏標籤 position:fixed 貼在畫面底邊，捲動時任何文件流元素都會從它底下經過，
  // 廣告版位（.ad-slot）經過那一段時會被標籤蓋住（實測 375px 寬最多蓋住佔位圖約 65～70%）。
  // 加大 .ad-slot 的 margin 只會改變「哪一個捲動位置」重疊，捲動途中一定還是會掃過，所以改成：
  // 只有當某個廣告版位真的進到標籤所在的那條底邊範圍時，標籤暫時往下收進畫面外（body.fav-tabs-yield），
  // 廣告一離開就自動滑回來。不動 z-index（標籤不會躲到廣告後面點不到），也不永久移位。
  // 抽屜開著、或標籤正有鍵盤焦點時一律不收，避免使用者正在操作時標籤消失。
  function initFavTabsAdAvoidance(isDrawerOpen) {
    const tabsEl = document.getElementById("fav-tabs");
    if (!tabsEl || !window.matchMedia) return;
    const narrow = window.matchMedia("(max-width: 1099px)");
    // 廣告貼近標籤上緣這個距離就先收：涵蓋標籤陰影，加上收起動畫（0.18s）期間快速捲動多走的距離，
    // 避免動畫還沒收完、廣告已經滑進標籤範圍的瞬間重疊。
    const GAP = 24;

    // 直接在 scroll 事件裡判斷、不另外包 requestAnimationFrame：瀏覽器本來就是每個畫格最多派發一次 scroll，
    // 這裡每次只讀幾個元素的位置，成本很低；而且少一層非同步，捲動當下就能決定收不收。
    function update() {
      let yieldTabs = false;
      // 只看「鍵盤聚焦」（:focus-visible）：用手點標籤關掉抽屜後，焦點會還給標籤按鈕且一直留在上面，
      // 如果用一般 focus 判斷，之後整段瀏覽標籤都不會再讓位。
      if (narrow.matches && !isDrawerOpen() && !tabsEl.querySelector(":focus-visible")) {
        // .fav-tabs 外框本身不位移（收起時位移的是裡面的 .fav-tab），所以它的位置永遠是標籤的「原位」。
        const t = tabsEl.getBoundingClientRect();
        yieldTabs = Array.from(document.querySelectorAll(".ad-slot")).some((ad) => {
          const a = ad.getBoundingClientRect();
          if (a.height === 0) return false; // 在 hidden 區塊裡（例如還沒產生結果）
          return a.bottom > t.top - GAP && a.top < t.bottom && a.right > t.left && a.left < t.right;
        });
      }
      document.body.classList.toggle("fav-tabs-yield", yieldTabs);
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    tabsEl.addEventListener("focusin", update);
    tabsEl.addEventListener("focusout", update);
    // 產生結果、切換表單步驟等版面變化不一定伴隨捲動，用 ResizeObserver 監看頁面高度變化補判斷一次。
    if (window.ResizeObserver) new ResizeObserver(update).observe(document.body);
    update();
  }

  // ---------- 分享連結專屬視圖（見 NOTES.md 第二十五節；第三十五節改版） ----------
  // 網址帶 ?shared= / ?sharedAll= 時，分享區塊在 HTML 裡排在表單上方。
  // 第三十五節起改成「顯示/隱藏」一個開關，由各工具的 showView 依目前畫面呼叫，不再自己綁按鈕事件：
  // - active=true（分享視圖）：分享區塊＋「我也要自己取名」顯示，表單（.form-card、.step-indicator）收起。
  // - active=false（使用者自己取名中：表單步驟 1/2 或自己的結果）：分享區塊整個 hidden（不移除 DOM，
  //   瀏覽器上一頁回到分享視圖時還要再顯示）。表單/結果區的顯示由呼叫端決定。
  // 「我也要自己取名」按鈕的點擊由各工具綁（要推一筆瀏覽紀錄，見 createViewHistory）。
  function setSharedViewActive(active) {
    const shared = document.getElementById("shared-section");
    const formCard = document.querySelector(".form-card");
    const indicator = document.querySelector(".step-indicator");
    const startBtn = document.getElementById("btn-start-own");
    // 「清除此頁／全部清空」（第三十八節的「清空重填」，第四十二節拆成兩顆、移到步驟指示同一列 .step-bar）：
    // 分享視圖本來就還沒有自己的表單內容，跟「我也要自己取名」功能重疊，分享視圖顯示中時整列收起，
    // 使用者進自己的表單/結果後才看得到。收的是整列而不是個別按鈕，避免步驟指示也藏起來後留下一列空白間距。
    const stepBar = document.querySelector(".step-bar");
    if (!shared) return;
    if (stepBar) stepBar.hidden = active;
    if (active) {
      cancelSharedCollapse(shared);
      shared.hidden = false;
      if (startBtn) startBtn.hidden = false;
      if (formCard) formCard.hidden = true;
      if (indicator) indicator.hidden = true;
      return;
    }
    // NOTES.md 第四十節：從分享視圖切到自己取名時，分享區塊不再瞬間 hidden，改成先淡出再收合高度，
    // 動畫結束才真的 hidden；下方表單同時淡入，scrollToWorkArea 會捲到表單「收合完成後」的位置。
    if (shared.hidden || shared.classList.contains("is-collapsing")) return;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      shared.hidden = true;
      if (startBtn) startBtn.hidden = true;
      return;
    }
    // 先量好「分享區塊收合後，後面的內容會往上移多少」，給 scrollToWorkArea 算捲動終點用。
    // 不用「暫時 hidden 再量」：這時表單也還 hidden，頁面會瞬間變短、捲動位置被瀏覽器夾住，量出來會錯。
    // 改用算的：收合前，後面內容的起點＝分享區塊底邊＋它的下 margin；收合後＝前一個元素（引言段落；
    // 第四十二節前是清空重填列）底邊＋它的下 margin（上下相鄰 margin 會疊成較大的那個；
    // 後面的步驟指示列 .step-bar 上 margin 為 0，不列入）。
    const prev = shared.previousElementSibling;
    const sharedRect = shared.getBoundingClientRect();
    const mb = (el) => parseFloat(getComputedStyle(el).marginBottom) || 0;
    const beforeTop = sharedRect.bottom + mb(shared);
    const afterTop = prev ? prev.getBoundingClientRect().bottom + mb(prev) : sharedRect.top;
    sharedCollapseShift = Math.max(0, beforeTop - afterTop);
    shared.style.maxHeight = shared.scrollHeight + "px";
    void shared.offsetHeight; // 強制重排，讓 max-height 從目前高度開始過渡
    shared.classList.add("is-collapsing");
    shared.style.maxHeight = "0px";
    document.documentElement.classList.add("ng-shared-leaving");
    if (formCard) formCard.classList.add("ng-fade-in");
    // 步驟指示列（含清除按鈕）整列一起淡入；沒有這一列的頁面退回只淡入步驟指示本身。
    if (stepBar) stepBar.classList.add("ng-fade-in");
    else if (indicator) indicator.classList.add("ng-fade-in");
    const finish = () => {
      if (!shared.classList.contains("is-collapsing")) return;
      cancelSharedCollapse(shared);
      shared.hidden = true;
      if (startBtn) startBtn.hidden = true;
    };
    shared.addEventListener("transitionend", function onEnd(e) {
      if (e.target !== shared || e.propertyName !== "max-height") return;
      shared.removeEventListener("transitionend", onEnd);
      finish();
    });
    sharedCollapseTimer = setTimeout(finish, 700); // transitionend 沒觸發時（例如分頁在背景）的保險
  }

  let sharedCollapseShift = 0;
  let sharedCollapseTimer = null;
  // 收合動畫中途被打斷（例如瀏覽器上一頁回到分享視圖）或正常結束時，清掉動畫用的 class 與行內樣式。
  function cancelSharedCollapse(shared) {
    clearTimeout(sharedCollapseTimer);
    shared.classList.remove("is-collapsing");
    shared.style.maxHeight = "";
    document.documentElement.classList.remove("ng-shared-leaving");
    document.querySelectorAll(".ng-fade-in").forEach((el) => el.classList.remove("ng-fade-in"));
  }

  // ---------- 表單步驟的瀏覽器上一頁／下一頁（見 NOTES.md 第三十五節） ----------
  // 工具頁的畫面依序是：分享視圖（只有網址帶分享參數時才有）→ 步驟 1 → 步驟 2 → 結果。
  // 每往前一步 pushState 一筆紀錄，網址加 ?step=1|2|result 標記（保留 ?shared= / ?sharedAll= 等其他參數，
  // 兩套參數互不干擾；沒有分享參數時步驟 1 不加 step，維持乾淨的原始網址）。紀錄的 state 存
  // { ngView, ngDepth }：ngDepth＝這筆紀錄底下還有幾筆「本頁自己推的」紀錄，用來判斷頁內按鈕
  // （上一步、修改條件）能不能直接 history.go(-n) 退回去，而不是再推一筆新的（再推會讓步驟 1 上面
  // 疊著舊的結果頁，到了步驟 1 按上一頁反而跑回結果，違反「步驟 1 再按上一頁就離開」）。
  // 步驟 1（或分享視圖）是 ngDepth 0 的那一筆，再按上一頁就是瀏覽器原本的上一個網頁，不會卡住。
  // opts.hasShared：這次載入有沒有分享內容；opts.render(view)：只負責畫面切換，不碰 history。
  const VIEW_ORDER = ["shared", "step1", "step2", "result"];

  function createViewHistory(opts) {
    let pendingTarget = null;
    // sid：這次頁面實例（一次新開的瀏覽）的識別碼，寫進每筆紀錄的 state，sessionStorage 的還原資料也用它分開存。
    // 同一個分頁可能先後開過好幾次同一個工具頁（例如自己的結果頁→點進別人的分享連結），不分開存的話，
    // 按上一頁回到前一次的頁面時會讀到後一次的資料。重新整理／上一頁回到同一筆紀錄時 state 還在，sid 不變。
    const initial = window.history.state;
    const sid = initial && initial.ngView && initial.ngSid
      ? initial.ngSid
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    function viewFromUrl() {
      const step = new URLSearchParams(window.location.search).get("step");
      if (step === "1") return "step1";
      if (step === "2") return "step2";
      if (step === "result") return "result";
      return opts.hasShared ? "shared" : "step1";
    }
    function urlFor(view) {
      const url = new URL(window.location.href);
      if (view === "shared" || (view === "step1" && !opts.hasShared)) url.searchParams.delete("step");
      else url.searchParams.set("step", view === "result" ? "result" : view.replace("step", ""));
      return url.pathname + url.search + url.hash;
    }
    function current() {
      const s = window.history.state;
      return s && s.ngView ? s : null;
    }
    function replace(view, depth) {
      window.history.replaceState({ ngView: view, ngDepth: depth, ngSid: sid }, "", urlFor(view));
    }
    function forward(view) {
      const cur = current();
      window.history.pushState({ ngView: view, ngDepth: cur ? cur.ngDepth + 1 : 1, ngSid: sid }, "", urlFor(view));
    }
    // 頁內按鈕要退回前面的畫面：底下的紀錄夠退就用 history.go 退（popstate 會畫面切換）；
    // 不夠退（例如直接用帶 ?step=2 的網址進來、底下沒有步驟 1 的紀錄）就先退到最底那筆，再把它改寫成目標畫面。
    function backTo(view) {
      const cur = current();
      if (!cur) { replace(view, 0); opts.render(view); return; }
      const stepsBack = VIEW_ORDER.indexOf(cur.ngView) - VIEW_ORDER.indexOf(view);
      if (stepsBack <= 0) { replace(view, cur.ngDepth); opts.render(view); return; }
      if (stepsBack <= cur.ngDepth) { window.history.go(-stepsBack); return; }
      if (cur.ngDepth === 0) { replace(view, 0); opts.render(view); return; }
      pendingTarget = view;
      window.history.go(-cur.ngDepth);
    }
    window.addEventListener("popstate", (e) => {
      let view = e.state && e.state.ngView ? e.state.ngView : viewFromUrl();
      if (pendingTarget) {
        view = pendingTarget;
        pendingTarget = null;
        replace(view, 0);
      }
      opts.render(view);
    });
    return {
      viewFromUrl,
      current,
      replace,
      forward,
      backTo,
      sid,
    };
  }

  // ---------- 重新整理時還原表單（sessionStorage，見 NOTES.md 第三十五節） ----------
  // 只在「這筆瀏覽紀錄本來就有本頁 state」（重新整理、上一頁回到本頁）時讀回，新開的瀏覽一律從空白表單開始。
  // key 帶 sid（見 createViewHistory），每次新開的頁面實例各存一份。sessionStorage 只活在這個分頁，
  // 關掉分頁就清掉；不可用（隱私模式等）時就退回空白表單，不報錯。
  function saveSession(tool, sid, data) {
    try { sessionStorage.setItem("ng_session_" + tool + "_" + sid, JSON.stringify(data)); } catch (e) { /* 不可用時略過 */ }
  }
  function loadSession(tool, sid) {
    try {
      const raw = sessionStorage.getItem("ng_session_" + tool + "_" + sid);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  // 「清空重填」用（第三十八節）：直接刪掉這個頁面實例存的表單狀態，不是存一份空的進去，
  // 避免跟 saveSession 的資料形狀耦合（之後欄位改了也不用兩邊同步改）。不可用時略過，跟 saveSession 一致。
  function clearSession(tool, sid) {
    try { sessionStorage.removeItem("ng_session_" + tool + "_" + sid); } catch (e) { /* 不可用時略過 */ }
  }

  // 分享區塊顯示中時，換頁／產生結果不要捲回頁面最頂端（頂端是別人分享的卡片，使用者會以為沒反應），
  // 改捲到自己正在操作的區塊。沒有分享區塊時維持原本的捲回頂端行為。
  // NOTES.md 第四十節：分享區塊正在收合（剛按「我也要自己取名」）時，捲到 el「收合完成後」的位置
  // （目前位置扣掉 setSharedViewActive 事先量好的位移），讓捲動跟收合同時進行、終點剛好停在表單上緣。
  function scrollToWorkArea(el) {
    const shared = document.getElementById("shared-section");
    if (shared && el && shared.classList.contains("is-collapsing")) {
      const top = el.getBoundingClientRect().top + window.scrollY - sharedCollapseShift - 8;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else if (shared && !shared.hidden && el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // ---------- 抽樣：排除本次瀏覽已看過的名字（見 NOTES.md 第二十五節、設計文件 10.3） ----------
  // sorted：已依分數排好、且已套用鎖定條件的候選清單；keyOf：取出「名字組合」的比對 key
  // （不含姓氏，因為隨機姓氏每批會換，同一個名字配不同姓氏仍算看過）；seen：呼叫端持有的 Set，
  // 只活在記憶體裡（分頁關掉/重新整理就清空），不寫 localStorage。
  // 做法：先只從「沒看過」的候選裡取分數前 topPoolSize 筆洗牌抽 count 個；沒看過的不夠 count 個時
  // （池子窮盡），先把剩下沒看過的全部放進來，不足的再從看過的候選補滿，回傳 exhausted=true，
  // 並把 seen 清空重新起算一輪（只留這一批），避免之後每次都在重複名字裡打轉。
  function sampleExcludingSeen(sorted, keyOf, seen, topPoolSize, count) {
    const picked = [];
    const pickedKeys = new Set();
    function take(list) {
      const head = list.slice(0, topPoolSize);
      shuffleInPlace(head);
      const ordered = head.concat(list.slice(topPoolSize));
      for (const item of ordered) {
        if (picked.length >= count) break;
        const k = keyOf(item);
        if (pickedKeys.has(k)) continue;
        pickedKeys.add(k);
        picked.push(item);
      }
    }
    take(sorted.filter((it) => !seen.has(keyOf(it))));
    let exhausted = false;
    if (picked.length < count) {
      exhausted = true;
      take(sorted.filter((it) => !pickedKeys.has(keyOf(it))));
      seen.clear();
    }
    picked.forEach((it) => seen.add(keyOf(it)));
    return { chosen: picked, exhausted };
  }

  // ---------- 名字固定、只剩姓氏能變時，一次抽多個不同姓氏（見 NOTES.md 第三十五節） ----------
  // 情境：寶寶取名單字名鎖住那個字、小說取名西方奇幻／日系輕小說鎖住整個名字，且姓氏是「隨機」又沒鎖姓。
  // 名字部分只剩一個組合，改用姓氏本身的隨機性撐出 count 張卡：從 pool 抽 count 個「不重複」的姓氏。
  // 排除已看過比對的是完整姓名（姓氏|名字 key），seenFull 是呼叫端另外持有的 Set（每批結果的完整姓名
  // 都會由呼叫端記進去，包含使用者鎖定前看到的那一批），所以同一批不會重複姓氏、下一批也不會再出現
  // 看過的「姓＋這個名字」。沒看過的姓氏不足 count 個時，比照 sampleExcludingSeen：先放沒看過的，
  // 不足的從看過的補、回傳 exhausted=true 並重新起算一輪。pool 本身不重複的姓氏就少於 count 個時
  // （目前三個姓氏池都 ≥30，理論上不會發生）才允許重複，依序輪流補，讓重複盡量分散。
  function pickSurnamesForFixedName(pool, givenKey, seenFull, count) {
    const unique = Array.from(new Set(pool));
    const { chosen, exhausted } = sampleExcludingSeen(
      unique, (s) => fullNameKey(s, givenKey), seenFull, unique.length, count
    );
    const surnames = chosen.slice();
    for (let i = 0; surnames.length < count && chosen.length > 0; i++) surnames.push(chosen[i % chosen.length]);
    return { surnames, exhausted };
  }

  function fullNameKey(surname, givenKey) {
    return (surname || "") + "|" + givenKey;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ---------- 鎖定單字（見 NOTES.md 第二十五節、設計文件 10.3） ----------
  // 鎖定是「整批」層級的條件，不是某張卡自己的狀態：鎖住某張卡的某個字之後，下一次「再產生一次」
  // 整批 5 個候選都會含有這個字（第四十四節起預設不限位置，見下方 lockUnitLabel 前說明；跟寶寶取名「固定字輩」同一種機制：先篩出符合的組合，
  // 再照原本的分數＋抽樣挑 5 個）。locks 物件由呼叫端持有：
  //   { surname: "陳" 或 null, given: { char: "宇", pos: null（只鎖字）或 0/1（字＋位置） } 或 null }
  // 姓氏可以另外鎖（只在隨機/複姓模式有意義），名字裡同一時間只鎖一個字（鎖兩個字＝整個名字固定，
  // 等於只剩一個組合，用收藏就好），鎖新的字會取代舊的。
  // units：這張卡可鎖定的單位，[{type:"surname", value}, {type:"given", pos, char}]，由呼叫端依工具規則決定。
  // 第二十三輪新增 {type:"given_pool", value}：小說取名西方奇幻／日系輕小說的名字是整筆從姓名庫抽出來的、
  // 不是逐字組合，所以把「整個名字」當一個單位鎖，鎖住時 locks.given = { pool: "名字" }（跟逐字鎖的
  // { pos, char } 共用 given 欄位：一個分類只會是其中一種，而且同樣「名字部分同一時間只鎖一個」）。
  // 第四十四節：逐字鎖預設「只鎖字、不鎖位置」，locks.given = { char, pos: null }，新一批只要名字任何位置有這個字就算；
  // 使用者在選字列另外按「也固定在首字／末字」才升級成 { char, pos: 0/1 }（字＋位置都鎖，等於原本的行為）。
  // unit.fixPos：這個單位一鎖就必須連位置一起鎖（寶寶取名開啟字輩時，每個組合本來就都有字輩字，只鎖字沒有意義，
  // 鎖字輩的用途就是指定它放第一字或第二字），這種單位不顯示「也固定位置」，標籤也直接講位置。
  // 單字名（givenLength <= 1）沒有位置可言，同樣不顯示「也固定位置」。
  function posLabel(pos) {
    return pos === 0 ? "首字" : "末字";
  }

  function canFixPos(unit, givenLength) {
    return unit.type === "given" && givenLength >= 2 && !unit.fixPos;
  }

  function givenPosFixed(locks) {
    return !!locks.given && locks.given.pool === undefined && locks.given.pos !== null && locks.given.pos !== undefined;
  }

  // 選字列按鈕上的文字。locked：這顆目前是否被鎖（鎖了位置時改講「名字首字」，讓按鈕本身反映目前狀態）。
  function lockUnitLabel(unit, givenLength, locks) {
    if (unit.type === "surname") return "姓「" + unit.value + "」";
    if (unit.type === "given_pool") return "名字「" + unit.value + "」";
    if (givenLength <= 1) return "名字「" + unit.char + "」";
    const posFixed = unit.fixPos || (locks && isUnitLocked(locks, unit) && givenPosFixed(locks));
    return posFixed ? "名字" + posLabel(unit.pos) + "「" + unit.char + "」" : "名字「" + unit.char + "」";
  }

  function isUnitLocked(locks, unit) {
    if (unit.type === "surname") return locks.surname === unit.value;
    if (unit.type === "given_pool") return !!locks.given && locks.given.pool === unit.value;
    if (!locks.given || locks.given.pool !== undefined || locks.given.char !== unit.char) return false;
    return !givenPosFixed(locks) || locks.given.pos === unit.pos;
  }

  function toggleLockUnit(locks, unit) {
    if (unit.type === "surname") {
      locks.surname = locks.surname === unit.value ? null : unit.value;
      return locks.surname !== null;
    }
    if (isUnitLocked(locks, unit)) {
      locks.given = null;
      return false;
    }
    locks.given = unit.type === "given_pool"
      ? { pool: unit.value }
      : { char: unit.char, pos: unit.fixPos ? unit.pos : null };
    return true;
  }

  // 篩選用：這組名字的字（陣列）符不符合目前的逐字鎖。只鎖字＝任何位置有這個字；鎖了位置＝該位置必須是這個字。
  // 不處理 given_pool（小說取名那個分支由呼叫端自己判斷）。
  function charsMatchGivenLock(locks, chars) {
    if (!locks.given) return true;
    if (!givenPosFixed(locks)) return chars.includes(locks.given.char);
    return chars[locks.given.pos] === locks.given.char;
  }

  // 建立候選卡上的「鎖定」按鈕＋展開的選字列。回傳 { button, panel, refresh }，refresh 讓呼叫端
  // 在任何一張卡改了鎖定後，把整批卡片的按鈕狀態一起更新（因為鎖定是整批層級的）。
  // 第二十三輪：這張卡原本有鎖定、refresh 後變成沒有任何鎖定（使用者在這張卡點掉、在別張卡改鎖而取代掉、
  // 或按「全部解除」），展開的選字列自動收合，回到跟沒展開過的卡一樣的外觀。只看「有→沒有」的轉變，
  // 不是「沒鎖就收合」：使用者剛展開、還沒選任何單位時，別張卡的鎖定變動不應該把它關掉。
  function buildLockControl(units, givenLength, locks, onChange) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-btn";
    const panel = document.createElement("div");
    panel.className = "lock-panel";
    panel.hidden = true;

    const hint = document.createElement("span");
    hint.className = "lock-panel-hint";
    // 可鎖單位裡有「整個名字」（西方奇幻／日系輕小說）時，「字」不貼切，改說「部分」。
    hint.textContent = units.some((u) => u.type === "given_pool") ? "選要保留的部分：" : "選要保留的字：";
    panel.appendChild(hint);

    const unitBtns = units.map((unit) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon-btn";
      b.addEventListener("click", () => {
        const before = lockUnitLabel(unit, givenLength, locks);
        const nowLocked = toggleLockUnit(locks, unit);
        let msg;
        if (!nowLocked) msg = "已取消鎖定" + before;
        else if (canFixPos(unit, givenLength)) {
          msg = "已鎖定「" + unit.char + "」，新一批名字都會有這個字（不限位置）；要連位置一起固定，再按「也固定在" + posLabel(unit.pos) + "」";
        } else {
          msg = "已鎖定" + lockUnitLabel(unit, givenLength, locks) + "，按「再產生一次」時新一批都會保留";
        }
        toast(msg);
        onChange();
      });
      panel.appendChild(b);
      // 「也固定位置」：只在這顆被鎖住時出現，緊接在它後面，點了在「只鎖字」「字＋位置」之間切換。
      let posBtn = null;
      if (canFixPos(unit, givenLength)) {
        posBtn = document.createElement("button");
        posBtn.type = "button";
        posBtn.className = "icon-btn lock-pos-btn";
        posBtn.hidden = true;
        posBtn.addEventListener("click", () => {
          if (!isUnitLocked(locks, unit)) return;
          if (givenPosFixed(locks)) {
            locks.given = { char: unit.char, pos: null };
            toast("已取消固定位置，「" + unit.char + "」可以出現在名字的首字或末字");
          } else {
            locks.given = { char: unit.char, pos: unit.pos };
            toast("已把「" + unit.char + "」固定在名字" + posLabel(unit.pos) + "，新一批的" + posLabel(unit.pos) + "都會是「" + unit.char + "」");
          }
          onChange();
        });
        panel.appendChild(posBtn);
      }
      return { unit, b, posBtn };
    });

    button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
    });
    button.setAttribute("aria-expanded", "false");

    let wasLocked = null; // 第一次 refresh 前未知，不觸發收合
    function refresh() {
      let any = false;
      unitBtns.forEach(({ unit, b, posBtn }) => {
        const locked = isUnitLocked(locks, unit);
        if (locked) any = true;
        b.classList.toggle("locked", locked);
        b.textContent = lockUnitLabel(unit, givenLength, locks) + (locked ? " 已鎖" : "");
        b.setAttribute("aria-pressed", String(locked));
        if (posBtn) {
          const fixed = locked && givenPosFixed(locks);
          posBtn.hidden = !locked;
          posBtn.classList.toggle("locked", fixed);
          posBtn.textContent = fixed ? "已固定在" + posLabel(unit.pos) : "也固定在" + posLabel(unit.pos);
          posBtn.setAttribute("aria-pressed", String(fixed));
        }
      });
      button.classList.toggle("locked", any);
      button.textContent = any ? "已鎖定" : "鎖定";
      if (wasLocked && !any && !panel.hidden) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
      wasLocked = any;
    }
    refresh();
    return { button, panel, refresh };
  }

  // 結果區下方的鎖定狀態列文字（沒有任何鎖定時回傳空字串，呼叫端據此隱藏）。
  // givenLength 選填：呼叫端確定名字固定是單字時傳 1（寶寶取名單字名，第二十二輪），顯示「名字「X」」而不是「名字首字」；
  // 小說取名不傳。第四十四節起：沒鎖位置顯示「名字裡有「X」（只鎖字，不限位置）」，鎖了位置才講「名字首字「X」」。
  function describeLocks(locks, givenLength) {
    const parts = [];
    if (locks.surname) parts.push("姓「" + locks.surname + "」");
    if (locks.given && locks.given.pool !== undefined) parts.push("名字「" + locks.given.pool + "」");
    else if (locks.given && (givenLength === 1)) parts.push("名字「" + locks.given.char + "」");
    else if (locks.given && givenPosFixed(locks)) parts.push("名字" + posLabel(locks.given.pos) + "「" + locks.given.char + "」（字和位置都固定）");
    else if (locks.given) parts.push("名字裡有「" + locks.given.char + "」（只鎖字，不限位置）");
    return parts.join("、");
  }

  return {
    priorityColor,
    priorityWeight,
    toast,
    copyText,
    getFavorites,
    isFavorited,
    toggleFavorite,
    clearAllFavorites,
    buildShareUrl,
    readSharedFromUrl,
    buildShareAllUrl,
    readSharedAllFromUrl,
    buildPlatformShareLinks,
    refreshFavorites,
    syncFavoriteButtons,
    initFavoritesDrawer,
    setSharedViewActive,
    createViewHistory,
    saveSession,
    loadSession,
    clearSession,
    scrollToWorkArea,
    sampleExcludingSeen,
    pickSurnamesForFixedName,
    fullNameKey,
    buildLockControl,
    describeLocks,
    charsMatchGivenLock,
    createTagSorter,
    COMMON_SURNAMES,
    randomSurname,
    surnameRomanization,
    buildRomanizedName,
  };
})();
