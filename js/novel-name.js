/*
  小說角色取名工具邏輯。
  對應設計文件 5.1~5.5、第十節（候選產生與排序規則，兩工具共用）。
  小說分類從 5 類擴為 7 類（見設計文件 5.2，2026-09 改版）：新增校園青春、懸疑驚悚，科幻正式建置資料庫，日系正名為日系輕小說。

  資料形狀差異（見第七節）：
  - 古風武俠／現代都市／校園青春／懸疑驚悚：引用共用漢字庫 chars-base.json ＋ 專屬疊加層（性格標籤清單）。校園青春、懸疑驚悚角色多半也用現代/古典漢語人名，比照現代都市做法沿用共用字庫（見 NOTES.md）。
  - 西方奇幻／日系輕小說／科幻：獨立姓名庫（novel-fantasy.json / novel-japanese.json / novel-scifi.json），資料形狀不同，無法共用。科幻姓名庫的形狀判斷記錄在 NOTES.md。

  2026-09 第五輪改版：「身分」欄位改名「角色氣質」，拿掉單選職業清單，改成 8 個共通氣質
  （尊貴雅致／市井草根／文雅書卷／剛猛豪邁／神秘莫測／純真青澀／精明權謀／理性精密，設計文件 7.2 節定案）
  的可複選標籤，跟「性格標籤」同一種互動元件。使用者選的是氣質本身（底層代碼），只是每個小說分類
  換一套貼合語感的說法（設計文件 5.2.1 表格，見下方 QUALITIES）。原本「身分→氣質」的間接換算
  （novel-extra-*.json 的 identities[].quality）已不再由表單邏輯讀取，改成使用者選的氣質代碼直接比對
  候選字/候選姓名的 qualityTags／quality 欄位。identities[] 陣列本身保留在資料檔裡（設計文件 5.2 節：
  這套職業查證知識仍是有效的世界觀內容，供之後寫字庫標籤/文章參考），但不再驅動表單渲染或評分。
  - 漢字類分類：chars-base.json 每個字的 qualityTags 這輪從 6 個氣質擴充覆核到 8 個（新增
    cunning_scheming／rational_precise，mysterious_dark 僅改顯示名稱為「神秘莫測」，代碼與既有標記不變），
    詳見 NOTES.md 覆蓋率統計。
  - 音譯姓名庫（西方奇幻/日系/科幻）：這輪新增 qualityTags 欄位到每筆姓名（先前身分改氣質前，
    這三份資料本來沒有氣質欄位，靠身分 id 直接比對；身分欄位拿掉後改成跟漢字類一致的
    「使用者選氣質代碼→比對候選 qualityTags」邏輯，判斷方式與覆蓋率記錄見 NOTES.md）。

  2026-11 第八輪：姓氏欄位補齊設計文件 10.4 節定案的「自訂/不需要/隨機」三模式（原本只有自由文字輸入，
  缺口與理由見 NOTES.md 第十三節第 56 點），並新增複姓資料池 COMPOUND_SURNAMES 供「隨機」模式使用
  （只對 HANZI_STYLES 生效，POOL_STYLES 見 updateSurnameRandomHint 說明）。查證來源、抽選比例判斷、
  實測結果見 NOTES.md 第十三節。

  2026-11 第二十一輪：西方奇幻／日系輕小說新增各自的姓氏庫（novel-fantasy.json／novel-japanese.json 的
  surnames 陣列），「隨機」模式改成可以選這兩類、從各自的姓氏庫抽姓，依文化慣例組合：日系「姓 名」、
  西幻「名 姓」（見 finalizeCandidate）。科幻不加姓氏庫（人類角色本來就是完整中文姓名、AI 是代號），
  「隨機」下維持停用；「複姓」是中文姓氏概念，三類都維持停用。判斷理由見 NOTES.md 第二十七節。

  2026-11 第二十二輪：上一段科幻的處理已改。novel-scifi.json 的人類條目拆成 surname＋given 兩個欄位，
  科幻改跟漢字類共用中文姓氏池（CHINESE_SURNAME_STYLES），隨機／複姓／自訂輸入／不需要四種模式都能選；
  AI/仿生人代號條目（只有 name 欄位）任何模式都不加姓（isSplitHumanEntry／candidateTakesSurname）。
  見 NOTES.md 第二十八節。
*/

(function () {
  const STYLE_LABELS = {
    gufeng: "古風武俠",
    modern: "現代都市",
    campus: "校園青春",
    fantasy: "西方奇幻",
    japanese: "日系輕小說",
    scifi: "科幻",
    mystery: "懸疑驚悚",
  };

  const HANZI_STYLES = ["gufeng", "modern", "campus", "mystery"];
  const POOL_STYLES = ["fantasy", "japanese", "scifi"];
  // 有自己姓氏庫（資料檔 surnames 陣列）的音譯/日系分類，「隨機」模式從這裡抽姓（第二十一輪，見 NOTES.md 第二十七節）。
  // 科幻刻意不在內：novel-scifi.json 的人類角色本來就是含姓的完整中文姓名（沈知微、顧星遙），
  // AI/仿生人是代號（凱－零七），兩種都不該再加姓。（第二十二輪起此理由已過時，見下方 CHINESE_SURNAME_STYLES。）
  const SURNAME_POOL_STYLES = ["fantasy", "japanese"];
  // 第二十二輪（NOTES.md 第二十八節）：科幻人類角色拆成 surname＋given 後，姓氏改跟漢字類共用中文姓氏池
  // （隨機抽 COMMON_SURNAMES＋25% 複姓、複姓模式抽 COMPOUND_SURNAMES）。上面 SURNAME_POOL_STYLES 註解裡
  // 「科幻不該再加姓」的前提已不成立，但科幻仍不在 SURNAME_POOL_STYLES 內，因為它用的是中文姓氏、沒有自己的姓氏庫。
  // AI/仿生人代號條目（沒有 given 欄位）不論哪種模式都不加姓，見 candidateTakesSurname。
  const CHINESE_SURNAME_STYLES = HANZI_STYLES.concat(["scifi"]);

  // 科幻人類條目：有 given 欄位（姓名分開存）；代號條目只有 name、整串不可拆。
  function isSplitHumanEntry(entry) {
    return typeof entry.given === "string";
  }

  // 這張候選卡會不會套用姓氏：漢字類一定會；西方奇幻／日系輕小說的整筆名字都會；
  // 科幻只有人類條目會，代號條目永遠不加姓（不論隨機/複姓/自訂輸入）。
  function candidateTakesSurname(c) {
    if (c.kind === "hanzi") return true;
    if (state.style === "scifi") return isSplitHumanEntry(c.entry);
    return true;
  }

  // 各姓氏模式下第 2 頁要停用的分類：隨機不停用任何分類（第二十二輪起科幻也開放）；
  // 複姓是中文姓氏概念，停用西方奇幻／日系輕小說（科幻人類角色是中文姓名，第二十二輪起開放）。
  function disabledStylesFor(mode) {
    if (mode === "compound") return POOL_STYLES.filter((s) => !CHINESE_SURNAME_STYLES.includes(s));
    return [];
  }

  const ORIENTATION_LABELS = {
    yanqing: "言情",
    danmei: "耽美",
    baihe: "百合",
  };

  // 角色氣質：8 個共通氣質代碼，byStyle 是設計文件 5.2.1 表格逐格抄錄的「換一套說法」。
  // byStyle 值為 null 代表該小說分類「不提供」這個氣質（5.2.1 表格的三格不提供組合），
  // 渲染按鈕、切換分類保留/靜默取消選取時都要看這個值。
  const QUALITIES = [
    { id: "noble_elegant", byStyle: { gufeng: "皇室貴族", modern: "豪門世家", campus: "校園風雲", fantasy: "貴族血統", japanese: "偶像光環", scifi: "上流菁英", mystery: null } },
    { id: "folk_grassroots", byStyle: { gufeng: "市井百姓", modern: "市井日常", campus: "平凡日常", fantasy: "平民出身", japanese: "社畜日常", scifi: "底層日常", mystery: "市井日常" } },
    { id: "fierce_bold", byStyle: { gufeng: "江湖俠客", modern: "江湖狠角色", campus: "熱血陽光", fantasy: "騎士豪氣", japanese: "熱血硬派", scifi: "戰鬥豪氣", mystery: "強悍幹練" } },
    { id: "cunning_scheming", byStyle: { gufeng: "官場謀略", modern: "心機算計", campus: "心機小聰明", fantasy: "宮廷心機", japanese: "腹黑心機", scifi: "權謀心計", mystery: "幕後黑手" } },
    { id: "scholarly", byStyle: { gufeng: "書香文人", modern: "溫文書卷", campus: "文靜書卷", fantasy: "學者風範", japanese: "文藝青年", scifi: null, mystery: null } },
    { id: "mysterious_dark", byStyle: { gufeng: "神秘莫測", modern: "神秘難測", campus: "邊緣神秘", fantasy: "魔法神秘", japanese: "異世界神秘", scifi: "異質神秘", mystery: "陰暗詭譎" } },
    { id: "innocent_young", byStyle: { gufeng: "少年心性", modern: "青澀學生", campus: "純真青澀", fantasy: "冒險新手", japanese: "純真青澀", scifi: "純真新兵", mystery: "純真青澀" } },
    { id: "rational_precise", byStyle: { gufeng: "推理探案", modern: "理性精英", campus: "理科學霸", fantasy: "縝密智識", japanese: "理性宅系", scifi: "理性精密", mystery: "理性推理" } },
  ];

  function qualityLabelFor(qualityId, style) {
    const q = QUALITIES.find((x) => x.id === qualityId);
    if (!q) return null;
    return q.byStyle[style] || null;
  }

  // 複姓資料池：小說取名專用（2026-11 新增），只在「隨機姓氏」模式、且小說分類屬於
  // 中文漢字類（HANZI_STYLES：古風武俠／現代都市／校園青春／懸疑驚悚）時使用。
  // 刻意放在 novel-name.js、不並入 shared.js 的 COMMON_SURNAMES：COMMON_SURNAMES 是寶寶取名
  // 與小說取名共用的「寫實單姓」池，寶寶取名是給真實新生兒命名的工具，不應該隨機跑出歐陽、
  // 司馬這類現實中極罕見的複姓；複姓只對小說（尤其古風武俠）有古風/角色辨識度的加分，是
  // 小說取名專屬需求，放在這裡職責更清楚，也不會不小心被 baby-name.js 引用到。
  // 20 個皆為真實歷史複姓，非自創，查證來源與理由見 NOTES.md：
  // 歐陽、司馬、諸葛、上官、皇甫、司徒（現代仍常見，《百家姓》收錄、現今真實有人使用）；
  // 令狐、宇文、長孫、尉遲、公孫、東方、夏侯、慕容、赫連、万俟、澹臺、鍾離、軒轅、端木
  // （歷史文獻/《通志‧氏族略》有據，現代使用人數極少或幾乎只見於古籍／武俠小說，但確有史實依據，非自創）。
  // 擴充自原本 20 個，新增 11 個（申屠、賀蘭、完顏、公冶、宗政、濮陽、淳于、司空、巫馬、東郭、南宮），
  // 查證來源見 NOTES.md：皆為《百家姓》/中文維基「複姓」條目記載、歷史上真實存在的雙字姓，非自創。
  const COMPOUND_SURNAMES = [
    "歐陽", "司馬", "諸葛", "上官", "皇甫", "令狐", "宇文", "長孫", "尉遲", "公孫",
    "東方", "夏侯", "司徒", "慕容", "赫連", "万俟", "澹臺", "鍾離", "軒轅", "端木",
    "申屠", "賀蘭", "完顏", "公冶", "宗政", "濮陽", "淳于", "司空", "巫馬", "東郭", "南宮"
  ];

  // 複姓佔隨機結果 25%（判斷依據見 NOTES.md）：現實裡單姓仍是大宗，複姓比例設太高會顯得失真；
  // 但要讓使用者玩個 20～30 次就看得到複姓出現，機率不能低到幾乎看不到，25% 大約每抽 4 次見 1 次，
  // 介於使用者指示的 20~30% 區間中點，是刻意取的整數，不是隨便拍的數字。
  const COMPOUND_SURNAME_RATE = 0.25;

  function randomNovelSurname() {
    if (Math.random() < COMPOUND_SURNAME_RATE) {
      return randomCompoundSurname();
    }
    return NG.randomSurname();
  }

  function randomCompoundSurname() {
    return COMPOUND_SURNAMES[Math.floor(Math.random() * COMPOUND_SURNAMES.length)];
  }

  let charsBase = null;
  const extraByStyle = {}; // gufeng / modern / campus / mystery -> {identities（保留供內容參考，表單/評分已不讀取）, personalities}
  const namePoolByStyle = {}; // fantasy / japanese / scifi -> {identities（同上，保留參考）, names}

  const state = {
    gender: "unisex",
    ageTier: "",
    surnameMode: "random", // 姓氏顯示規則：random／compound／custom／none，compound 是新增的第四種模式（固定從複姓池抽，見 NOTES.md）
    surnameCustom: "",
    style: "",
    orientation: "", // 情感取向（選填，單選）：言情/耽美/百合，獨立於小說分類之外，見 NOTES.md
    qualities: [], // 角色氣質：可複選（第五輪改版，見 NOTES.md），存的是氣質代碼，不是顯示文字
    personalities: [],
    specialRequest: "",
  };

  let currentStep = 1;
  let lastCandidates = [];
  // 第十九輪（NOTES.md 第二十五節）：鎖定單字＋排除已看過，做法跟 baby-name.js 一致，只存在記憶體。
  const locks = { surname: null, given: null };
  const seenNames = new Set();
  // 第三十五節：完整姓名（姓氏|名字）層級的已看過紀錄，給「名字固定、只換姓氏」情境抽姓氏時比對（同 baby-name.js）。
  const seenFullNames = new Set();
  let lastLockMeta = [];
  let lockControls = [];
  // 第三十五節：瀏覽器上一頁／下一頁對應表單步驟（NG.createViewHistory），做法同 baby-name.js。
  let viewHistory = null;
  let currentView = "step1";
  let hasSharedContent = false;
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

  async function init() {
    const [cb, gufeng, modern, campus, mystery, fantasy, japanese, scifi] = await Promise.all([
      fetch("../data/chars-base.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("../data/novel-extra-gufeng.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("../data/novel-extra-modern.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("../data/novel-extra-campus.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("../data/novel-extra-mystery.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("../data/novel-fantasy.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("../data/novel-japanese.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("../data/novel-scifi.json", { cache: "no-store" }).then((r) => r.json()),
    ]);
    charsBase = cb;
    extraByStyle.gufeng = gufeng;
    extraByStyle.modern = modern;
    extraByStyle.campus = campus;
    extraByStyle.mystery = mystery;
    namePoolByStyle.fantasy = fantasy;
    namePoolByStyle.japanese = japanese;
    namePoolByStyle.scifi = scifi;

    bindSingleSelect("gender", (v) => { state.gender = v; });
    bindSingleSelect("ageTier", (v) => { state.ageTier = v; });
    bindSingleSelect("style", onStyleChange);
    bindSingleSelect("orientation", (v) => { state.orientation = v; });

    bindSingleSelect("surnameMode", (v) => {
      state.surnameMode = v;
      $("#novel-surname-custom").hidden = v !== "custom";
      updateSurnameRandomHint();
      updateStyleAvailability();
      refreshStepErrorIfShown();
    });
    $("#novel-surname-custom").addEventListener("input", (e) => {
      state.surnameCustom = e.target.value.trim();
      refreshStepErrorIfShown();
    });
    $("#special-request").addEventListener("input", (e) => { state.specialRequest = e.target.value; });

    // 性格標籤清單不隨小說分類改變（見 currentPersonalityList），只需渲染一次；
    // 放進 onStyleChange 裡重複渲染是這次修的 bug 之一：每次切風格都重畫這個區塊，
    // 會把使用者已經點選的性格標籤一併清空（見 NOTES.md）。
    renderPersonalityRow();
    renderQualityRow(); // 尚未選小說分類時顯示「請先選擇小說分類」提示，跟性格標籤不同，氣質選項本身依分類換文字
    // 預設姓氏模式是「隨機」，兩個函式都要在 init 時跑一次，不能只靠使用者點擊姓氏模式按鈕才觸發
    // ——HTML 預設 hidden、按鈕預設都不是 disabled，如果不在這裡主動同步一次，使用者完全不碰
    // 姓氏欄位、直接翻到第 2 頁時，畫面會跟「隨機模式下這三類本來就該停用」的實際邏輯對不上
    // （這是這次擴大到「隨機」模式時才發現的既有缺口，複姓模式當時沒碰到是因為複姓不是預設值，
    // 一定要使用者先點過，點擊事件本身就會觸發同步，見 NOTES.md）。
    updateStyleAvailability();
    updateSurnameRandomHint();

    bindStepNav();
    bindResultActions();
    bindResetForm();
    NG.initFavoritesDrawer("novel");
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

  // 第三十五節：載入時決定畫面、重新整理時還原表單，邏輯同 baby-name.js 的 initViewHistory。
  function initViewHistory() {
    viewHistory = NG.createViewHistory({ hasShared: hasSharedContent, render: showView });
    window.addEventListener("pagehide", saveSession);
    let view = hasSharedContent ? "shared" : "step1";
    let depth = 0;
    const cur = viewHistory.current();
    if (cur) {
      const session = NG.loadSession("novel", viewHistory.sid);
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
    NG.saveSession("novel", viewHistory.sid, { state, lastCandidates, lastLockMeta });
  }

  // 把 sessionStorage 的表單內容寫回 state 與畫面。鎖定與「已看過」只活在記憶體，不還原（同 baby-name.js）。
  function restoreSession(s) {
    const saved = s.state || {};
    Object.keys(state).forEach((k) => {
      if (saved[k] === undefined) return;
      state[k] = Array.isArray(state[k]) ? (Array.isArray(saved[k]) ? saved[k].slice() : []) : saved[k];
    });
    ["gender", "ageTier", "surnameMode", "style", "orientation"].forEach((field) => {
      const row = document.querySelector('.option-row[data-field="' + field + '"]');
      if (!row) return;
      row.querySelectorAll(".option-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === String(state[field])));
    });
    $("#novel-surname-custom").value = state.surnameCustom || "";
    $("#novel-surname-custom").hidden = state.surnameMode !== "custom";
    $("#special-request").value = state.specialRequest || "";
    renderQualityRow();
    $all("#personality-row .option-btn").forEach((b) => b.classList.toggle("active", state.personalities.includes(b.dataset.value)));
    updateSurnameRandomHint();
    updateStyleAvailability();
    updateSpecialRequestHint();
    lastCandidates = Array.isArray(s.lastCandidates) ? s.lastCandidates : [];
    lastLockMeta = Array.isArray(s.lastLockMeta) ? s.lastLockMeta : [];
    if (lastCandidates.length > 0) renderCandidates(lastCandidates);
  }

  // 只負責畫面切換，不碰 history（同 baby-name.js）。
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
    // 第四十五節（同 baby-name.js）：結果頁的「全部清空」原本留在 .step-bar 裡只隱藏文字，
    // 變成孤零零浮在右邊一整排空白中，跟下面「為你找到的 N 個名字」對不上。改成結果頁整條
    // .step-bar 都收起，改用 .result-toolbar 裡新增的 #btn-reset-form-result（跟標題同一列）。
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

  // 第二十四輪：抽屜與兩個側邊標籤（寶寶取名／小說取名）由 shared.js 統一渲染，見 NOTES.md 第三十節。
  function refreshFavoritesSection() {
    NG.refreshFavorites();
  }

  function bindSingleSelect(field, onChange) {
    const row = document.querySelector('.option-row[data-field="' + field + '"]');
    row.addEventListener("click", (e) => {
      const btn = e.target.closest(".option-btn");
      if (!btn) return;
      row.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset.value);
    });
  }

  function onStyleChange(value) {
    state.style = value;
    // 只有「角色氣質」的顯示文字依小說分類連動；性格標籤／特殊需求／情感取向是使用者已填的資料，
    // 不依賴小說分類，不應該被清空（上一輪修的 bug，原本連性格標籤都被重置，見 NOTES.md）。
    // 角色氣質本身：第四十四節改回整批清空（取代第五輪「部分保留、只換文字」的做法）。
    // 原因：同一個氣質代碼跨分類換文字時，有些說法語感落差太大，使用者實測發現「江湖狠角色」
    // （modern）切到校園青春會變成「熱血陽光」，兩者氣質完全不同調，保留選取反而是誤導使用者
    // 以為換了分類還選的是同一種方向；改分類時全部清空、要求重選，比較不會讓使用者誤會。
    state.qualities = [];
    renderQualityRow();
    updateSpecialRequestHint();
    updateSurnameRandomHint();
    refreshStepErrorIfShown();
  }

  // 複姓／單姓隨機池只對 HANZI_STYLES 合理（中文姓氏語境），西方奇幻／日系輕小說／科幻三類
  // 本身是音譯或日系姓名庫，隨機/複姓模式下套用中文姓氏會破壞語境，所以這三類在這兩個模式下
  // 不加姓氏（等同「不需要」）。2026-11 第十七輪起，這三個分類在第 2 頁會直接停用（見下方
  // updateStyleAvailability），這裡的提示文字從「已經選了卻沒套用姓氏，說明為什麼」改成
  // 「提前告知選了這個模式、下一頁這三類會不能選」，不再需要等 state.style 已經是這三類之一
  // 才顯示，只要姓氏模式是隨機/複姓就先講清楚。此函式同時被「切換小說分類」與「切換姓氏模式」
  // 呼叫，因為姓氏欄位在表單第 1 頁、小說分類在第 2 頁，兩者任一變動都可能需要更新提示狀態。
  // （第二十一輪更新：上面「三類在隨機模式不加姓」已不成立，西方奇幻／日系輕小說改抽自己的姓氏庫，
  // 只剩科幻在隨機模式停用，見 SURNAME_POOL_STYLES。）
  // 第二十一輪起西方奇幻／日系輕小說在「隨機」模式有自己的姓氏庫，提示文字改成依模式切換兩種說法
  // （隨機只停用科幻、複姓停用三類），文字放在這裡而不是寫死在 HTML，避免兩個模式共用一句話講不清楚。
  const SURNAME_MODE_HINTS = {
    random: "隨機姓氏會依小說分類換一套姓氏庫：古風武俠／現代都市／校園青春／懸疑驚悚／科幻抽中文姓氏，日系輕小說抽日本姓氏（如佐藤 美咲），西方奇幻抽西式家族姓氏（如 Elowen Blackwood）。科幻的 AI／仿生人角色是代號（如凱－零七），不論選哪種姓氏模式都不加姓。",
    compound: "複姓是中文姓氏才有的概念，只套用在古風武俠／現代都市／校園青春／懸疑驚悚／科幻（科幻的 AI／仿生人代號不加姓），選「複姓」時下一頁西方奇幻／日系輕小說會停用無法點選，想要這兩類請改選「隨機」「自訂輸入」或「不需要」。",
  };

  function updateSurnameRandomHint() {
    const hint = $("#novel-surname-random-hint");
    const compoundHint = $("#novel-surname-compound-hint");
    const isRandomOrCompound = state.surnameMode === "random" || state.surnameMode === "compound";
    if (hint) {
      hint.hidden = !isRandomOrCompound;
      if (isRandomOrCompound) hint.textContent = SURNAME_MODE_HINTS[state.surnameMode];
    }
    // 複姓說明只在「複姓」模式、且小說分類真的會套用姓氏（HANZI_STYLES）時顯示；
    // POOL_STYLES 已經由上面那句提示涵蓋，兩句同時顯示會互相矛盾。
    if (compoundHint) compoundHint.hidden = !(state.surnameMode === "compound" && CHINESE_SURNAME_STYLES.includes(state.style));
  }

  // 「隨機」「複姓」兩個模式對 POOL_STYLES（西方奇幻／日系輕小說／科幻）完全沒有效果（見
  // pickSurname），讓這三個分類還能被點選、點了卻完全沒套用姓氏，容易讓人以為功能壞掉，所以
  // 兩個模式都直接停用這三個分類的按鈕，不是只顯示提示文字。2026-11 第十七輪原本只對「複姓」
  // 做這件事（使用者當時只回報複姓的情境），後來使用者確認「隨機」也要比照辦理，才擴大成
  // 兩個模式一起停用，見 NOTES.md。
  function updateStyleAvailability() {
    const row = document.querySelector('.option-row[data-field="style"]');
    if (!row) return;
    // 第二十一輪：停用範圍改由 disabledStylesFor 依模式決定（隨機只停用科幻、複姓停用三類）。
    const disabledStyles = disabledStylesFor(state.surnameMode);
    let activeCleared = false;
    row.querySelectorAll(".option-btn").forEach((btn) => {
      btn.disabled = disabledStyles.includes(btn.dataset.value);
      if (btn.disabled && btn.classList.contains("active")) {
        btn.classList.remove("active");
        activeCleared = true;
      }
    });
    if (activeCleared) {
      state.style = "";
      renderQualityRow();
      updateSpecialRequestHint();
      updateSurnameRandomHint();
      // 第二十二輪起只有「複姓」會停用分類（西方奇幻／日系輕小說），隨機不再停用科幻。
      NG.toast("「複姓」不支援西方奇幻／日系輕小說這兩類，已清空小說分類，請重新選擇");
    }
  }

  // 特殊需求排除邏輯（extractExcludeChars）只能擷取中文字，西方奇幻的候選是純英文姓名
  // （見資料檔 novel-fantasy.json），打中文字完全不會命中、也不會有任何提示（既有 bug，
  // 見設計文件第十三節 C 組第 5 項、NOTES.md）。日系輕小說／科幻的候選本身是中文/漢字
  // （novel-japanese.json 的 name 欄位是漢字、reading 才是羅馬拼音；novel-scifi.json
  // 全部是中文姓名），排除邏輯對這兩個分類原本就有效，不受這個限制，不需要加提示。
  // 修法選「加提示讓使用者知道限制」而非「改比對英文字母片段」：使用者輸入特殊需求
  // 時打的通常是中文描述（例如「避免出現智這個字」），就算讓程式額外比對輸入裡的英文字母
  // 片段，也只能處理使用者剛好打了英文單字這種罕見情境，解不了真正常見的情境（打中文），
  // 還會多一套「什麼算命中片段」的模糊規則、增加維護負擔，不符合「好維護、不過度複雜」
  // 的原則，所以改用提示文字讓使用者理解限制，而不是默默失效。見 NOTES.md。
  function updateSpecialRequestHint() {
    const hint = $("#special-request-hint");
    if (!hint) return;
    hint.hidden = state.style !== "fantasy";
  }

  function currentPersonalityList() {
    // 性格標籤 16 個，不隨小說分類改變、七個分類共用同一組（見資料檔 _meta 說明），
    // 所以不像 renderQualityRow 需要依 state.style 切換文字，選字庫載入後就固定，
    // 讓 renderPersonalityRow 只需在 init 呼叫一次（見 onStyleChange 附近的說明與 NOTES.md）。
    return extraByStyle.gufeng ? extraByStyle.gufeng.personalities : [];
  }

  // 可複選（5.1、5.2.1 定案，第五輪改版）：角色氣質是使用者跨類型共通的氣場組合，
  // 例如都市總裁可以同時是「豪門世家」＋「心機算計」，跟性格標籤一樣用同一種可複選標籤元件。
  // 只顯示目前小說分類「有提供」的氣質（byStyle 值非 null），5.2.1 表格三格「不提供」的組合
  // 在對應分類底下不出現按鈕。
  function renderQualityRow() {
    const row = $("#quality-row");
    row.innerHTML = "";
    if (!state.style) {
      row.innerHTML = '<p class="field-hint">' + qualityEmptyHint() + '</p>';
      return;
    }
    const available = QUALITIES.filter((q) => q.byStyle[state.style]);
    available.forEach((q) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn" + (state.qualities.includes(q.id) ? " active" : "");
      btn.dataset.value = q.id;
      btn.textContent = q.byStyle[state.style];
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        toggleInArray(state.qualities, q.id);
      });
      row.appendChild(btn);
    });
    if (available.length === 0) {
      row.innerHTML = '<p class="field-hint">' + qualityEmptyHint() + '</p>';
    }
  }

  function qualityEmptyHint() {
    return "請先選擇小說分類";
  }

  function renderPersonalityRow() {
    const row = $("#personality-row");
    row.innerHTML = "";
    currentPersonalityList().forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.dataset.value = p.id;
      btn.textContent = p.label;
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        toggleInArray(state.personalities, p.id);
      });
      row.appendChild(btn);
    });
    if (currentPersonalityList().length === 0) {
      row.innerHTML = '<p class="field-hint">' + qualityEmptyHint() + '</p>';
    }
  }

  function toggleInArray(arr, value) {
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
  }

  // 第 1 頁（姓氏）目前未滿足的必填項目；目前只有一項，但仍回傳陣列而不是單一字串，
  // 跟 baby-name.js 的 validateStep1 保持同一種介面，之後第 1 頁如果再加必填欄位，
  // 疊加顯示的邏輯不用改。
  // 第四十二節：每條除了文字（text）還帶對應欄位（field），showStepError 會把那個欄位標成印章紅邊框（同 baby-name.js）。
  function validateStep1() {
    const errors = [];
    if (state.surnameMode === "custom" && !state.surnameCustom) {
      errors.push({ text: "已選擇「自訂輸入」，請輸入姓氏，或改選「不需要」", field: "#novel-surname-custom" });
    }
    return errors;
  }

  // 目前畫面上看得到的那一頁該檢查哪些項目：第 1 頁只檢查姓氏；第 2 頁除了姓氏（防呆，
  // 理論上已經在「下一步」擋過一次）還要加上小說分類必填。用 currentStep 判斷，
  // 不是固定檢查全部項目，避免使用者還在第 1 頁、小說分類根本還看不到時就被念。
  function validateCurrentStep() {
    const errors = validateStep1();
    if (currentStep === 2 && !state.style) {
      errors.push({ text: "請先選擇小說分類", field: '.option-row[data-field="style"]' });
    }
    return errors;
  }

  // 必填驗證訊息顯示在「上一步/下一步」按鈕正下方（#step-error），不是用全站共用、
  // 固定在頁面最底部的 NG.toast，跟 baby-name.js 同樣的使用者回饋、同樣的做法。
  // 第四十二節：同時把對應欄位加上 .field-invalid（輸入框印章紅邊框；小說分類那一排按鈕邊框換色），
  // 每次呼叫都先清掉上一輪的標記再依這次的 errors 重標，已修正的欄位在 refreshStepErrorIfShown 時立刻恢復。
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
    $all("#novel-form .field-invalid").forEach((f) => {
      f.classList.remove("field-invalid");
      f.removeAttribute("aria-invalid");
    });
  }

  // 跟 baby-name.js 同樣的修法：欄位變動當下就重新檢查，已顯示的錯誤訊息如果已經被解決
  // 就立刻收掉，不用等使用者再點一次下一步或送出（見 NOTES.md）。訊息目前沒顯示時不做任何事。
  // 2026-11 使用者實測發現：原本這裡只重新檢查 validateStep1()，選了小說分類之後，
  // 第 2 頁靠送出表單跳出來的「請先選擇小說分類」訊息完全沒反應——因為小說分類的檢查
  // 寫死在 submit 事件裡、沒有被這個函式涵蓋到。改成呼叫 validateCurrentStep()，
  // 同一個函式依目前頁數涵蓋兩頁各自的必填項目，不是只顧第 1 頁。
  function refreshStepErrorIfShown() {
    const el = $("#step-error");
    if (el.hidden) return;
    const errors = validateCurrentStep();
    if (errors.length === 0) {
      hideStepError();
    } else {
      showStepError(errors);
    }
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
    $("#novel-form").addEventListener("submit", (e) => {
      e.preventDefault();
      // 第 1 頁的必填已經在「下一步」擋過，這裡只補第 2 頁（小說分類）跟防呆重複檢查。
      const errors = validateCurrentStep();
      if (errors.length > 0) { showStepError(errors); return; }
      hideStepError();
      // 從表單送出＝條件可能變了（例如換了小說分類），舊的鎖定一律清掉，跟 baby-name.js 一致。
      runGeneration({ fromForm: true });
    });
  }

  function goToStep(step) {
    if (step === 2 && !state.style) {
      // 允許先看到欄位，但小說分類為必填，離開表單前會再擋一次
    }
    currentStep = step;
    $("#step-1").hidden = step !== 1;
    $("#step-2").hidden = step !== 2;
    $("#btn-prev").hidden = step === 1;
    $("#btn-next").hidden = step === 2;
    $("#btn-generate").hidden = step !== 2;
    $("#step-indicator").textContent = step === 1
      ? "第 1 頁／共 2 頁：角色基本資料"
      : "第 2 頁／共 2 頁：小說分類與角色設定";
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
    // 修改條件：退回步驟 1 那筆瀏覽紀錄（第三十五節）。
    $("#btn-edit-form").addEventListener("click", () => viewHistory.backTo("step1"));
    // 分享全部：點下去直接複製整批結果的連結（不展開選單）。
    // 社群平台分享改放在頁尾的「分享這個網站」，分享的是工具本身而不是取名結果。
    $("#btn-share-all").addEventListener("click", () => {
      if (lastCandidates.length === 0) return;
      const url = NG.buildShareAllUrl(lastCandidates);
      NG.copyText(url, "分享連結已複製，貼給朋友就能看到這 " + lastCandidates.length + " 個名字");
    });
  }

  // 第三十八節：「清空重填」，第四十二節拆成「全部清空」（resetForm，範圍與確認門檻不變）＋
  // 「清除此頁」（clearCurrentStep，只清目前這一頁、結果與另一頁都保留），做法同 baby-name.js。
  // 頁面分組依 HTML 的 #step-1／#step-2：第 1 頁＝性別／年齡層／姓氏模式／自訂姓氏；
  // 第 2 頁＝小說分類／情感取向／角色氣質／性格標籤／特殊需求。
  // 跨頁連動只有一條：第 1 頁「複姓」會停用第 2 頁的西方奇幻／日系輕小說（updateStyleAvailability）。
  // 清第 1 頁＝姓氏模式回到「隨機」，只會把停用的分類重新開放，不會清掉第 2 頁已選的分類；
  // 清第 2 頁不碰姓氏模式，停用狀態維持原樣（所以這裡不像 resetForm 先把 disabled 全部打開）。
  function bindResetForm() {
    $("#btn-reset-form").addEventListener("click", resetForm);
    $("#btn-clear-step").addEventListener("click", clearCurrentStep);
    // 第四十五節：結果頁專用的「全部清空」（跟表單頁的 #btn-reset-form 是兩個 DOM 節點，同一個
    // click 動作），同一個位置只有一顆會顯示（showView 控制 .step-bar／#result-section 的顯示）。
    $("#btn-reset-form-result").addEventListener("click", resetForm);
  }

  function step1HasContent() {
    return (
      state.gender !== "unisex" ||
      !!state.ageTier ||
      state.surnameMode !== "random" ||
      !!state.surnameCustom
    );
  }

  function step2HasContent() {
    return (
      !!state.style ||
      !!state.orientation ||
      state.qualities.length > 0 ||
      state.personalities.length > 0 ||
      state.specialRequest.trim() !== ""
    );
  }

  function formHasContent() {
    return step1HasContent() || step2HasContent() || lastCandidates.length > 0;
  }

  function syncOptionRows(fields) {
    fields.forEach((field) => {
      const row = document.querySelector('.option-row[data-field="' + field + '"]');
      if (!row) return;
      row.querySelectorAll(".option-btn").forEach((b) => b.classList.toggle("active", b.dataset.value === String(state[field])));
    });
  }

  function clearStep1Fields() {
    state.gender = "unisex";
    state.ageTier = "";
    state.surnameMode = "random";
    state.surnameCustom = "";
    syncOptionRows(["gender", "ageTier", "surnameMode"]);
    $("#novel-surname-custom").value = "";
    $("#novel-surname-custom").hidden = true;
    updateSurnameRandomHint();
    updateStyleAvailability();
  }

  function clearStep2Fields() {
    state.style = "";
    state.orientation = "";
    state.qualities = [];
    state.personalities = [];
    state.specialRequest = "";
    syncOptionRows(["style", "orientation"]);
    $("#special-request").value = "";
    renderQualityRow();
    renderPersonalityRow();
    updateSurnameRandomHint();
    updateSpecialRequestHint();
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

    $all('.option-row[data-field="style"] .option-btn').forEach((b) => { b.disabled = false; });
    clearStep1Fields();
    clearStep2Fields();
    hideStepError();

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
    NG.clearSession("novel", viewHistory.sid);

    // 回到步驟 1：跟「修改條件」同一套退回瀏覽紀錄的做法（NG.createViewHistory），不是另推一筆新紀錄。
    viewHistory.backTo("step1");
    NG.toast("已清空，重新開始填寫");
  }

  function charInfo(ch) {
    return charsBase.chars.find((c) => c.char === ch) ||
      { char: ch, pinyin: "", gender: "neutral", tags: [], personalityTags: [], qualityTags: [], meaning: "", popularity: 3 };
  }

  function genderScore(charGender) {
    if (state.gender === "unisex") return 0;
    if (charGender === state.gender) return 1;
    if (charGender === "neutral") return 0;
    return -1;
  }

  // 情感取向（言情/耽美/百合）加分項。見 NOTES.md 的判斷記錄：
  // 耽美／百合在定義上就是男男／女女配對，這是配對類型的結構性事實，不是憑空發明的語意連結；
  // 但單一漢字的字義（如「智」「勇」）跟「言情/耽美/百合」這種關係類型之間沒有可查證的語意關聯，
  // 勉強做親和度對應表會流於臆測，因此改用「候選的性別跟情感取向的性別傾向」做加分，
  // 而非對每個字/名字做情感取向語意標註。言情不分性別，一律給同樣的小幅加分（等同不影響排序）。
  function orientationScore(candidateGender) {
    if (!state.orientation) return 0;
    if (state.orientation === "yanqing") return 1;
    if (state.orientation === "danmei") {
      if (candidateGender === "male") return 2;
      if (candidateGender === "neutral") return 1;
      return 0;
    }
    if (state.orientation === "baihe") {
      if (candidateGender === "female") return 2;
      if (candidateGender === "neutral") return 1;
      return 0;
    }
    return 0;
  }

  function extractExcludeChars(text) {
    if (!text) return [];
    const matches = text.match(/[一-鿿]/g);
    return matches ? Array.from(new Set(matches)) : [];
  }

  function pickSurname() {
    if (state.surnameMode === "none") return "";
    if (state.surnameMode === "custom") return state.surnameCustom || "";
    // 使用者鎖住了某一批的隨機／複姓姓氏：再產生一次時沿用（10.4 的例外，見 NOTES.md 第二十五節）。
    // 鎖定一定來自同一個分類的上一批（從表單送出會清空鎖定），不會出現中文姓配到日系名的情況。
    const isHanzi = HANZI_STYLES.includes(state.style);
    const hasOwnSurnamePool = SURNAME_POOL_STYLES.includes(state.style);
    // 隨機：漢字類抽中文姓氏池，西方奇幻／日系輕小說抽各自資料檔的姓氏庫（第二十一輪）。
    // 複姓：只對中文姓氏分類生效。
    // 第二十二輪：科幻跟漢字類共用中文姓氏池（CHINESE_SURNAME_STYLES）；整批抽一個姓，代號條目在
    // finalizeCandidate 不套用（candidateTakesSurname），所以同一批裡人類有姓、代號維持原樣。
    if (state.surnameMode === "random" && hasOwnSurnamePool) {
      if (locks.surname) return locks.surname;
      const pool = namePoolByStyle[state.style].surnames;
      return pool[Math.floor(Math.random() * pool.length)].surname;
    }
    if (!isHanzi && state.style !== "scifi") return "";
    if (locks.surname) return locks.surname;
    if (state.surnameMode === "compound") return randomCompoundSurname();
    return randomNovelSurname();
  }

  // 這張卡可以鎖哪些單位（規則見 NOTES.md 第二十五節）：
  // - 姓氏：只有「隨機」「複姓」模式、而且這批真的有套姓氏（漢字類分類）才需要鎖。
  // - 名字的字：只有漢字類分類（候選是逐字組合出來的）。小說取名的漢字組合本來就混著單字名與雙字名，
  //   單字名鎖住那個字之後，新一批會是「含這個字的單字或雙字名」（第四十四節起預設不限位置），仍有足夠組合，所以單字名也開放。
  // - 西方奇幻／日系輕小說／科幻是整筆姓名庫，名字不是逐字組合出來的，沒有「字位」可鎖，不顯示鎖定按鈕。
  // 第二十一輪：西方奇幻／日系輕小說在「隨機」模式也會抽姓，比照 10.3「隨機姓氏可以鎖」開放只鎖姓氏
  // （名字仍是整筆條目、沒有字位可鎖），所以這兩類在隨機模式下卡片會出現只有「姓「佐藤」」一個選項的鎖定按鈕。
  // 第二十二輪：科幻人類卡在隨機/複姓模式也會出現只有「姓」一個選項的鎖定按鈕；代號卡沒有套姓，不顯示鎖定按鈕。
  // 第二十三輪：西方奇幻／日系輕小說的名字開放「整個名字」當一個單位鎖（{type:"given_pool", value: entry.name}，
  // 兩份姓名庫內 name 都不重複，可直接當比對值）。比照寶寶取名單字名鎖字：名字固定後，
  // 姓氏隨機時只換姓（第三十五節起一次出 5 張、各配不同姓氏）、姓氏不隨機或已鎖時每批都是同一張（見 isSurnameOnlyVarying／onLocksChanged）。
  // 姓氏自訂/不需要時也開放（跟寶寶取名單字名一致），所以這兩類每張卡都會有鎖定按鈕。科幻不在此範圍。
  function lockUnitsFor(c, surname) {
    const units = [];
    if ((state.surnameMode === "random" || state.surnameMode === "compound") && surname && candidateTakesSurname(c)) {
      units.push({ type: "surname", value: surname });
    }
    if (c.kind === "pool" && SURNAME_POOL_STYLES.includes(state.style)) {
      units.push({ type: "given_pool", value: c.entry.name });
      return units;
    }
    if (c.kind !== "hanzi") return units;
    c.chars.forEach((ch, pos) => units.push({ type: "given", pos, char: ch }));
    return units;
  }

  function matchesLock(c) {
    if (!locks.given) return true;
    if (locks.given.pool !== undefined) return c.kind === "pool" && c.entry.name === locks.given.pool;
    if (c.kind !== "hanzi") return true;
    // 第四十四節：預設只鎖字（任何位置有這個字就算），使用者另外按「也固定在首字／末字」才比對位置。
    return NG.charsMatchGivenLock(locks, c.chars);
  }

  // 西方奇幻／日系輕小說鎖住整個名字：只剩這一筆條目，每批必然只有 1 張卡、每次都「看完一輪」。
  function isPoolNameLocked() {
    return !!locks.given && locks.given.pool !== undefined;
  }

  function runGeneration(opts) {
    const fromForm = !!(opts && opts.fromForm);
    if (fromForm) {
      locks.surname = null;
      locks.given = null;
    }
    let candidates;
    if (HANZI_STYLES.includes(state.style)) {
      candidates = generateHanziCandidates();
    } else {
      candidates = generateNamePoolCandidates();
    }

    const excludeChars = extractExcludeChars(state.specialRequest);
    if (excludeChars.length > 0) {
      candidates = candidates.filter((c) => !excludeChars.some((ex) => c.rawText.includes(ex)));
    }

    candidates.sort((a, b) => b.score - a.score);
    // 抽樣池大小動態跟著候選總數調整（修正既有 bug，見 NOTES.md 第九節第 34 點／第十一節）：
    // 舊寫法固定下限 30、上限 60，對西方奇幻/日系/科幻這類只有 26~28 筆的音譯姓名庫來說，
    // 下限 30 已經大於資料庫總筆數，slice(0, 30) 等於把全部候選都收進洗牌池，score 排序完全不起作用。
    // 改成「取總數的 30%，下限 10、上限 60」：
    // - 上限 60 跟舊邏輯一致，大候選池（漢字類組合，上萬筆）維持原本的篩選強度，不受這次調整影響。
    // - 下限 10 是刻意抓的，不是跟舊下限 30 一樣的數字巧合延用：純用 30% 比例，26~28 筆的音譯姓名庫
    //   會算出 8~9，太接近「再產生一次」要抽 5 個的下限，洗牌池跟輸出數量太接近會讓隨機性不夠；
    //   抓 10 筆讓洗牌池明顯大於 5（保留重新產生時的變化），又明顯小於 26~28 筆全池（分數排序才有篩選力）。
    // - 候選數量被「特殊需求」排除邏輯削減到比下限還少時，slice 會自然回傳剩下全部，不影響候選數量保證。
    const topPoolSize = Math.max(10, Math.min(60, Math.ceil(candidates.length * 0.3)));
    // 鎖定的字先當硬性條件篩一次；抽樣池大小沿用上一行以「鎖定前」候選總數算出的值，篩選強度不因鎖定而改變。
    candidates = candidates.filter(matchesLock);
    // 第十九輪起改成「只從本次瀏覽還沒看過的名字裡抽」，池子用完才允許重複（NG.sampleExcludingSeen）。
    // 比對 key 沿用原本 dedupe 的 kind:rawText（不含姓氏）。
    const { chosen, exhausted } = NG.sampleExcludingSeen(
      candidates, (c) => c.kind + ":" + c.rawText, seenNames, topPoolSize, 5
    );
    // 鎖住整個名字時每次都會窮盡，這句提示會每按一次就跳、像出錯，改由鎖定狀態列說明（同寶寶取名單字名）。
    if (exhausted && !fromForm && !isPoolNameLocked()) {
      NG.toast("符合目前條件的名字都看過一輪了，接下來可能會出現看過的名字");
    }

    // 整批 5 個候選用同一個隨機姓氏（10.4 節：不是每個候選各自隨機不同姓氏），
    // 這裡每次呼叫 runGeneration（含「再產生一次」）都重新抽一次，符合 10.4 節規則（姓氏被鎖定時除外）。
    // 第三十五節：西方奇幻／日系輕小說鎖整個名字＋隨機姓氏沒鎖＝名字固定、只剩姓氏能變，
    // 改成一次出 5 張卡、每張從該分類的姓氏庫各抽一個不同姓氏（取代第二十三輪「每批只剩 1 張、只換姓」）。
    const givenKeyOf = (c) => c.kind + ":" + c.rawText;
    let picked = chosen;
    let surnames;
    if (isSurnameOnlyVarying() && chosen.length > 0) {
      const pool = namePoolByStyle[state.style].surnames.map((s) => s.surname);
      const r = NG.pickSurnamesForFixedName(pool, givenKeyOf(chosen[0]), seenFullNames, 5);
      surnames = r.surnames;
      picked = surnames.map(() => chosen[0]);
      if (r.exhausted) NG.toast("這個名字能搭配的姓氏都看過一輪了，接下來可能會出現看過的姓名");
    } else {
      const surname = pickSurname();
      surnames = chosen.map(() => surname);
    }
    const finalCandidates = picked.map((c, i) => finalizeCandidate(c, i, surnames[i]));
    lastCandidates = finalCandidates;
    lastLockMeta = picked.map((c, i) => ({ chars: c.chars || [], units: lockUnitsFor(c, surnames[i]) }));
    picked.forEach((c, i) => seenFullNames.add(NG.fullNameKey(surnames[i], givenKeyOf(c))));

    renderCandidates(finalCandidates);
    // 從步驟 2 產生結果＝往前一步，推一筆瀏覽紀錄；在結果頁按「再產生一次」不推（第三十五節）。
    if (currentView !== "result") viewHistory.forward("result");
    showView("result");
    saveSession();
  }

  // 名字固定、只剩姓氏能變（第三十五節）：西方奇幻／日系輕小說鎖整個名字、姓氏隨機、姓氏沒鎖。
  function isSurnameOnlyVarying() {
    return isPoolNameLocked() && state.surnameMode === "random" && !locks.surname &&
      SURNAME_POOL_STYLES.includes(state.style);
  }

  // 任何一張卡改了鎖定：整批卡片的鎖定按鈕狀態、結果區下方的狀態列一起更新。
  function onLocksChanged() {
    lockControls.forEach((ctrl) => ctrl.refresh());
    const text = NG.describeLocks(locks);
    let msg = text ? "已鎖定：" + text + "。按「再產生一次」，新一批都會保留。" : "";
    if (text && isPoolNameLocked()) {
      // 第三十五節：姓氏隨機沒鎖時一次出 5 個不同姓氏；姓氏也固定時姓名完全固定，仍是每批 1 張。
      msg += isSurnameOnlyVarying()
        ? "鎖住整個名字後名字固定，再產生一次會一次給 5 個不同的隨機姓氏搭配這個名字；想看其他名字請按「全部解除」。"
        : "鎖住整個名字、姓氏又不是隨機（或已鎖定），姓名完全固定，再產生一次每批都只會是同一個名字；想看其他名字請按「全部解除」。";
    }
    $("#lock-status").hidden = !text;
    $("#lock-status-text").textContent = msg;
  }

  // 氣質/性格評分改為直接比對逐字標註欄位（設計文件 7.2 節定案，第五輪改版拿掉「身分→氣質」
  // 間接換算，見檔案開頭註解與 NOTES.md）：
  // - 角色氣質：使用者選的氣質代碼（state.qualities，可複選），候選字如果標有同樣的氣質
  //   （qualityTags）就加分，複選代表可能同時命中好幾個氣質標籤、各自加分。
  // - 性格：使用者選的性格標籤，候選字如果標有同樣的標籤（personalityTags）就加分。
  function generateHanziCandidates() {
    const pool = charsBase.chars;
    const combos = [];
    pool.forEach((c) => combos.push([c.char]));
    pool.forEach((c1) => {
      pool.forEach((c2) => {
        if (c1.char !== c2.char) combos.push([c1.char, c2.char]);
      });
    });

    return combos.map((chars) => {
      let score = 0;
      chars.forEach((ch) => {
        const info = charInfo(ch);
        score += genderScore(info.gender);
        score += orientationScore(info.gender);
        state.qualities.forEach((qId) => {
          if ((info.qualityTags || []).includes(qId)) score += 2;
        });
        state.personalities.forEach((pId) => {
          if ((info.personalityTags || []).includes(pId)) score += 2;
        });
        score += info.popularity * 0.1;
      });
      score += Math.random() * 0.5;
      return {
        kind: "hanzi",
        chars,
        rawText: chars.join(""),
        score,
      };
    });
  }

  function generateNamePoolCandidates() {
    const data = namePoolByStyle[state.style];
    return data.names.map((entry) => {
      let score = genderScore(entry.gender);
      score += orientationScore(entry.gender);
      state.qualities.forEach((qId) => {
        if ((entry.qualityTags || []).includes(qId)) score += 2;
      });
      state.personalities.forEach((pId) => {
        if (entry.personalities.includes(pId)) score += 2;
      });
      score += Math.random() * 0.5;
      // 科幻人類條目（第二十二輪拆成 surname＋given）：rawText 只用名字部分，跟漢字類一致
      // （「排除已看過」key 與特殊需求排除都不含姓）。同名不同姓的條目（例如江澈／聞澈／蕭澈）
      // 會共用同一個 key，sampleExcludingSeen 會自動去重，同一批不會出現兩個「陳澈」。
      const displayName = isSplitHumanEntry(entry) ? entry.given : entry.name;
      return {
        kind: "pool",
        entry,
        rawText: displayName + (entry.reading || ""),
        score,
      };
    });
  }

  function finalizeCandidate(c, index, surname) {
    const styleLabel = STYLE_LABELS[state.style];
    if (c.kind === "hanzi") {
      const infos = c.chars.map((ch) => charInfo(ch));
      const givenName = c.chars.join("");
      const fullName = (surname || "") + givenName;
      // 拼音／威妥瑪拼音含姓氏（2026-11 新增，見 NOTES.md 第二十四節）：只對漢字類分類
      // （古風武俠／現代都市／校園青春／懸疑驚悚）有意義，西方奇幻/日系輕小說/科幻用的是
      // 音譯姓名庫（entry.reading），不是漢語拼音系統，不適用，那個分支維持原樣不動。
      const { pinyin, wadeGiles } = NG.buildRomanizedName(surname, infos);
      const meaningSummary = infos.filter((i) => i.meaning).map((i) => i.char + "：" + i.meaning).join("\n");
      const extra = extraByStyle[state.style];
      const matchedTags = [];
      state.qualities.forEach((qId) => {
        const label = qualityLabelFor(qId, state.style);
        if (label) matchedTags.push("氣質：" + label);
      });
      state.personalities.forEach((id) => {
        const label = extra.personalities.find((x) => x.id === id).label;
        matchedTags.push("性格：" + label);
      });
      if (state.orientation) {
        matchedTags.push("情感取向：" + ORIENTATION_LABELS[state.orientation]);
      }
      return {
        id: "novel-" + fullName + "-" + Date.now() + "-" + index,
        tool: "novel",
        fullName,
        pinyin,
        wadeGiles,
        meaningSummary: meaningSummary || "（" + styleLabel + " ・ " + fullName + "）",
        matchedTags,
      };
    }

    const entry = c.entry;
    // 姓名順序依文化慣例（第二十一輪，見 NOTES.md 第二十七節）：
    // - 西方奇幻：「名 姓」，半形空格（Elowen Blackwood），跟原本自訂輸入的語序一致。
    // - 日系輕小說：「姓 名」，半形空格（佐藤 美咲）；原本自訂輸入是中文式緊貼（佐藤美咲），一併改成有空格，
    //   讓隨機與自訂兩種來源的日系姓名長得一樣。讀音同樣依「姓 名」順序組成「Sato Misaki」。
    // - 科幻（第二十二輪）：人類條目是「姓氏模式給的姓＋given」，中文式緊貼（陳知微）；資料裡原本的
    //   surname 欄位不顯示，「不需要」時只顯示名字（跟漢字類一致）。代號條目整串照原樣，永遠不加姓。
    let fullName;
    let reading = entry.reading || "";
    if (state.style === "scifi") {
      fullName = isSplitHumanEntry(entry) ? (surname || "") + entry.given : entry.name;
    } else if (state.style === "fantasy") {
      fullName = entry.name + (surname ? " " + surname : "");
    } else if (state.style === "japanese") {
      fullName = surname ? surname + " " + entry.name : entry.name;
      const found = surname ? (namePoolByStyle.japanese.surnames || []).find((s) => s.surname === surname) : null;
      // 自訂輸入的姓氏查不到讀音時，只顯示名字的讀音（跟漢字類自訂姓氏查無拼音的降級方式一致）。
      if (found && reading) reading = found.reading + " " + reading;
    } else {
      fullName = (surname || "") + entry.name;
    }
    const identityLabels = entry.identities.map((id) => {
      const found = namePoolByStyle[state.style].identities.find((x) => x.id === id);
      return found ? found.label : id;
    });
    const personalityLabels = entry.personalities.map((id) => {
      const found = extraByStyle.gufeng.personalities.find((x) => x.id === id);
      return found ? found.label : id;
    });
    state.qualities.forEach((qId) => {
      const label = qualityLabelFor(qId, state.style);
      if (label) personalityLabels.push("氣質：" + label);
    });
    if (state.orientation) {
      personalityLabels.push("情感取向：" + ORIENTATION_LABELS[state.orientation]);
    }
    return {
      id: "novel-" + fullName + "-" + Date.now() + "-" + index,
      tool: "novel",
      fullName,
      pinyin: reading,
      meaningSummary: styleLabel + " ・ " + identityLabels.join("、"),
      matchedTags: personalityLabels,
    };
  }

  function renderCandidates(candidates) {
    const grid = $("#candidate-grid");
    grid.innerHTML = "";
    lockControls = [];
    candidates.forEach((c, i) => grid.appendChild(renderCandidateCard(c, lastLockMeta[i])));
    // 第二十三輪：標題與分享按鈕依實際數量顯示，不寫死「5 個」（第三十五節起只有姓名完全固定時才會是 1 個）。
    $("#result-title").textContent = "為你找到的 " + candidates.length + " 個名字";
    $("#btn-share-all").textContent = "分享全部 " + candidates.length + " 個名字";
    onLocksChanged();
  }

  // lockMeta 只有結果區的卡片會傳（收藏抽屜、分享區的卡片不能鎖定）。
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
      // 威妥瑪拼音只有漢字類分類（古風武俠/現代都市/校園青春/懸疑驚悚）才會有值，
      // 音譯姓名庫（西方奇幻/日系/科幻）的 c.pinyin 本來就是 entry.reading，沒有 c.wadeGiles。
      py.textContent = c.wadeGiles ? c.pinyin + " ・ " + c.wadeGiles : c.pinyin;
      card.appendChild(py);
    }

    const meaning = document.createElement("div");
    meaning.className = "candidate-meaning";
    const meaningText = c.meaningSummary || "";
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
    copyBtn.addEventListener("click", () => NG.copyText(c.fullName));
    actions.appendChild(copyBtn);

    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "icon-btn" + (NG.isFavorited("novel", c.id) ? " favorited" : "");
    favBtn.dataset.favId = c.id;
    favBtn.textContent = NG.isFavorited("novel", c.id) ? "已收藏" : "收藏";
    favBtn.addEventListener("click", () => {
      const nowFav = NG.toggleFavorite("novel", c);
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
