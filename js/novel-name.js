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
  let shareAllMenu = null; // 分享全部的選單，跟 lastCandidates 綁在一起，換一批候選就要重建（見 runGeneration）

  function resetShareAllMenu() {
    if (shareAllMenu) {
      shareAllMenu.remove();
      shareAllMenu = null;
    }
  }

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
    });
    $("#novel-surname-custom").addEventListener("input", (e) => { state.surnameCustom = e.target.value.trim(); });
    $("#special-request").addEventListener("input", (e) => { state.specialRequest = e.target.value; });

    // 性格標籤清單不隨小說分類改變（見 currentPersonalityList），只需渲染一次；
    // 放進 onStyleChange 裡重複渲染是這次修的 bug 之一：每次切風格都重畫這個區塊，
    // 會把使用者已經點選的性格標籤一併清空（見 NOTES.md）。
    renderPersonalityRow();
    renderQualityRow(); // 尚未選小說分類時顯示「請先選擇小說分類」提示，跟性格標籤不同，氣質選項本身依分類換文字
    updateStyleAvailability(); // 預設姓氏模式是「隨機」，不會停用任何分類，這裡只是確保狀態一致，非必要但保守

    bindStepNav();
    bindResultActions();
    refreshFavoritesSection();

    const sharedAll = NG.readSharedAllFromUrl();
    if (sharedAll && sharedAll.length > 0) {
      renderSharedCandidates(sharedAll);
    } else {
      const shared = NG.readSharedFromUrl();
      if (shared) renderSharedCandidates([shared]);
    }
  }

  function refreshFavoritesSection() {
    NG.renderFavoritesSection(
      "novel",
      $("#favorites-grid"),
      $("#favorites-empty-hint"),
      $("#fav-count"),
      renderCandidateCard
    );
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
    // 不依賴小說分類，不應該被清空（這是上一輪修的 bug，原本連性格標籤都被重置，見 NOTES.md）。
    // 角色氣質本身（底層代碼）不整批清空：已選的氣質如果在新分類還有對應說法就維持選取、只換文字；
    // 剛好選到新分類「不提供」的氣質，靜默從 state.qualities 移除（不彈錯誤、不打斷），
    // 這是第五輪改版的核心邏輯，見設計文件 5.2.1 與 NOTES.md。
    state.qualities = state.qualities.filter((qId) => qualityLabelFor(qId, value) !== null);
    renderQualityRow();
    updateSpecialRequestHint();
    updateSurnameRandomHint();
  }

  // 複姓／單姓隨機池只對 HANZI_STYLES 合理（中文姓氏語境），西方奇幻／日系輕小說／科幻三類
  // 本身是音譯或日系姓名庫，隨機模式下套用中文姓氏（含複姓）會破壞語境，所以這三類在「隨機」
  // 模式下不加姓氏（等同「不需要」），並顯示提示讓使用者知道這不是漏生效，而是刻意的設計判斷，
  // 理由見 NOTES.md。此函式同時被「切換小說分類」與「切換姓氏模式」呼叫，因為姓氏欄位在表單
  // 第 1 頁、小說分類在第 2 頁，兩者任一變動都可能需要更新這個提示的顯示狀態。
  function updateSurnameRandomHint() {
    const hint = $("#novel-surname-random-hint");
    const compoundHint = $("#novel-surname-compound-hint");
    const isRandomOrCompound = state.surnameMode === "random" || state.surnameMode === "compound";
    if (hint) hint.hidden = !(isRandomOrCompound && POOL_STYLES.includes(state.style));
    // 複姓說明只在「複姓」模式、且小說分類真的會套用姓氏（HANZI_STYLES）時顯示；
    // POOL_STYLES 已經由上面那句「不會加上姓氏」的提示涵蓋，兩句同時顯示會互相矛盾。
    if (compoundHint) compoundHint.hidden = !(state.surnameMode === "compound" && HANZI_STYLES.includes(state.style));
  }

  // 「複姓」模式對 POOL_STYLES（西方奇幻／日系輕小說／科幻）完全沒有效果（見 pickSurname），
  // 跟「隨機」不同的是：使用者選複姓是刻意要確定拿到複姓，不是「可能拿到也可能沒有」的隨機期待，
  // 讓這三個分類在複姓模式下還能被點選，點了卻完全沒反應，比「隨機」模式下的落空更容易讓人以為
  // 功能壞掉。所以複姓模式直接停用這三個分類的按鈕，不是只顯示提示文字（提示文字在「隨機」模式
  // 下已經夠用，但複姓是刻意選的，應該在選擇當下就擋掉不合理組合，見使用者回饋／NOTES.md）。
  // 「隨機」模式目前維持原樣（三個分類仍可選，只顯示提示），跟使用者原始回饋範圍一致，
  // 沒有一併擴大改動——如果之後也想對「隨機」做一樣的事，是另一個待確認的決定。
  function updateStyleAvailability() {
    const row = document.querySelector('.option-row[data-field="style"]');
    if (!row) return;
    const disablePoolStyles = state.surnameMode === "compound";
    let activeCleared = false;
    row.querySelectorAll(".option-btn").forEach((btn) => {
      const isPoolStyle = POOL_STYLES.includes(btn.dataset.value);
      btn.disabled = disablePoolStyles && isPoolStyle;
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
      NG.toast("「複姓」不支援西方奇幻／日系輕小說／科幻這三類音譯姓名庫，已清空小說分類，請重新選擇");
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
  function validateStep1() {
    const errors = [];
    if (state.surnameMode === "custom" && !state.surnameCustom) {
      errors.push("已選擇「自訂輸入」，請輸入姓氏，或改選「不需要」");
    }
    return errors;
  }

  function bindStepNav() {
    $("#btn-next").addEventListener("click", () => {
      const errors = validateStep1();
      if (errors.length > 0) { NG.toast(errors); return; }
      goToStep(2);
    });
    $("#btn-prev").addEventListener("click", () => goToStep(1));
    $("#novel-form").addEventListener("submit", (e) => {
      e.preventDefault();
      // 第 1 頁的必填已經在「下一步」擋過，這裡只補第 2 頁（小說分類）跟防呆重複檢查。
      const errors = validateStep1();
      if (!state.style) errors.push("請先選擇小說分類");
      if (errors.length > 0) { NG.toast(errors); return; }
      runGeneration();
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindResultActions() {
    $("#btn-regenerate").addEventListener("click", () => runGeneration());
    $("#btn-edit-form").addEventListener("click", () => {
      $("#result-section").hidden = true;
      $(".form-card").hidden = false;
      $(".step-indicator").hidden = false;
      goToStep(1);
    });
    const shareAllBtn = $("#btn-share-all");
    shareAllBtn.addEventListener("click", () => {
      if (lastCandidates.length === 0) return;
      if (shareAllMenu) {
        shareAllMenu.hidden = !shareAllMenu.hidden;
        return;
      }
      const url = NG.buildShareAllUrl(lastCandidates);
      shareAllMenu = NG.createShareMenu(url, "幫我看看這 " + lastCandidates.length + " 個角色名字", "分享連結已複製，貼給朋友就能看到這 " + lastCandidates.length + " 個名字");
      shareAllBtn.insertAdjacentElement("afterend", shareAllMenu);
      shareAllMenu.hidden = false;
    });
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
    // random／compound 都只對 HANZI_STYLES 套用中文姓氏池，POOL_STYLES 見 updateSurnameRandomHint 說明。
    if (!HANZI_STYLES.includes(state.style)) return "";
    if (state.surnameMode === "compound") return randomCompoundSurname();
    return randomNovelSurname();
  }

  function runGeneration() {
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
    const topPool = candidates.slice(0, topPoolSize);
    shuffle(topPool);
    const chosen = dedupe(topPool).slice(0, 5);

    // 整批 5 個候選用同一個隨機姓氏（10.4 節：不是每個候選各自隨機不同姓氏），
    // 這裡每次呼叫 runGeneration（含「再產生一次」）都重新抽一次，符合 10.4 節規則。
    const surname = pickSurname();
    const finalCandidates = chosen.map((c, i) => finalizeCandidate(c, i, surname));
    lastCandidates = finalCandidates;
    resetShareAllMenu(); // 候選換了一批，舊的分享全部選單網址已經過期，清掉讓下次點擊重建

    renderCandidates(finalCandidates);
    $(".form-card").hidden = true;
    $(".step-indicator").hidden = true;
    $("#result-section").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      return {
        kind: "pool",
        entry,
        rawText: entry.name + (entry.reading || ""),
        score,
      };
    });
  }

  function dedupe(list) {
    const seen = new Set();
    const out = [];
    list.forEach((item) => {
      const key = item.kind + ":" + item.rawText;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    });
    return out;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function finalizeCandidate(c, index, surname) {
    const styleLabel = STYLE_LABELS[state.style];
    if (c.kind === "hanzi") {
      const infos = c.chars.map((ch) => charInfo(ch));
      const givenName = c.chars.join("");
      const fullName = (surname || "") + givenName;
      const pinyin = infos.map((i) => i.pinyin).filter(Boolean).join(" ");
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
        meaningSummary: meaningSummary || "（" + styleLabel + " ・ " + fullName + "）",
        matchedTags,
      };
    }

    const entry = c.entry;
    const fullName = state.style === "fantasy"
      ? entry.name + (surname ? " " + surname : "")
      : (surname || "") + entry.name;
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
      pinyin: entry.reading || "",
      meaningSummary: styleLabel + " ・ " + identityLabels.join("、"),
      matchedTags: personalityLabels,
    };
  }

  function renderCandidates(candidates) {
    const grid = $("#candidate-grid");
    grid.innerHTML = "";
    candidates.forEach((c) => grid.appendChild(renderCandidateCard(c)));
  }

  function renderCandidateCard(c) {
    const card = document.createElement("div");
    card.className = "candidate-card";

    const name = document.createElement("div");
    name.className = "candidate-name";
    name.textContent = c.fullName;
    card.appendChild(name);

    if (c.pinyin) {
      const py = document.createElement("div");
      py.className = "candidate-pinyin";
      py.textContent = c.pinyin;
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
    actions.appendChild(shareBtn);

    card.appendChild(actions);

    const url = NG.buildShareUrl(c);
    const shareMenu = NG.createShareMenu(url, "幫我看看這個角色名字：「" + c.fullName + "」", "分享連結已複製，貼給朋友就能看到「" + c.fullName + "」");
    shareBtn.addEventListener("click", () => {
      shareMenu.hidden = !shareMenu.hidden;
    });
    card.appendChild(shareMenu);

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
    section.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  init();
})();
