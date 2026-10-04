/* Steam Sale Alert - 앱 로직
 * games.json 스키마:
 *   { scrapedAt, currency, imgBase, imgFile,
 *     stats: { total, newToday, reviews10kPlus },
 *     games: [ { i, n, d, r, c, o, s, h, f } ] }
 *   i=appId  n=이름  d=할인율  r=조정평점  c=리뷰수
 *   o=기존가  s=할인가  h=이미지해시  f=최초발견일
 */
(function () {
  "use strict";

  var PAGE = 60;          // 한 번에 렌더링할 카드 수
  var LS_KEY = "ssa.filters.v1";

  var state = {
    data: null,
    list: [],
    shown: 0,
    dataDate: "",
    priceMax: 200,
  };

  var el = {};
  ["stats", "stamp", "q", "sort", "price", "priceOut", "discount", "discountOut",
   "rating", "ratingOut", "reviews", "hideSeen", "reset", "count", "grid",
   "sentinel", "empty", "more", "footSub", "filters", "filterToggle",
   "filterSummary", "countMini"].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function compact(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  function money(v) {
    var s = Number(v).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    return state.data && state.data.currency ? s + " " + state.data.currency : s;
  }

  function storeUrl(id) { return "https://store.steampowered.com/app/" + id + "/"; }

  function imgUrl(g) {
    if (!g.g) return null;
    return (state.data.imgPrefix || "") + g.i + "/" + g.g;
  }

  /* ---------- 필터 상태 ---------- */
  function readFilters() {
    return {
      q: el.q.value.trim().toLowerCase(),
      sort: el.sort.value,
      price: Number(el.price.value),
      discount: Number(el.discount.value),
      rating: Number(el.rating.value),
      reviews: Number(el.reviews.value),
      hideSeen: el.hideSeen.checked,
    };
  }

  function saveFilters() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(readFilters())); } catch (e) {}
  }

  function loadFilters() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (!s) return;
      if (s.q) el.q.value = s.q;
      if (s.sort) el.sort.value = s.sort;
      if (typeof s.price === "number") el.price.value = s.price;
      if (typeof s.discount === "number") el.discount.value = s.discount;
      if (typeof s.rating === "number") el.rating.value = s.rating;
      if (s.reviews) el.reviews.value = String(s.reviews);
      el.hideSeen.checked = !!s.hideSeen;
    } catch (e) {}
  }

  /* ---------- 필터링 + 정렬 ---------- */
  function apply() {
    var f = readFilters();
    var out = [];

    for (var i = 0; i < state.list.length; i++) {
      var g = state.list[i];
      if (f.price < state.priceMax && g.s > f.price) continue;
      if (f.discount > 0 && g.d < f.discount) continue;
      if (f.rating > 0 && g.p < f.rating) continue;
      if (f.reviews > 0 && g.c < f.reviews) continue;
      if (f.hideSeen && g.f < state.dataDate) continue;
      if (f.q && g.n.toLowerCase().indexOf(f.q) === -1) continue;
      out.push(g);
    }

    var dir = 1;
    switch (f.sort) {
      case "price-desc": dir = -1; /* fallthrough */
      case "price-asc":
        out.sort(function (a, b) { return (a.s - b.s) * dir || a.c - b.c || (a.i < b.i ? -1 : 1); });
        break;
      case "discount-desc":
        out.sort(function (a, b) { return b.d - a.d || b.p - a.p || (a.i < b.i ? -1 : 1); });
        break;
      case "rating-desc":
        out.sort(function (a, b) { return b.p - a.p || b.c - a.c || (a.i < b.i ? -1 : 1); });
        break;
      case "reviews-desc":
        out.sort(function (a, b) { return b.c - a.c || b.p - a.p || (a.i < b.i ? -1 : 1); });
        break;
      case "name-asc":
        out.sort(function (a, b) { return a.n.localeCompare(b.n, "ko") || (a.i < b.i ? -1 : 1); });
        break;
    }
    return out;
  }

  /* ---------- 렌더링 ---------- */
  function cardHtml(g) {
    var isNew = g.f >= state.dataDate;
    var initial = esc(g.n.slice(0, 1).toUpperCase());
    var url = imgUrl(g);
    // 이미지 상대경로가 없으면 실패를 기다리지 않고 바로 대체 타일을 그린다.
    var img = url
      ? '<img class="thumb" loading="lazy" decoding="async" src="' + esc(url) +
        '" alt="" data-initial="' + initial + '">'
      : '<div class="thumb-fallback">' + initial + '</div>';
    return '<a class="card" href="' + esc(storeUrl(g.i)) + '" target="_blank" rel="noopener">' +
      img +
      '<div class="card-body">' +
        '<div class="card-top">' +
          '<span class="name">' + esc(g.n) + (isNew ? '<span class="badge-new">NEW</span>' : '') + '</span>' +
          '<span class="discount">-' + g.d + '%</span>' +
        '</div>' +
        '<div class="card-mid">' +
          '<span class="price">' + esc(money(g.s)) + '</span>' +
          '<span class="price-off">' + esc(money(g.o)) + '</span>' +
        '</div>' +
        '<div class="card-bot">' +
          '<span class="rating">★ ' + g.p + '%</span>' +
          '<span>리뷰 ' + compact(g.c) + '</span>' +
        '</div>' +
      '</div>' +
    '</a>';
  }

  function render(reset) {
    var list = apply();

    if (reset) {
      state.shown = 0;
      el.grid.innerHTML = "";
    }

    var end = Math.min(state.shown + PAGE, list.length);
    var html = "";
    for (var i = state.shown; i < end; i++) html += cardHtml(list[i]);
    el.grid.insertAdjacentHTML("beforeend", html);
    state.shown = end;

    el.count.innerHTML = "조건相符 <b>" + list.length.toLocaleString("ko-KR") + "</b>개" +
      (list.length ? " 중 <b>" + state.shown.toLocaleString("ko-KR") + "</b>개 표시" : "");
    el.countMini.textContent = list.length.toLocaleString("ko-KR") + "개";
    el.empty.hidden = list.length > 0;
    el.more.hidden = state.shown >= list.length;
    el.more.textContent = "더 보기 (" + (list.length - state.shown).toLocaleString("ko-KR") + "개 남음)";
  }

  function renderReset() { render(true); }

  /* ---------- 출력 라벨 ---------- */
  function updateLabels() {
    el.priceOut.textContent = Number(el.price.value) >= state.priceMax ? "전체" : "≤ " + money(el.price.value);
    el.discountOut.textContent = Number(el.discount.value) > 0 ? el.discount.value + "%+" : "전체";
    el.ratingOut.textContent = Number(el.rating.value) > 0 ? el.rating.value + "%+" : "전체";
    updateSummary();
  }

  /* 접힌 상태에서 현재 조건을 한 줄로 보여준다. */
  function updateSummary() {
    var f = readFilters();
    var parts = [];
    if (f.q) parts.push("‘" + f.q + "’");
    if (Number(el.price.value) < state.priceMax) parts.push("≤ " + money(f.price));
    if (f.discount > 0) parts.push(f.discount + "%+");
    if (f.rating > 0) parts.push("★" + f.rating + "+");
    if (f.reviews > 0) parts.push("리뷰 " + compact(f.reviews) + "+");
    if (f.hideSeen) parts.push("본 것 숨김");
    el.filterSummary.textContent = parts.length ? parts.join(" · ") : "전체";
  }

  /* ---------- 초기화 ---------- */
  function header() {
    var s = state.data.stats || {};
    var cur = state.data.currency || "";
    el.stats.innerHTML =
      "진행 중 <b>" + (s.total || 0).toLocaleString("ko-KR") + "</b>개" +
      " · 오늘 신규 <b>" + (s.newToday || 0).toLocaleString("ko-KR") + "</b>개" +
      " · 리뷰 1만+ <b>" + (s.reviews10kPlus || 0).toLocaleString("ko-KR") + "</b>개";
    el.stamp.textContent = "수집 " + state.data.scrapedAt.replace("T", " ").replace(/\..*$/, " UTC") + " · 가격 통화 " + cur;
    el.footSub.textContent = "데이터 수집 " + state.data.scrapedAt.slice(0, 10) + " 기준. 할인 종료일은 제공되지 않습니다.";
  }

  function calibratePrice() {
    // 98퍼센타일 근처로 슬라이더 상한을 맞춰 대부분이 필터에 걸리지 않게 한다
    var prices = state.list.map(function (g) { return g.s; }).sort(function (a, b) { return a - b; });
    if (!prices.length) return;
    var p98 = prices[Math.min(prices.length - 1, Math.floor(prices.length * 0.98))];
    var max = Math.max(10, Math.ceil(p98 / 10) * 10);
    el.price.max = String(max);
    state.priceMax = max;
    if (Number(el.price.value) > max) el.price.value = String(max);
  }

  function bind() {
    var timer = null;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () { updateLabels(); saveFilters(); renderReset(); }, 140);
    }

    ["q", "sort", "price", "discount", "rating", "reviews"].forEach(function (id) {
      el[id].addEventListener("input", function () {
        if (id === "q") { schedule(); return; }
        updateLabels(); saveFilters(); renderReset();
      });
      el[id].addEventListener("change", function () {
        updateLabels(); saveFilters(); renderReset();
      });
    });

    el.hideSeen.addEventListener("change", function () { saveFilters(); renderReset(); });

    // error 이벤트는 버블링하지 않으므로 캡처 단계에서 처리한다.
    el.grid.addEventListener("error", function (e) {
      var img = e.target;
      if (!img || img.tagName !== "IMG" || !img.classList.contains("thumb")) return;
      var box = document.createElement("div");
      box.className = "thumb-fallback";
      box.textContent = img.getAttribute("data-initial") || "?";
      if (img.parentNode) img.parentNode.replaceChild(box, img);
    }, true);

    el.reset.addEventListener("click", function () {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      el.q.value = "";
      el.sort.value = "price-asc";
      el.price.value = el.price.max;
      el.discount.value = "0";
      el.rating.value = "0";
      el.reviews.value = "0";
      el.hideSeen.checked = false;
      updateLabels();
      renderReset();
    });

    el.more.addEventListener("click", function () { render(false); });

    // 좁은 화면에서만 접힌 필터를 토글한다 (넓은 화면에서는 항상 펼쳐 둔다).
    el.filterToggle.addEventListener("click", function () {
      var open = el.filters.classList.toggle("open");
      el.filterToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !el.more.hidden) render(false);
      }, { rootMargin: "600px" }).observe(el.sentinel);
    } else {
      el.more.hidden = false;
    }

    window.addEventListener("scroll", function () {
      if (el.more.hidden) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1200) render(false);
    }, { passive: true });
  }

  /* ---------- 설치 안내 ---------- */
  function setupInstall() {
    var standalone = window.matchMedia("(display-mode: standalone)").matches ||
                     window.navigator.standalone === true;
    if (standalone || localStorage.getItem("ssa.install.dismissed")) return;

    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    var deferred = null;

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
    });

    setTimeout(function () {
      if (deferred) {
        show("홈 화면에 설치하면 앱처럼 실행됩니다.", "설치", function () {
          deferred.prompt();
          deferred.userChoice.then(function () { hide(); });
        });
        return;
      }
      if (isIOS) {
        show("크롬 메뉴 <b>더보기</b> → <b>홈 화면에 추가</b> 로 설치할 수 있습니다.", "알림", function () {
          localStorage.setItem("ssa.install.dismissed", "1");
          hide();
        });
      }
    }, 2500);

    function show(html, label, onClick) {
      var bar = document.createElement("div");
      bar.className = "install show";
      bar.innerHTML = '<div class="install-text">' + html + '</div>' +
        '<button type="button">' + label + '</button>' +
        '<button type="button" class="dismiss" aria-label="닫기">&times;</button>';
      var btns = bar.querySelectorAll("button");
      btns[0].addEventListener("click", onClick);
      btns[1].addEventListener("click", function () {
        localStorage.setItem("ssa.install.dismissed", "1");
        hide();
      });
      document.body.appendChild(bar);

      function hide() { if (bar.parentNode) bar.parentNode.removeChild(bar); }
    }
  }

  /* ---------- 서비스 워커 ---------- */
  function setupSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  /* ---------- 시작 ---------- */
  function boot(data) {
    state.data = data;
    state.dataDate = (data.scrapedAt || "").slice(0, 10);
    state.list = data.games || [];

    loadFilters();
    calibratePrice();
    updateLabels();
    header();
    bind();
    renderReset();
    setupInstall();
    setupSW();
  }

  function fail(msg) {
    el.count.innerHTML = "";
    el.empty.hidden = false;
    el.empty.textContent = msg;
    el.stats.textContent = "";
  }

  fetch("games.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(boot)
    .catch(function (e) {
      fail("games.json을 불러오지 못했습니다 (" + e.message + "). 수집 작업이 아직 실행되지 않았을 수 있습니다.");
    });
})();
