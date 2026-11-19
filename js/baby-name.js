/*
  寶寶取名工具邏輯。
  對應設計文件 4.1~4.5、第十節（候選產生與排序規則，兩工具共用）。
*/

(function () {
  // 9 個分類（設計文件 4.3，原為 7 個，MVP 使用者體驗後補上「快樂」「堅毅」）。
  const MEANING_CATEGORIES = [
    { key: "智慧", label: "智慧" },
    { key: "健康", label: "健康" },
    { key: "勇敢", label: "勇敢" },
    { key: "善良", label: "善良" },
    { key: "美麗", label: "美麗" },
    { key: "富貴", label: "富貴" },
    { key: "平安", label: "平安" },
    { key: "快樂", label: "快樂" },
    { key: "堅毅", label: "堅毅" },
  ];

  // 同義詞庫（4.3：自由輸入文字時用來比對分類）。
  const SYNONYMS = {
    智慧: ["聰明", "智慧", "聰慧", "靈巧", "睿智", "才智", "穎悟", "博學", "聰穎", "聰明伶俐", "有智慧", "明辨是非", "見識廣博"],
    健康: ["健康", "強壯", "平安健康", "茁壯", "康健", "安康", "活力", "強健", "身體好", "頭好壯壯", "朝氣蓬勃", "神采奕奕"],
    勇敢: ["勇敢", "勇氣", "堅強", "無畏", "剛毅", "果敢", "英勇", "膽識", "不怕困難", "有膽量"],
    善良: ["善良", "溫柔", "仁慈", "善解人意", "慈悲", "和善", "寬厚", "體貼", "心地好", "有愛心"],
    美麗: ["美麗", "漂亮", "優雅", "秀麗", "清秀", "美好", "動人", "氣質好", "好看"],
    富貴: ["富貴", "財富", "富裕", "顯達", "榮華", "富足", "興旺", "顯貴", "有錢", "飛黃騰達", "光耀", "顯耀"],
    平安: ["平安", "順遂", "安穩", "平順", "安康", "順利", "康寧", "吉祥", "一生平安", "順風順水"],
    快樂: ["快樂", "開心", "愉快", "歡樂", "喜樂", "高興", "歡喜", "心情好", "笑口常開", "無憂無慮", "歡欣", "樂觀", "舒心", "自在"],
    堅毅: ["堅毅", "堅強", "毅力", "不屈", "堅韌", "堅定", "不放棄", "百折不撓", "意志堅定", "咬牙撐過去", "越挫越勇", "有韌性", "鬥志"],
  };

  let charsBase = null;
  let babyExtra = null;

  const state = {
    surnameMode: "random",
    surnameCustom: "",
    // 1 = 兩字全名（單字名）；2 = 三字全名（雙字名）。第四十二節起預設雙字名（HTML 的 active 按鈕、
    // #generation-field 預設顯示要跟這裡一致；全部清空／清除此頁也寫回同一個預設值 DEFAULT_NAME_LENGTH）。
    nameLength: 2,
    useGenerationChar: false,
    generationChar: "",
    gender: "unisex",
    birthMonth: "",
    zodiacId: "",
  };

  const DEFAULT_NAME_LENGTH = 2;

  let meaningSorter = null;
  let currentStep = 1;
  let lastCandidates = [];
  // 第十九輪（NOTES.md 第二十五節）：鎖定單字＋排除已看過。兩者都只存在記憶體，不寫 localStorage。
  // locks 是整批層級的條件（見 shared.js buildLockControl 說明）；lastLockMeta 跟 lastCandidates
  // 一一對應，記錄每張結果卡的字組成與可鎖定單位，不塞進候選物件本身（候選物件會被收藏/分享序列化）。
  const locks = { surname: null, given: null };
  const seenNames = new Set();
  // 第三十五節：完整姓名（姓氏|名字）層級的已看過紀錄，只給「名字固定、只換姓氏」情境抽姓氏時比對用
  // （NG.pickSurnamesForFixedName）。每批結果的完整姓名都記進來，包含鎖定前看到的那一批。
  const seenFullNames = new Set();
  let lastLockMeta = [];
  let lockControls = [];
  // 第三十五節：瀏覽器上一頁／下一頁對應表單步驟（NG.createViewHistory）。currentView 是目前畫面：
  // "shared"（分享視圖）／"step1"／"step2"／"result"。
  let viewHistory = null;
  let currentView = "step1";
  let hasSharedContent = false;
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  async function init() {
    const [cb, be] = await Promise.all([
      fetch("../data/chars-base.json").then((r) => r.json()),
      fetch("../data/baby-extra.json").then((r) => r.json()),
    ]);
    charsBase = cb;
    babyExtra = be;

    populateZodiacSelect();
    decorateMonthSelect();
    bindOptionRows();
    bindGenerationField();
    bindMeaningField();
    bindStepNav();
    bindResultActions();
    bindResetForm();
    NG.initFavoritesDrawer("baby");
    refreshFavoritesSection();

    let sharedList = null;
    const sharedAll = NG.readSharedAllFromUrl();
    if (sharedAll && sharedAll.length > 0) {
      sharedList = sharedAll;
    } else {
      const shared = NG.readSharedFromUrl();
      if (shared) sharedList = [shared];
    }
    if (sharedList) renderSharedCandidates(sharedList);
    hasSharedContent = !!sharedList;
    $("#btn-start-own").addEventListener("click", () => {
      viewHistory.forward("step1");
      showView("step1");
    });

    initViewHistory();
  }

  // 第三十五節：決定載入時要顯示哪個畫面。重新整理／上一頁回到本頁（紀錄上已有本頁 state）時，
  // 從 sessionStorage 還原表單與上一批結果，回到原本的畫面；新開的瀏覽一律從頭（分享視圖或步驟 1），
  // 網址上殘留的 ?step= 會被改寫掉。還原不了的畫面往前退（結果→步驟 2；沒有分享內容的分享視圖→步驟 1），
  // 退的時候 ngDepth 歸零，避免底下紀錄跟畫面順序對不上。
  function initViewHistory() {
    viewHistory = NG.createViewHistory({ hasShared: hasSharedContent, render: showView });
    window.addEventListener("pagehide", saveSession);
    let view = hasSharedContent ? "shared" : "step1";
    let depth = 0;
    const cur = viewHistory.current();
    if (cur) {
      const session = NG.loadSession("baby", viewHistory.sid);
      if (session) {
        restoreSession(session);
        view = cur.ngView;
        depth = cur.ngDepth;
      }
    }
    let fallback = view;
    if (fallback === "result" && lastCandidates.length === 0) fallback = "step2";
    if (fallback === "shared" && !hasSharedContent) fallback = "step1";
    if (fallback !== view) { view = fallback; depth = 0; }
    viewHistory.replace(view, depth);
    showView(view);
  }

  function saveSession() {
    NG.saveSession("baby", viewHistory.sid, {
      state,
      meaningOrder: meaningSorter.getOrder(),
      meaningFreeText: $("#meaning-free-text").value,
      lastCandidates,
      lastLockMeta,
    });
  }

  // 把 sessionStorage 的表單內容寫回 state 與畫面（按鈕 active、輸入框、下拉選單、寓意排序）。
  // 鎖定與「已看過」依原本設計只活在記憶體（第二十五節），重新整理後不還原。
  function restoreSession(s) {
    Object.assign(state, s.state || {});
    $all("#baby-form .option-row").forEach((row) => {
      const v = String(state[row.dataset.field]);
      row.querySelectorAll(".option-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === v));
    });
    $("#surname-custom").value = state.surnameCustom || "";
    $("#surname-custom").hidden = state.surnameMode !== "custom";
    $("#generation-field").hidden = state.nameLength !== 2;
    $("#generation-toggle").checked = !!state.useGenerationChar;
    $("#generation-char").value = state.generationChar || "";
    $("#generation-char").hidden = !state.useGenerationChar;
    $("#birth-month").value = state.birthMonth || "";
    $("#zodiac").value = state.zodiacId || "";
    const items = (s.meaningOrder || [])
      .map((k) => MEANING_CATEGORIES.find((c) => c.key === k))
      .filter(Boolean)
      .map((c) => ({ key: c.key, label: c.label }));
    meaningSorter.setItems(items);
    $("#meaning-free-text").value = s.meaningFreeText || "";
    lastCandidates = Array.isArray(s.lastCandidates) ? s.lastCandidates : [];
    lastLockMeta = Array.isArray(s.lastLockMeta) ? s.lastLockMeta : [];
    if (lastCandidates.length > 0) renderCandidates(lastCandidates);
  }

  // 只負責畫面切換，不碰 history（history 由呼叫端或 popstate 處理）。
  function showView(view) {
    if (view === "result" && lastCandidates.length === 0) view = "step2";
    if (view === "shared" && !hasSharedContent) view = "step1";
    currentView = view;
    if (view === "shared") {
      NG.setSharedViewActive(true);
      $("#result-section").hidden = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // 使用者已經在自己取名（表單或自己的結果），分享區塊整個隱藏（第三十五節）。
    NG.setSharedViewActive(false);
    // 第四十五節：結果頁的「全部清空」原本留在 .step-bar 裡（只隱藏文字），步驟指示文字一消失，
    // 這顆按鈕變成孤零零浮在右邊一整排空白中，跟下面「為你找到的 N 個名字」對不上。改成結果頁
    // 整條 .step-bar 都收起，改用 .result-toolbar 裡新增的 #btn-reset-form-result（跟標題同一列，
    // 左右對齊），兩顆按鈕共用同一個 resetForm，行為完全一樣，只是結果頁換了個位置的按鈕。
    $(".step-bar").hidden = view === "result";
    if (view === "result") {
      $(".form-card").hidden = true;
      $("#result-section").hidden = false;
      NG.scrollToWorkArea($("#result-section"));
      return;
    }
    $("#result-section").hidden = true;
    $(".form-card").hidden = false;
    hideStepError();
    goToStep(view === "step2" ? 2 : 1);
  }

  // 收藏查看區塊（5.：候選卡收藏/取消收藏時都要呼叫，讓區塊即時同步）。
  // 第二十四輪：抽屜與兩個側邊標籤（寶寶取名／小說取名）由 shared.js 統一渲染，見 NOTES.md 第三十節。
  function refreshFavoritesSection() {
    NG.refreshFavorites();
  }

  function populateZodiacSelect() {
    const select = $("#zodiac");
    babyExtra.zodiacs.forEach((z) => {
      const opt = document.createElement("option");
      opt.value = z.id;
      opt.textContent = z.label;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => { state.zodiacId = select.value; });
  }

  function decorateMonthSelect() {
    const select = $("#birth-month");
    Array.from(select.options).forEach((opt) => {
      if (!opt.value) return;
      const bonus = babyExtra.monthTagBonus[opt.value];
      if (bonus) opt.textContent = opt.value + " 月（" + bonus.themeLabel + "）";
    });
    select.addEventListener("change", () => { state.birthMonth = select.value; });
  }

  function bindOptionRows() {
    $all(".option-row").forEach((row) => {
      const field = row.dataset.field;
      row.addEventListener("click", (e) => {
        const btn = e.target.closest(".option-btn");
        if (!btn) return;
        row.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const value = btn.dataset.value;

        if (field === "surnameMode") {
          state.surnameMode = value;
          $("#surname-custom").hidden = value !== "custom";
        } else if (field === "nameLength") {
          state.nameLength = Number(value);
          $("#generation-field").hidden = state.nameLength !== 2;
        } else if (field === "gender") {
          state.gender = value;
        }
        refreshStepErrorIfShown();
      });
    });

    bindChineseOnlyInput($("#surname-custom"), 4, (filtered) => {
      state.surnameCustom = filtered.trim();
      refreshStepErrorIfShown();
    });
  }

  // 使用者要求：「自訂輸入姓氏」「固定字輩」這兩個欄位只接受中文字（繁簡皆可），
  // 輸入當下就把不合法字元（英文、數字、符號、emoji 等）濾掉，不是等送出才擋。
  // 只用常用的中日韓統一表意文字範圍 \u4e00-\u9fff，不做生僻字擴展區，這個專案場景夠用。
  function filterToChineseChars(text) {
    return text.replace(/[^\u4e00-\u9fff]/g, "");
  }

  // \u4f7f\u7528\u8005\u56de\u5831\uff08Mac \u6ce8\u97f3\uff09\uff1a\u9019\u5169\u500b\u6b04\u4f4d\u7528\u4e2d\u6587\u8f38\u5165\u6cd5\u5b8c\u5168\u6253\u4e0d\u9032\u53bb\u3002\u6839\u56e0\uff1a\u8f38\u5165\u6cd5\u7d44\u5b57\u671f\u9593
  // \u700f\u89bd\u5668\u6703\u9023\u7e8c\u89f8\u767c input \u4e8b\u4ef6\uff0c\u6b04\u4f4d\u503c\u662f\u300c\u3114\u3123\u02ca\u300d\u9019\u985e\u9084\u6c92\u9078\u5b57\u7684\u4e2d\u9593\u72c0\u614b\uff0c\u539f\u672c\u7684\u5373\u6642
  // \u904e\u6ffe\u6bcf\u6b21\u90fd\u628a\u6ce8\u97f3\u7b26\u865f\u7576\u4e0d\u5408\u6cd5\u5b57\u5143\u6ffe\u6389\uff0c\u7d44\u5b57\u88ab\u6e05\u7a7a\uff0c\u6c38\u9060\u9078\u4e0d\u5230\u5b57\u3002\u4fee\u6cd5\uff1a\u7528
  // compositionstart\uff0fcompositionend \u8ffd\u8e64\u300c\u662f\u5426\u6b63\u5728\u7d44\u5b57\u300d\uff0c\u7d44\u5b57\u4e2d\u7684 input \u4e00\u5f8b\u8df3\u904e\uff0c
  // \u8b93\u8f38\u5165\u6cd5\u81ea\u5df1\u5b8c\u6210\uff1bcompositionend\uff08\u4f7f\u7528\u8005\u9078\u5b9a\u5b57\u7684\u7576\u4e0b\uff09\u7acb\u523b\u88dc\u8dd1\u4e00\u6b21\u5b8c\u6574\u904e\u6ffe\u3002
  // \u975e\u8f38\u5165\u6cd5\u60c5\u5883\uff08\u76f4\u63a5\u6253\u82f1\u6587\u3001\u8cbc\u4e0a\u3001\u522a\u9664\uff09\u6c92\u6709 composition \u4e8b\u4ef6\uff0c\u7dad\u6301\u5373\u6642\u904e\u6ffe\u3002
  // \u5b57\u6578\u4e0a\u9650\u4e5f\u6539\u7531\u9019\u88e1 slice \u63a7\u5236\u3001HTML \u4e0d\u518d\u8a2d maxlength\uff1amaxlength \u7b97\u7684\u662f\u6b04\u4f4d\u88e1\u7684
  // \u5b57\u5143\u6578\uff0c\u7d44\u5b57\u4e2d\u7684\u6ce8\u97f3\u7b26\u865f\u4e5f\u53ef\u80fd\u88ab\u7b97\u9032\u53bb\uff08\u300c\u3110\u3127\u311a\u300d\u5c31 3 \u500b\uff09\uff0c\u4e0a\u9650 1 \u7684\u5b57\u8f29\u6b04\u4f4d
  // \u6709\u88ab\u700f\u89bd\u5668\u539f\u751f\u622a\u65b7\u3001\u7834\u58de\u7d44\u5b57\u7684\u98a8\u96aa\uff1b\u6539\u6210\u9078\u5b9a\u5b57\u4e4b\u5f8c\u624d\u622a\u65b7\uff0c\u5169\u8005\u4e0d\u6703\u4e92\u76f8\u84cb\u6389\u3002
  function bindChineseOnlyInput(input, maxChars, onChange) {
    let composing = false;
    const apply = () => {
      const filtered = filterToChineseChars(input.value).slice(0, maxChars);
      if (filtered !== input.value) input.value = filtered;
      onChange(filtered);
    };
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; apply(); });
    input.addEventListener("input", () => {
      if (composing) return;
      apply();
    });
  }

  function bindGenerationField() {
    const toggle = $("#generation-toggle");
    const input = $("#generation-char");
    toggle.addEventListener("change", () => {
      state.useGenerationChar = toggle.checked;
      input.hidden = !toggle.checked;
      refreshStepErrorIfShown();
    });
    bindChineseOnlyInput(input, 1, (filtered) => {
      state.generationChar = filtered;
      refreshStepErrorIfShown();
    });
  }

  // 使用者回報：改選「不需要」等動作解決了欄位缺漏，但第 1 頁的錯誤訊息沒有跟著消失，
  // 要再點一次「下一步」才會重新檢查。問題在於 showStepError／hideStepError 原本只在
  // 按鈕點擊當下被呼叫一次，欄位本身變動完全不會觸發重新驗證。修法：只要訊息目前正顯示中，
  // 任何會影響必填判斷的欄位一變動（姓氏模式、自訂姓氏文字、固定字輩開關、字輩文字）就立刻
  // 重新跑一次 validateStep1()，已解決的項目就把訊息收掉，還沒解決的項目則更新成最新內容，
  // 不是等使用者再點一次下一步才後知後覺。訊息目前沒顯示時什麼都不做，不會因為欄位變動
  // 就提前跳出來打斷使用者還在輸入的過程。
  function refreshStepErrorIfShown() {
    const el = $("#step-error");
    if (el.hidden) return;
    const errors = validateStep1();
    if (errors.length === 0) {
      hideStepError();
    } else {
      showStepError(errors);
    }
  }

  function bindMeaningField() {
    const pickRow = $("#meaning-tag-pick");
    MEANING_CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag-pick";
      btn.dataset.key = cat.key;
      btn.textContent = cat.label;
      pickRow.appendChild(btn);
    });

    const selectedRow = $("#meaning-selected");
    meaningSorter = NG.createTagSorter(selectedRow, (order) => {
      pickRow.querySelectorAll(".tag-pick").forEach((btn) => {
        btn.classList.toggle("selected", order.includes(btn.dataset.key));
      });
      $("#meaning-empty-hint").hidden = order.length > 0;
    });
    meaningSorter.setItems([]);

    pickRow.addEventListener("click", (e) => {
      const btn = e.target.closest(".tag-pick");
      if (!btn) return;
      const cat = MEANING_CATEGORIES.find((c) => c.key === btn.dataset.key);
      meaningSorter.toggle({ key: cat.key, label: cat.label });
    });

    const freeText = $("#meaning-free-text");
    const hint = $("#meaning-free-text-hint");
    let debounceTimer = null;
    freeText.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const value = freeText.value.trim();
        if (!value) { hint.textContent = ""; return; }
        const matched = matchCategoriesFromText(value);
        if (matched.length > 0) {
          matched.forEach((key) => {
            const cat = MEANING_CATEGORIES.find((c) => c.key === key);
            if (!meaningSorter.isSelected(key)) meaningSorter.toggle({ key: cat.key, label: cat.label });
          });
          hint.textContent = "已自動比對到「" + matched.join("、") + "」分類";
        } else {
          hint.textContent = "沒有完全對應的分類，可直接從下方標籤點選";
        }
      }, 400);
    });
  }

  function matchCategoriesFromText(text) {
    const matched = [];
    Object.keys(SYNONYMS).forEach((key) => {
      const hit = SYNONYMS[key].some((word) => text.includes(word) || word.includes(text));
      if (hit) matched.push(key);
    });
    return matched;
  }

  // 回傳第 1 頁目前未滿足的必填項目清單；兩個欄位都沒填時會回傳兩條，
  // 讓 showStepError 一次疊加顯示，不是填一個才看到下一個（見 NOTES.md）。
  // 第四十二節：每條除了文字（text）還帶對應欄位（field），showStepError 會把那個欄位標成印章紅邊框。
  // 固定字輩只在雙字名才檢查：#generation-field 只有雙字名才顯示、generateCombos 單字名也不看字輩；
  // 原本不分字數都檢查，開了字輩再切回單字名，會被一個看不到的欄位擋住（第四十二節順手修正）。
  function validateStep1() {
    const errors = [];
    if (state.surnameMode === "custom" && !state.surnameCustom) {
      errors.push({ text: "已選擇「自訂輸入」，請輸入姓氏，或改選「不需要」", field: "#surname-custom" });
    }
    if (state.nameLength === 2 && state.useGenerationChar && !state.generationChar) {
      errors.push({ text: "已開啟「固定字輩」，請輸入字輩用字，或關閉開關", field: "#generation-char" });
    }
    return errors;
  }

  // 必填驗證訊息顯示在「上一步/下一步」按鈕正下方（#step-error），不是用全站共用、
  // 固定在頁面最底部的 NG.toast——使用者這輪明確要求訊息要出現在按鈕附近，不要讓人
  // 看完提示還要往下滑到頁尾才找得到，見 NOTES.md。
  // 第四十二節：同時把每條錯誤對應的欄位加上 .field-invalid（印章紅邊框）。每次呼叫都先清掉上一輪的標記，
  // 再依這次的 errors 重標，所以 refreshStepErrorIfShown 重新驗證時，已修正的欄位會立刻恢復、不會殘留。
  function showStepError(errors) {
    const el = $("#step-error");
    el.textContent = errors.map((e) => e.text).join("\n");
    el.hidden = false;
    clearFieldInvalid();
    errors.forEach((e) => {
      const f = e.field && $(e.field);
      if (!f) return;
      f.classList.add("field-invalid");
      f.setAttribute("aria-invalid", "true");
    });
  }

  function hideStepError() {
    $("#step-error").hidden = true;
    clearFieldInvalid();
  }

  function clearFieldInvalid() {
    $all("#baby-form .field-invalid").forEach((f) => {
      f.classList.remove("field-invalid");
      f.removeAttribute("aria-invalid");
    });
  }

  function bindStepNav() {
    $("#btn-next").addEventListener("click", () => {
      const errors = validateStep1();
      if (errors.length > 0) { showStepError(errors); return; }
      hideStepError();
      viewHistory.forward("step2");
      showView("step2");
    });
    // 上一步：退回步驟 1 那筆瀏覽紀錄（不是再推一筆），跟瀏覽器上一頁同一個效果。
    $("#btn-prev").addEventListener("click", () => { hideStepError(); viewHistory.backTo("step1"); });
    $("#baby-form").addEventListener("submit", (e) => {
      e.preventDefault();
      // 第 1 頁必填已經在「下一步」擋過一次，這裡是防呆（例如瀏覽器上一頁/下一頁回到第 2 頁的情境）。
      const errors = validateStep1();
      if (errors.length > 0) { showStepError(errors); return; }
      hideStepError();
      // 從表單送出＝條件可能變了，舊的鎖定字可能已經不符合新條件（例如改了性別、字數），一律清掉。
      runGeneration({ fromForm: true });
    });
  }

  function goToStep(step) {
    currentStep = step;
    $("#step-1").hidden = step !== 1;
    $("#step-2").hidden = step !== 2;
    $("#btn-prev").hidden = step === 1;
    $("#btn-next").hidden = step === 2;
    $("#btn-generate").hidden = step !== 2;
    $("#step-indicator").textContent = step === 1
      ? "第 1 頁／共 2 頁：基本條件"
      : "第 2 頁／共 2 頁：寓意/祝福";
    NG.scrollToWorkArea($("#step-indicator"));
  }

  function bindResultActions() {
    $("#btn-regenerate").addEventListener("click", () => runGeneration({ fromForm: false }));
    $("#btn-clear-locks").addEventListener("click", () => {
      locks.surname = null;
      locks.given = null;
      onLocksChanged();
      NG.toast("已解除全部鎖定");
    });
    // 修改條件：退回步驟 1 那筆瀏覽紀錄（第三十五節），之後再往前走會覆蓋掉舊的步驟 2／結果紀錄。
    $("#btn-edit-form").addEventListener("click", () => viewHistory.backTo("step1"));
    // 分享全部：點下去直接複製整批結果的連結（不展開選單）。
    // 社群平台分享改放在頁尾的「分享這個網站」，分享的是工具本身而不是取名結果。
    $("#btn-share-all").addEventListener("click", () => {
      if (lastCandidates.length === 0) return;
      const url = NG.buildShareAllUrl(lastCandidates);
      NG.copyText(url, "分享連結已複製，貼給朋友就能看到這 " + lastCandidates.length + " 個名字");
    });
  }

  // 第三十八節：「清空重填」，第四十二節拆成兩顆：
  // - 「全部清空」（resetForm）：範圍、確認門檻跟原本的「清空重填」完全一樣（兩頁欄位＋結果＋回到步驟 1）。
  // - 「清除此頁」（clearCurrentStep）：只把目前這一頁的欄位寫回預設值；另一頁、結果、鎖定、已看過紀錄都不動，
  //   也留在目前這一頁。確認門檻比照「全部清空」的精神：這一頁本來就是預設值就直接清（不跳對話框），
  //   有任何一項不是預設值才跳 confirm。
  // 頁面分組依 HTML 的 #step-1／#step-2：第 1 頁＝姓氏模式／自訂姓氏／名字字數／固定字輩開關與用字／性別／
  // 出生月份／生肖；第 2 頁＝寓意/祝福已選排序＋自由輸入文字。第 2 頁不依賴第 1 頁的值（沒有跨頁連動），
  // 清其中一頁不會連帶改到另一頁。
  function bindResetForm() {
    $("#btn-reset-form").addEventListener("click", resetForm);
    $("#btn-clear-step").addEventListener("click", clearCurrentStep);
    // 第四十五節：結果頁專用的「全部清空」（跟表單頁的 #btn-reset-form 是兩個 DOM 節點，同一個
    // click 動作），同一個位置只有一顆會顯示（showView 控制 .step-bar／#result-section 的顯示）。
    $("#btn-reset-form-result").addEventListener("click", resetForm);
  }

  function step1HasContent() {
    return (
      state.surnameMode !== "random" ||
      !!state.surnameCustom ||
      state.nameLength !== DEFAULT_NAME_LENGTH ||
      state.useGenerationChar ||
      !!state.generationChar ||
      state.gender !== "unisex" ||
      !!state.birthMonth ||
      !!state.zodiacId
    );
  }

  function step2HasContent() {
    return meaningSorter.getOrder().length > 0 || $("#meaning-free-text").value.trim() !== "";
  }

  function formHasContent() {
    return step1HasContent() || step2HasContent() || lastCandidates.length > 0;
  }

  function clearStep1Fields() {
    state.surnameMode = "random";
    state.surnameCustom = "";
    state.nameLength = DEFAULT_NAME_LENGTH;
    state.useGenerationChar = false;
    state.generationChar = "";
    state.gender = "unisex";
    state.birthMonth = "";
    state.zodiacId = "";

    $all("#baby-form .option-row").forEach((row) => {
      const def = String(state[row.dataset.field]);
      row.querySelectorAll(".option-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === def));
    });
    $("#surname-custom").value = "";
    $("#surname-custom").hidden = true;
    $("#generation-field").hidden = state.nameLength !== 2;
    $("#generation-toggle").checked = false;
    $("#generation-char").value = "";
    $("#generation-char").hidden = true;
    $("#birth-month").value = "";
    $("#zodiac").value = "";
  }

  function clearStep2Fields() {
    meaningSorter.setItems([]);
    $("#meaning-free-text").value = "";
    $("#meaning-free-text-hint").textContent = "";
  }

  function clearCurrentStep() {
    const step = currentStep;
    const hasContent = step === 1 ? step1HasContent() : step2HasContent();
    if (hasContent && !window.confirm("確定要清除第 " + step + " 頁的內容嗎？另一頁已填的條件和目前的結果都會保留。")) return;
    if (step === 1) clearStep1Fields(); else clearStep2Fields();
    hideStepError();
    NG.toast("已清除第 " + step + " 頁的內容");
  }

  function resetForm() {
    if (formHasContent() && !window.confirm("確定要清空重新填寫嗎？已填寫的條件與目前的結果都會被清除。")) return;

    clearStep1Fields();
    clearStep2Fields();
    hideStepError();

    // 結果、鎖定、已看過紀錄一併清掉（10.3/第二十五節：鎖定/已看過本來就只存在記憶體）。
    lastCandidates = [];
    lastLockMeta = [];
    lockControls = [];
    locks.surname = null;
    locks.given = null;
    seenNames.clear();
    seenFullNames.clear();
    $("#candidate-grid").innerHTML = "";
    $("#lock-status").hidden = true;

    // 清掉 sessionStorage 裡這個頁面實例存的表單狀態，不然清空後重新整理又會還原回剛才的選項。
    NG.clearSession("baby", viewHistory.sid);

    // 回到步驟 1：跟「修改條件」同一套退回瀏覽紀錄的做法（NG.createViewHistory），不是另推一筆新紀錄。
    viewHistory.backTo("step1");
    NG.toast("已清空，重新開始填寫");
  }

  function charInfo(ch) {
    const found = charsBase.chars.find((c) => c.char === ch);
    if (found) return found;
    // 使用者輸入的字輩字若不在字庫裡，視為中性分數（不加分不扣分），仍參與組合（10.1）。
    return { char: ch, pinyin: "", gender: "neutral", tags: [], meaning: "", popularity: 3 };
  }

  function genderCompatible(charGender) {
    if (state.gender === "unisex") return true;
    return charGender === state.gender || charGender === "neutral";
  }

  function scoreChar(ch, meaningOrder) {
    let score = 0;
    const info = charInfo(ch);

    meaningOrder.forEach((key, idx) => {
      if (info.tags.includes(key)) score += NG.priorityWeight(idx + 1);
    });

    if (state.zodiacId) {
      const zodiac = babyExtra.zodiacs.find((z) => z.id === state.zodiacId);
      const groups = babyExtra.charRadicalGroups[ch] || [];
      if (zodiac.favorGroups.some((g) => groups.includes(g))) score += 2;
      if (zodiac.avoidGroups.some((g) => groups.includes(g))) score -= 2;
    }

    if (state.birthMonth) {
      const bonus = babyExtra.monthTagBonus[state.birthMonth];
      if (bonus && info.tags.some((t) => bonus.tags.includes(t))) score += 1;
    }

    score += info.popularity * 0.1;
    return score;
  }

  // 寓意分類（tags）留空的字不進寶寶取名候選池：第七輪字庫擴充時為小說取名灰色調角色補的那批字
  // （暗、詭、冥、謀、府…，見 NOTES.md 第十二節／第三十二節），刻意不標任何祝福寓意，不適合新生兒命名。
  // 原本靠低 popularity 壓在排序後段，但「排除已看過」會一路往後抽，連按再產生一次就會抽到，所以改成直接排除。
  // 小說取名（novel-name.js）有自己的候選邏輯，不受影響。
  function buildCandidatePool() {
    return charsBase.chars.filter((c) => c.tags.length > 0 && genderCompatible(c.gender));
  }

  function generateCombos(pool) {
    const combos = [];
    if (state.nameLength === 1) {
      pool.forEach((c) => combos.push([c.char]));
    } else {
      if (state.useGenerationChar && state.generationChar) {
        // 字輩現實上有些家族放在雙字名的第一字、有些放第二字，不只一種慣例（議題見使用者回饋）。
        // 兩種位置都生成，交給既有評分機制（10.1/10.3）挑前五，位置不影響分數，結果會自然混合兩種位置。
        const fixed = state.generationChar;
        pool.forEach((c) => {
          if (c.char !== fixed) {
            combos.push([fixed, c.char]);
            combos.push([c.char, fixed]);
          }
        });
      } else {
        pool.forEach((c1) => {
          pool.forEach((c2) => {
            if (c1.char !== c2.char) combos.push([c1.char, c2.char]);
          });
        });
      }
    }
    return combos;
  }

  function pickSurname() {
    if (state.surnameMode === "none") return "";
    if (state.surnameMode === "custom") return state.surnameCustom || "";
    // 隨機模式下使用者鎖住了某一批的姓氏：再產生一次時沿用，不重抽（10.4 的例外，見 NOTES.md 第二十五節）。
    if (locks.surname) return locks.surname;
    return NG.randomSurname();
  }

  // 這張卡可以鎖哪些單位（規則見 NOTES.md 第二十五節）：
  // - 姓氏：只有「隨機」模式需要鎖（自訂輸入本來就固定、不需要則沒有姓氏）。
  // - 名字的字：雙字名、單字名都開放（第二十二輪，使用者要求拿掉原本「單字名不開放」的限制，見 NOTES.md 第二十八節）。
  //   單字名鎖住那個字＝名字固定：姓氏隨機時只剩「換姓」這個變化（第三十五節起一次出 5 張卡、各配不同姓氏），
  //   姓氏自訂/不需要/已鎖時每批都是同一個名字（1 張），這是數學上必然的結果，不是錯誤；狀態列會另外說明（見 onLocksChanged）。
  //   開啟「固定字輩」時（只有雙字名有），另一個字跟字輩字只會組成 1 個名字，所以只開放鎖「字輩字所在的位置」，
  //   效果是指定字輩放第一字或第二字（generateCombos 兩種位置都會生成）。
  function lockUnitsFor(chars, surname) {
    const units = [];
    if (state.surnameMode === "random" && surname) units.push({ type: "surname", value: surname });
    if (chars.length >= 1) {
      chars.forEach((ch, pos) => {
        // 字輩只對雙字名生效（generateCombos 單字名不看字輩），切回單字名時 state 可能還留著字輩設定，要排除。
        if (state.nameLength === 2 && state.useGenerationChar && state.generationChar && ch !== state.generationChar) return;
        // 第四十四節：字輩模式下每個組合本來就都有字輩字，只鎖字沒有意義，這種單位一鎖就連位置一起鎖（fixPos）。
        const isGenUnit = state.nameLength === 2 && state.useGenerationChar && state.generationChar && ch === state.generationChar;
        units.push(isGenUnit ? { type: "given", pos, char: ch, fixPos: true } : { type: "given", pos, char: ch });
      });
    }
    return units;
  }

  function matchesLock(chars) {
    // 第四十四節：預設只鎖字（任何位置有這個字就算），使用者另外按「也固定在首字／末字」才比對位置。
    return NG.charsMatchGivenLock(locks, chars);
  }

  function runGeneration(opts) {
    const fromForm = !!(opts && opts.fromForm);
    if (fromForm) {
      locks.surname = null;
      locks.given = null;
    }
    const meaningOrder = meaningSorter.getOrder();
    const pool = buildCandidatePool();
    let combos = generateCombos(pool);

    combos = combos.map((chars) => {
      const rawScore = chars.reduce((sum, ch) => sum + scoreChar(ch, meaningOrder), 0);
      return { chars, score: rawScore + Math.random() * 0.5 };
    });

    // 沒有任何寓意/祝福標籤時，退回常用度優先＋隨機（10.2）。
    if (meaningOrder.length === 0) {
      combos.sort((a, b) => {
        const popA = a.chars.reduce((s, ch) => s + charInfo(ch).popularity, 0);
        const popB = b.chars.reduce((s, ch) => s + charInfo(ch).popularity, 0);
        return (popB + Math.random() * 2) - (popA + Math.random() * 2);
      });
    } else {
      combos.sort((a, b) => b.score - a.score);
    }

    // 鎖定的字先當硬性條件篩一次（跟字輩同一種做法），再照分數排序結果抽樣。
    combos = combos.filter((c) => matchesLock(c.chars));

    // 取分數前段做隨機抽樣，讓「再產生一次」在維持相關性的前提下仍有變化（10.3）。
    // 第十九輪起改成「只從本次瀏覽還沒看過的名字裡抽」，池子用完才允許重複（NG.sampleExcludingSeen）。
    const topPoolSize = Math.max(30, Math.min(60, combos.length));
    const { chosen, exhausted } = NG.sampleExcludingSeen(
      combos, (c) => c.chars.join(""), seenNames, topPoolSize, 5
    );
    // 單字名鎖住那個字之後只剩 1 個組合，每次再產生一次都會「看完一輪」，這句提示會每次都跳、反而像出錯；
    // 這個情境改由鎖定狀態列說明（見 onLocksChanged），這裡不跳。
    if (exhausted && !fromForm && !isSingleNameLocked()) {
      NG.toast("符合目前條件的名字都看過一輪了，接下來可能會出現看過的名字");
    }

    // 第三十五節：單字名鎖字＋隨機姓氏沒鎖＝名字固定、只剩姓氏能變，改成一次出 5 張卡、每張各抽一個不同姓氏
    // （取代第二十二輪「每批只剩 1 張、只換姓」）。其他情況維持整批同一個姓氏（10.4）。
    let picked = chosen;
    let surnames;
    if (isSurnameOnlyVarying() && chosen.length > 0) {
      const r = NG.pickSurnamesForFixedName(NG.COMMON_SURNAMES, chosen[0].chars.join(""), seenFullNames, 5);
      surnames = r.surnames;
      picked = surnames.map(() => chosen[0]);
      if (r.exhausted) NG.toast("這個名字能搭配的姓氏都看過一輪了，接下來可能會出現看過的姓名");
    } else {
      const surname = pickSurname();
      surnames = chosen.map(() => surname);
    }
    lastCandidates = picked.map((combo, i) => buildCandidateObject(combo.chars, surnames[i], i));
    lastLockMeta = picked.map((combo, i) => ({ chars: combo.chars, units: lockUnitsFor(combo.chars, surnames[i]) }));
    picked.forEach((combo, i) => seenFullNames.add(NG.fullNameKey(surnames[i], combo.chars.join(""))));

    renderCandidates(lastCandidates);
    // 從步驟 2 產生結果＝往前一步，推一筆瀏覽紀錄；在結果頁按「再產生一次」不推（第三十五節）。
    if (currentView !== "result") viewHistory.forward("result");
    showView("result");
    saveSession();
  }

  // 任何一張卡改了鎖定：整批卡片的鎖定按鈕狀態、結果區下方的狀態列一起更新。
  function isSingleNameLocked() {
    return state.nameLength === 1 && !!locks.given;
  }

  // 名字固定、只剩姓氏能變（第三十五節）：單字名鎖字、姓氏隨機、姓氏沒鎖。
  function isSurnameOnlyVarying() {
    return isSingleNameLocked() && state.surnameMode === "random" && !locks.surname;
  }

  // 單字名鎖字（第二十二輪）：名字只剩這一個字。狀態列多補一句說明，讓使用者知道這是鎖定造成的。
  // 第三十五節：姓氏隨機沒鎖時改成一次出 5 個不同姓氏，說明文字跟著改；姓氏也固定時仍是每批同一個名字（1 張）。
  function onLocksChanged() {
    lockControls.forEach((ctrl) => ctrl.refresh());
    const text = NG.describeLocks(locks, state.nameLength === 1 ? 1 : undefined);
    let msg = text ? "已鎖定：" + text + "。按「再產生一次」，新一批都會保留。" : "";
    if (text && isSingleNameLocked()) {
      msg += isSurnameOnlyVarying()
        ? "單字名鎖住這個字後名字固定，再產生一次會一次給 5 個不同的隨機姓氏搭配這個名字；想看其他名字請按「全部解除」。"
        : "單字名鎖住這個字、姓氏又不是隨機（或已鎖定），姓名完全固定，再產生一次每批都只會是同一個名字；想看其他名字請按「全部解除」。";
    }
    $("#lock-status").hidden = !text;
    $("#lock-status-text").textContent = msg;
  }

  function buildCandidateObject(chars, surname, index) {
    const infos = chars.map((ch) => charInfo(ch));
    const givenName = chars.join("");
    const fullName = surname + givenName;
    // 拼音／威妥瑪拼音含姓氏（2026-11 新增，見 NOTES.md 第二十四節）：以前這裡只拼給名字部分，
    // 使用者實測發現「自訂輸入」姓氏以外的隨機姓氏完全沒有拼音，只有給名字字庫裡的字才有。
    // NG.buildRomanizedName 會先查姓氏羅馬拼音表，查不到（例如自訂輸入）就只回傳給名字部分，
    // 不是整個留空。
    const { pinyin, wadeGiles } = NG.buildRomanizedName(surname, infos);
    const meaningSummary = infos
      .filter((i) => i.meaning)
      .map((i) => i.char + "：" + i.meaning)
      .join("\n");
    const matchedTags = Array.from(new Set(infos.flatMap((i) => i.tags)));

    return {
      id: "baby-" + fullName + "-" + Date.now() + "-" + index,
      tool: "baby",
      fullName,
      surname,
      givenName,
      pinyin,
      wadeGiles,
      meaningSummary,
      matchedTags,
    };
  }

  function renderCandidates(candidates) {
    const grid = $("#candidate-grid");
    grid.innerHTML = "";
    lockControls = [];
    candidates.forEach((c, i) => grid.appendChild(renderCandidateCard(c, lastLockMeta[i])));
    // 按鈕文字跟著實際數量，不寫死「5 個」（第二十二輪；第三十五節起只有姓名完全固定時才會是 1 個）。
    // 第二十三輪：結果區標題（HTML 預設寫死「5 個」）也一併依實際數量更新。
    $("#result-title").textContent = "為你找到的 " + candidates.length + " 個名字";
    $("#btn-share-all").textContent = "分享全部 " + candidates.length + " 個名字";
    onLocksChanged();
  }

  // lockMeta 只有結果區的卡片會傳（收藏抽屜、分享區的卡片不能鎖定，因為它們不屬於「下一次再產生」的那一批）。
  function renderCandidateCard(c, lockMeta) {
    const card = document.createElement("div");
    card.className = "candidate-card";

    const name = document.createElement("div");
    name.className = "candidate-name";
    name.textContent = c.fullName;
    card.appendChild(name);

    if (c.pinyin) {
      const py = document.createElement("div");
      py.className = "candidate-pinyin";
      // 威妥瑪拼音（簡化式）跟在漢語拼音後面用「・」分隔；查不到威妥瑪拼音時
      // （例如自訂輸入姓氏、字輩用字不在字庫裡）就只顯示漢語拼音，不留空白或寫 undefined。
      py.textContent = c.wadeGiles ? c.pinyin + " ・ " + c.wadeGiles : c.pinyin;
      card.appendChild(py);
    }

    const meaning = document.createElement("div");
    meaning.className = "candidate-meaning";
    const meaningText = c.meaningSummary || "（字輩用字不在字庫收錄範圍內，暫無字義說明）";
    meaningText.split("\n").forEach((line, idx) => {
      if (idx > 0) meaning.appendChild(document.createElement("br"));
      meaning.appendChild(document.createTextNode(line));
    });
    card.appendChild(meaning);

    if (c.matchedTags.length > 0) {
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
    copyBtn.addEventListener("click", () => NG.copyText(c.fullName));
    actions.appendChild(copyBtn);

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "icon-btn" + (NG.isFavorited("baby", c.id) ? " favorited" : "");
    favBtn.dataset.favId = c.id;
    favBtn.textContent = NG.isFavorited("baby", c.id) ? "已收藏" : "收藏";
    favBtn.addEventListener("click", () => {
      const nowFav = NG.toggleFavorite("baby", c);
      favBtn.classList.toggle("favorited", nowFav);
      favBtn.textContent = nowFav ? "已收藏" : "收藏";
      NG.toast(nowFav ? "已加入收藏" : "已取消收藏");
      refreshFavoritesSection();
    });
    actions.appendChild(favBtn);

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "icon-btn";
    shareBtn.textContent = "分享";
    shareBtn.addEventListener("click", () => {
      NG.copyText(NG.buildShareUrl(c), "分享連結已複製，貼給朋友就能看到「" + c.fullName + "」");
    });
    actions.appendChild(shareBtn);

    let lockPanel = null;
    if (lockMeta && lockMeta.units.length > 0) {
      const ctrl = NG.buildLockControl(lockMeta.units, lockMeta.chars.length, locks, onLocksChanged);
      actions.appendChild(ctrl.button);
      lockPanel = ctrl.panel;
      lockControls.push(ctrl);
    }

    card.appendChild(actions);
    if (lockPanel) card.appendChild(lockPanel);

    return card;
  }

  function renderSharedCandidates(candidates) {
    const section = $("#shared-section");
    const heading = section.querySelector("h2");
    const grid = $("#shared-candidate-grid");
    heading.textContent = candidates.length > 1
      ? "有人跟你分享了這 " + candidates.length + " 個名字"
      : "有人跟你分享了這個名字";
    grid.innerHTML = "";
    candidates.forEach((c) => grid.appendChild(renderCandidateCard(c)));
    // 分享區塊的顯示/隱藏與表單收合改由 showView("shared") 負責（第三十五節），這裡只填內容。
  }

  init();
})();
