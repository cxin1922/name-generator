/*
  全站共用工具函式：
  - 排序色階公式（設計文件第六節：深端錨點 #9E2020、淺端錨點 #E0A9A3 線性插值）
  - 已選標籤拖曳排序元件（桌面用滑鼠事件，手機用上下箭頭按鈕，見第十二節）
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

  // ---------- 分享（把單一候選編碼進網址參數，見 10.5） ----------
  // 注意：payload 是 base64 字串本身（未手動 encodeURIComponent），
  // URLSearchParams.set / .get 已自動處理網址層級的編碼/解碼，不需要再手動包一層。
  function buildShareUrl(candidate) {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(candidate))));
    const url = new URL(window.location.href);
    url.search = "";
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

  // 建立一個預設隱藏的分享選單（複製連結＋4 個平台），呼叫端自己決定要插在哪裡、
  // 用哪個按鈕觸發開關（見 baby-name.js／novel-name.js 的候選卡分享按鈕、分享全部按鈕）。
  function createShareMenu(url, text, copyMessage) {
    const links = buildPlatformShareLinks(url, text);
    const menu = document.createElement("div");
    menu.className = "share-menu";
    menu.hidden = true;

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "share-menu-item";
    copyBtn.textContent = "複製連結";
    copyBtn.addEventListener("click", () => {
      copyText(url, copyMessage);
      menu.hidden = true;
    });
    menu.appendChild(copyBtn);

    [
      { label: "LINE", href: links.line },
      { label: "Facebook", href: links.facebook },
      { label: "X", href: links.x },
      { label: "Threads", href: links.threads },
    ].forEach((item) => {
      const a = document.createElement("a");
      a.className = "share-menu-item";
      a.href = item.href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = item.label;
      menu.appendChild(a);
    });

    return menu;
  }

  // ---------- 已選標籤排序元件 ----------
  // items: [{key, label}]；桌面用滑鼠事件拖曳（見設計文件指示：滑鼠事件即可），
  // 手機（CSS 判斷）改用箭頭按鈕上下移動，兩者共用同一份 order 陣列與 onChange callback。
  function createTagSorter(container, onChange) {
    let order = []; // array of keys, index 0 = 最高優先

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

        container.appendChild(chip);
      });
    }

    function moveItem(from, to) {
      if (to < 0 || to >= order.length) return;
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      render();
      onChange(order.map((o) => o.key));
    }

    function startDrag(e, index) {
      e.preventDefault();
      const chips = Array.from(container.children);
      let currentIndex = index;
      const onMove = (moveEvt) => {
        const x = moveEvt.clientX;
        const y = moveEvt.clientY;
        const target = document.elementFromPoint(x, y);
        const chip = target ? target.closest(".selected-tag-chip") : null;
        if (chip && container.contains(chip)) {
          const hoverIndex = Array.from(container.children).indexOf(chip);
          if (hoverIndex !== -1 && hoverIndex !== currentIndex) {
            const [moved] = order.splice(currentIndex, 1);
            order.splice(hoverIndex, 0, moved);
            currentIndex = hoverIndex;
            render();
          }
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        onChange(order.map((o) => o.key));
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
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

  // ---------- 收藏查看區塊渲染（見 NOTES.md：判斷用「每個工具頁一個可展開區塊」而非獨立頁面） ----------
  // renderCardFn 由呼叫端（baby-name.js / novel-name.js）傳入，因為候選卡片的渲染方式
  // 兩個工具略有不同（欄位、標籤文字），這裡只負責「取收藏清單、決定要不要顯示空狀態」的共用邏輯。
  function renderFavoritesSection(tool, gridEl, emptyHintEl, countEl, renderCardFn) {
    const favs = getFavorites(tool).slice().reverse(); // 最近收藏的排前面
    if (countEl) countEl.textContent = String(favs.length);
    gridEl.innerHTML = "";
    if (favs.length === 0) {
      if (emptyHintEl) emptyHintEl.hidden = false;
      return;
    }
    if (emptyHintEl) emptyHintEl.hidden = true;
    favs.forEach((c) => gridEl.appendChild(renderCardFn(c)));
  }

  return {
    priorityColor,
    priorityWeight,
    toast,
    copyText,
    getFavorites,
    isFavorited,
    toggleFavorite,
    buildShareUrl,
    readSharedFromUrl,
    buildShareAllUrl,
    readSharedAllFromUrl,
    buildPlatformShareLinks,
    createShareMenu,
    renderFavoritesSection,
    createTagSorter,
    COMMON_SURNAMES,
    randomSurname,
  };
})();
