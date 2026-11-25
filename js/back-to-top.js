// 回到最上方按鈕（文章精選頁、FAQ 頁共用）：捲過第一屏才浮現，點擊捲回頂端。
(function () {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "back-to-top";
  btn.setAttribute("aria-label", "回到最上方");
  btn.title = "回到最上方";
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.appendChild(btn);

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ticking = false;

  function update() {
    ticking = false;
    btn.classList.toggle("is-visible", window.scrollY > window.innerHeight);
  }

  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener("resize", update);
  window.addEventListener("pageshow", update);

  // 捲回頂端後焦點移到頁面標題，鍵盤使用者不會停在一顆已經隱藏的按鈕上。
  btn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
    var heading = document.querySelector("main h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    } else {
      btn.blur();
    }
  });

  update();
})();
