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
    nameLength: 1, // 1 = 兩字全名（單字名）；2 = 三字全名（雙字名）
    useGenerationChar: false,
    generationChar: "",
    gender: "unisex",
    birthMonth: "",
    zodiacId: "",
  };

  let meaningSorter = null;
  let currentStep = 1;
  let lastCandidates = [];

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
    refreshFavoritesSection();

    const sharedAll = NG.readSharedAllFromUrl();
    if (sharedAll && sharedAll.length > 0) {
      renderSharedCandidates(sharedAll);
    } else {
      const shared = NG.readSharedFromUrl();
      if (shared) renderSharedCandidates([shared]);
    }
  }

  // 收藏查看區塊（5.：候選卡收藏/取消收藏時都要呼叫，讓區塊即時同步）。
  function refreshFavoritesSection() {
    NG.renderFavoritesSection(
      "baby",
      $("#favorites-grid"),
      $("#favorites-empty-hint"),
      $("#fav-count"),
      renderCandidateCard
    );
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
      });
    });

    $("#surname-custom").addEventListener("input", (e) => {
      state.surnameCustom = e.target.value.trim();
    });
  }

  function bindGenerationField() {
    const toggle = $("#generation-toggle");
    const input = $("#generation-char");
    toggle.addEventListener("change", () => {
      state.useGenerationChar = toggle.checked;
      input.hidden = !toggle.checked;
    });
    input.addEventListener("input", (e) => {
      state.generationChar = e.target.value.trim().slice(0, 1);
    });
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

  function bindStepNav() {
    $("#btn-next").addEventListener("click", () => goToStep(2));
    $("#btn-prev").addEventListener("click", () => goToStep(1));
    $("#baby-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (state.surnameMode === "custom" && !state.surnameCustom) { NG.toast("已選擇「自訂輸入」，請輸入姓氏，或改選「不需要」"); return; }
      if (state.useGenerationChar && !state.generationChar) { NG.toast("已開啟「固定字輩」，請輸入字輩用字，或關閉開關"); return; }
      runGeneration();
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
    $("#btn-share-all").addEventListener("click", () => {
      if (lastCandidates.length === 0) return;
      const url = NG.buildShareAllUrl(lastCandidates);
      NG.copyText(url, "分享連結已複製，貼給朋友就能看到這 " + lastCandidates.length + " 個名字");
    });
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

  function buildCandidatePool() {
    return charsBase.chars.filter((c) => genderCompatible(c.gender));
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
    return NG.randomSurname();
  }

  function runGeneration() {
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

    // 取分數前段做隨機抽樣，讓「再產生一次」在維持相關性的前提下仍有變化（10.3）。
    const topPool = combos.slice(0, Math.max(30, Math.min(60, combos.length)));
    shuffle(topPool);
    const chosen = dedupeByName(topPool).slice(0, 5);

    const surname = pickSurname();
    lastCandidates = chosen.map((combo, i) => buildCandidateObject(combo.chars, surname, i));

    renderCandidates(lastCandidates);
    $(".form-card").hidden = true;
    $(".step-indicator").hidden = true;
    $("#result-section").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dedupeByName(list) {
    const seen = new Set();
    const out = [];
    list.forEach((item) => {
      const key = item.chars.join("");
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

  function buildCandidateObject(chars, surname, index) {
    const infos = chars.map((ch) => charInfo(ch));
    const givenName = chars.join("");
    const fullName = surname + givenName;
    const pinyin = infos.map((i) => i.pinyin).filter(Boolean).join(" ");
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
      meaningSummary,
      matchedTags,
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
      const url = NG.buildShareUrl(c);
      NG.copyText(url, "分享連結已複製，貼給朋友就能看到「" + c.fullName + "」");
    });
    actions.appendChild(shareBtn);

    card.appendChild(actions);
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
