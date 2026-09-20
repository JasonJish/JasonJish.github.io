/* ══ behaviour ══  1 topic filter · 2 scroll spy · 3 lightbox. No dependencies. */
(function () {
  "use strict";
  function A(nl){ return Array.prototype.slice.call(nl); }

  var chips       = A(document.querySelectorAll(".chip"));
  var items       = A(document.querySelectorAll("[data-topics]"));
  var filterables = A(document.querySelectorAll("section[data-filterable]"));
  var sections    = A(document.querySelectorAll("main section"));
  var navLinks    = A(document.querySelectorAll(".railnav a"));
  var bar     = document.getElementById("statusbar");
  var barWhat = document.getElementById("statusTopics");
  var barNum  = document.getElementById("statusCount");
  var active  = [];
  var names   = {};

  chips.forEach(function (c) {
    var slot = c.querySelector(".n");
    names[c.dataset.topic] = c.textContent.replace(slot ? slot.textContent : "", "").trim();
    var n = items.filter(function (el) { return tags(el).indexOf(c.dataset.topic) > -1; }).length;
    if (slot) slot.textContent = n;
  });

  function tags(el){ return (el.dataset.topics || "").split(/\s+/); }
  function hit(el){
    if (!active.length) return true;
    var t = tags(el);
    return active.some(function (a) { return t.indexOf(a) > -1; });
  }

  function apply() {
    var shown = 0;
    items.forEach(function (el) { var ok = hit(el); el.hidden = !ok; if (ok) shown++; });

    A(document.querySelectorAll(".org")).forEach(function (org) {
      var p = A(org.querySelectorAll("[data-topics]"));   // projects, or teaching rows
      if (p.length) org.hidden = p.every(function (x) { return x.hidden; });
    });
    // While a topic filter is on, open every organisation so the matches show;
    // when it is cleared, close again the ones the filter opened.
    A(document.querySelectorAll(".org-toggle")).forEach(function (b) {
      if (active.length) {
        if (b.getAttribute("aria-expanded") !== "true") { b.dataset.auto = "1"; setPanel(b, true); }
      } else if (b.dataset.auto) { delete b.dataset.auto; setPanel(b, false); }
    });
    A(document.querySelectorAll(".talkgroup")).forEach(function (g) {
      var t = A(g.querySelectorAll(".talk"));
      g.hidden = t.length > 0 && t.every(function (x) { return x.hidden; });
    });

    // The photo strip follows the filter: only pictures of entries that are still shown.
    // (The thesis has no topics and its section is hidden while filtering, so its pictures go too.)
    var galShown = 0;
    A(document.querySelectorAll(".gal-card")).forEach(function (c) {
      var t = document.getElementById(c.getAttribute("href").slice(1));
      var ok = !active.length || !!(t && t.hasAttribute("data-topics") && hit(t));
      c.hidden = !ok; if (ok) galShown++;
    });
    var galBox = document.querySelector(".gal");
    if (galBox) galBox.hidden = galShown === 0;
    if (track) { track.scrollLeft = 0; ends(); }

    document.body.classList.toggle("filtering", active.length > 0);

    filterables.forEach(function (sec) {
      var own = A(sec.querySelectorAll("[data-topics]"));
      var vis = own.filter(function (el) { return !el.hidden; }).length;
      var note = sec.querySelector(".noresult");
      if (note) note.classList.toggle("show", vis === 0 && active.length > 0);
      var badge = sec.querySelector("[data-count]");
      if (badge) badge.textContent = active.length ? vis + " of " + own.length + " shown" : "";
      // a small section (Teaching) steps aside instead of saying "nothing matches"
      if (sec.getAttribute("data-filterable") === "optional") sec.hidden = active.length > 0 && vis === 0;
    });

    sections.forEach(function (sec) {
      if (sec.hasAttribute("data-filterable")) return;
      if (sec.id === "focus" || sec.id === "about" || sec.id === "contact") return;
      sec.hidden = active.length > 0;
    });

    navLinks.forEach(function (a) {
      var t = document.querySelector(a.getAttribute("href")), off = !!(t && t.hidden);
      a.classList.toggle("muted", off);
      if (off) { a.setAttribute("aria-disabled", "true"); a.tabIndex = -1; }
      else { a.removeAttribute("aria-disabled"); a.removeAttribute("tabindex"); }
    });

    if (active.length) {
      bar.hidden = false;
      barWhat.textContent = active.map(function (t) { return names[t]; }).join(" + ");
      barNum.textContent  = shown + (shown === 1 ? " item" : " items");
    } else { bar.hidden = true; }

    onScroll();   // sections appeared or disappeared
  }

  chips.forEach(function (c) {
    c.addEventListener("click", function () {
      var t = c.dataset.topic, i = active.indexOf(t);
      if (i > -1) active.splice(i, 1); else active.push(t);
      c.setAttribute("aria-pressed", i > -1 ? "false" : "true");
      apply();
    });
  });
  document.getElementById("clearFilter").addEventListener("click", function () {
    active = [];
    chips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
    apply();
    document.getElementById("focus").scrollIntoView({ block: "start" });
  });

  /* ─── 열람 전용: 저장 동작을 막는다 ──────────────────── */
  document.addEventListener("contextmenu", function (e) {
    if (e.target.closest(".fig-btn, .lb-stage, .pub-thumb, .lightbox")) e.preventDefault();
  });
  document.addEventListener("dragstart", function (e) {
    if (e.target.closest(".fig-btn, .lb-stage, .pub-thumb")) e.preventDefault();
  });

  /* ─── + / – toggles: each .xt button shows or hides the panel it controls ─── */
  function setPanel(b, open) {
    var p = document.getElementById(b.getAttribute("aria-controls"));
    if (!p) return null;
    b.setAttribute("aria-expanded", open ? "true" : "false");
    p.hidden = !open;
    return p;
  }
  A(document.querySelectorAll(".xt")).forEach(function (b) {
    b.addEventListener("click", function () {
      delete b.dataset.auto;   // the reader's choice now outlasts the filter
      setPanel(b, b.getAttribute("aria-expanded") !== "true");
    });
  });
  function openPanel(id) {
    var b = document.querySelector('.xt[aria-controls="' + id + '"]');
    return b ? setPanel(b, true) : null;
  }

  /* ─── 대표 사진 클릭 → 그 논문의 그림 패널 열기 ───────── */
  A(document.querySelectorAll("[data-open-figs]")).forEach(function (b) {
    b.addEventListener("click", function () {
      var card = b.closest(".pub, .pubrow");
      var p = card && openPanel(card.id + "-more");
      if (!p) return;
      var figs = p.querySelector(".figs");
      (figs || p).scrollIntoView({ block: "nearest" });
      var first = p.querySelector(".fig-btn");
      if (first) first.focus();
    });
  });

  /* ─── cross-links: project ↔ paper ↔ talk. Reveal the target, then flash it. ─── */
  function reveal(el) {
    unhide(el);
    if (active.length && (el.hidden || el.closest("[hidden]"))) {
      active = [];
      chips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      apply();
      unhide(el);   // clearing the filter closes what it had opened
    }
    for (var d = el.closest("details"); d; d = d.parentElement && d.parentElement.closest("details")) d.open = true;
  }
  // Bring the entry's top to the top of the window and pulse the entry — plus `target`
  // when it is a single figure inside the entry (its strip is moved sideways to show it).
  function go(id, push, target) {
    var entry = document.getElementById(id), el = target || entry;
    if (!el) return;
    reveal(el);
    if (target) showInStrip(target);
    var marks = [entry, target].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    marks.forEach(function (m) { m.classList.remove("flash"); });
    var done = false;
    function pulse() {
      if (done) return; done = true;
      window.removeEventListener("scrollend", pulse);
      marks.forEach(function (m) { void m.offsetWidth; m.classList.add("flash"); });
    }
    // Pulse once the smooth scroll has arrived, not while it is still moving.
    window.addEventListener("scrollend", pulse);
    setTimeout(pulse, "onscrollend" in window ? 1500 : 700);
    var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    (entry || el).scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    // Already in place (no scroll will happen, so no scrollend): pulse at once.
    var want = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) +
               (parseFloat(getComputedStyle(entry || el).scrollMarginTop) || 0);
    if (Math.abs((entry || el).getBoundingClientRect().top - want) < 3) pulse();
    if (push && history.pushState) history.pushState(null, "", "#" + id);
  }
  // Move a figure's sideways strip so that the figure is at its left edge. Pictures before it
  // may still be loading and change width, so it is put back in place for a moment after.
  function showInStrip(fig) {
    var strip = fig.closest(".figs");
    if (!strip) return;
    var until = Date.now() + 2500;
    function place() { strip.scrollLeft += fig.getBoundingClientRect().left - strip.getBoundingClientRect().left; }
    place();
    A(strip.querySelectorAll("img")).forEach(function (im) {
      if (!im.complete) im.addEventListener("load", function () { if (Date.now() < until) place(); }, { once: true });
    });
  }
  function unhide(el) {
    // Open any collapsed panel (organisation, details) that contains el.
    for (var p = el.parentElement; p; p = p.parentElement) {
      if (p.hidden && p.id) { var b = document.querySelector('.xt[aria-controls="' + p.id + '"]'); if (b) setPanel(b, true); }
    }
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a.xl, a.gal-card") : null;
    if (!a) return;
    e.preventDefault();
    var id = a.getAttribute("href").slice(1);
    if (!a.dataset.fig) { go(id, true); return; }
    // Photo strip: open the entry's figures and land on the chosen picture.
    var el = document.getElementById(id);
    if (!el) return;
    reveal(el);
    openPanel(id + "-more");
    var fig = null;
    A(el.querySelectorAll(".fig-btn")).forEach(function (b) {
      if (!fig && b.dataset.full === a.dataset.fig) fig = b.closest(".fig") || b;
    });
    if (fig) { go(id, true, fig); } else { go(id, true); }
  });
  /* photo strip arrows: move one screenful, hide an arrow at its end */
  var track = document.getElementById("galTrack");
  if (track) {
    // A new order on every visit (Fisher–Yates). Without JavaScript the page order stays.
    var deck = A(track.querySelectorAll(".gal-card"));
    for (var di = deck.length - 1; di > 0; di--) {
      var dj = Math.floor(Math.random() * (di + 1)), dt = deck[di]; deck[di] = deck[dj]; deck[dj] = dt;
    }
    deck.forEach(function (c) { track.appendChild(c); });
    var navs = A(document.querySelectorAll(".gal-nav"));
    var ends = function () {
      navs.forEach(function (b) {
        var d = +b.dataset.dir;
        b.disabled = d < 0 ? track.scrollLeft < 4 : track.scrollLeft + track.clientWidth > track.scrollWidth - 4;
      });
    };
    navs.forEach(function (b) {
      b.addEventListener("click", function () { track.scrollBy({ left: +b.dataset.dir * track.clientWidth * 0.8 }); });
    });
    track.addEventListener("scroll", ends, { passive: true });
    window.addEventListener("resize", ends);
    ends();
  }

  /* Short silent clips — in the photo strip and in the figure strips — play by themselves while
     they are on screen, like an animated GIF, and stop when scrolled away. They are marked
     preload="none": nothing is fetched until a clip is first on screen (its still is shown
     meanwhile), and then the whole light file comes in one request. This is on purpose
     also where the system asks for reduced motion (Windows with "animation effects" off reports
     that): a clip in an entry has a pause button, and none plays before its panel is opened. */
  function playClip(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  var clips = A(document.querySelectorAll(".gal-track video, .figs video"));
  if (clips.length && "IntersectionObserver" in window) {
    var clipWatch = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && !e.target.dataset.held) playClip(e.target); else e.target.pause(); });
    }, { threshold: 0.5 });
    clips.forEach(function (v) { clipWatch.observe(v); });
  }
  A(document.querySelectorAll(".vid-toggle")).forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.parentElement.querySelector("video");
      if (!v) return;
      var hold = !v.dataset.held;
      if (hold) { v.dataset.held = "1"; v.pause(); } else { delete v.dataset.held; playClip(v); }
      b.setAttribute("aria-pressed", hold ? "true" : "false");
      b.setAttribute("aria-label", hold ? "Play the clip" : "Pause the clip");
      b.textContent = hold ? "\u25B6" : "\u275A\u275A";
    });
  });

  var CODE = /^[JIKP]\d+(-\d+)?$/;
  window.addEventListener("hashchange", function () {
    var id = decodeURIComponent(location.hash.slice(1));
    if (CODE.test(id)) go(id, false);
  });

  /* ─── copy-to-clipboard + toast ─────────────────────── */
  var toast = document.getElementById("toast"), toastTimer = null;

  function flash(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 1900);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // file:// and other non-secure contexts have no Clipboard API.
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    });
  }

  A(document.querySelectorAll(".js-copy")).forEach(function (b) {
    b.addEventListener("click", function () {
      var text = b.dataset.copy, label = b.dataset.copyLabel;
      copy(text).then(
        function () { flash(label || "Copied to clipboard — " + text); },
        function () { flash("Could not copy" + (label ? "" : " — " + text)); }
      );
    });
  });

  /* scroll spy: the current section is the last one whose top has passed a line 30% down
     the window. (Comparing visible fractions fails for tall sections: inside a long
     Publications or Talks list the short section before it kept the highlight.) */
  var byId = {};
  navLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
  var navBox = document.getElementById("railnav"), spyQueued = false;
  function navEnds() {   // narrow screens: is there more of the bar to the right?
    if (navBox) navBox.classList.toggle("more", navBox.scrollWidth - navBox.clientWidth - navBox.scrollLeft > 4);
  }
  function spy() {
    spyQueued = false;
    var line = window.innerHeight * 0.3, best = null, last = null;
    sections.forEach(function (s) {
      if (!s.id || s.hidden || !byId[s.id]) return;
      last = s.id;
      if (s.getBoundingClientRect().top <= line) best = s.id;
    });
    // At the very end of the page the last section may be too short to reach the line.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) best = last;
    navLinks.forEach(function (a) { a.classList.toggle("active", a === byId[best]); });
    // The bar scrolls sideways on narrow screens: keep the current link in view.
    var cur = byId[best];
    if (cur && navBox && navBox.scrollWidth > navBox.clientWidth + 1) {
      var nb = navBox.getBoundingClientRect(), cb = cur.getBoundingClientRect();
      if (cb.left < nb.left + 8 || cb.right > nb.right - 8) navBox.scrollLeft += cb.left - nb.left - 24;
    }
    navEnds();
  }
  function onScroll() { if (!spyQueued) { spyQueued = true; requestAnimationFrame(spy); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  if (navBox) navBox.addEventListener("scroll", navEnds, { passive: true });

  /* lightbox */
  var lb = document.getElementById("lightbox"), img = document.getElementById("lbImg"), vid = document.getElementById("lbVid"),
      cap = document.getElementById("lbCap"), num = document.getElementById("lbCount"),
      prev = document.getElementById("lbPrev"), next = document.getElementById("lbNext"),
      shut = document.getElementById("lbClose");
  var gal = [], at = -1, opener = null;

  // The viewer steps through the pictures of one entry; a poster stands alone.
  function collect(b) {
    var strip = b.closest(".figs");
    gal = strip ? A(strip.querySelectorAll(".fig-btn")) : [b];
  }
  function show(i) {
    if (!gal.length) return;
    at = (i + gal.length) % gal.length;
    var b = gal[at], im = b.querySelector("img");
    lb.classList.toggle("is-portrait", b.classList.contains("portrait-btn"));   // the round photo stays round
    stopVid();
    if (b.dataset.kind === "video") {          // the original clip, with controls
      img.hidden = true; img.removeAttribute("src");
      vid.hidden = false; vid.src = b.dataset.full; playClip(vid);
    } else {
      vid.hidden = true; img.hidden = false;
      img.src = b.dataset.full;
      img.alt = im ? im.alt : "";
    }
    cap.textContent = b.dataset.caption || "";
    var pdf = document.getElementById("lbPdf");
    if (pdf) { pdf.hidden = !b.dataset.pdf; pdf.href = b.dataset.pdf || "#"; }
    num.textContent = gal.length > 1 ? (at + 1) + " / " + gal.length : "";
    prev.hidden = next.hidden = gal.length < 2;
  }
  function open(b) {
    collect(b);
    var i = Math.max(0, gal.indexOf(b));
    opener = b; lb.hidden = false;
    document.body.style.overflow = "hidden";
    show(i); shut.focus();
  }
  function stopVid() { vid.pause(); if (vid.getAttribute("src")) { vid.removeAttribute("src"); vid.load(); } }
  function close() {
    lb.hidden = true; img.removeAttribute("src"); stopVid();
    document.body.style.overflow = "";
    if (opener) { opener.focus(); opener = null; }
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".fig-btn, .portrait-btn") : null;
    if (b) { e.preventDefault(); open(b); }
  });
  shut.addEventListener("click", close);
  prev.addEventListener("click", function () { show(at - 1); });
  next.addEventListener("click", function () { show(at + 1); });
  lb.addEventListener("click", function (e) {
    if (e.target === lb || e.target.classList.contains("lb-stage")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape")     { e.preventDefault(); close(); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); show(at - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1); }
    if (e.key === "Tab") {
      var f = [shut, prev, next, vid, document.getElementById("lbPdf")].filter(function (b) { return b && !b.hidden; });
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });

  /* printing: closed <details> cannot be opened from CSS */
  window.addEventListener("beforeprint", function () {
    A(document.querySelectorAll("details:not([open])")).forEach(function (d) { d.dataset.printed = "1"; d.open = true; });
  });
  window.addEventListener("afterprint", function () {
    A(document.querySelectorAll("details[data-printed]")).forEach(function (d) { d.open = false; delete d.dataset.printed; });
  });

  apply();
  if (CODE.test(location.hash.slice(1))) go(location.hash.slice(1), false);

  /* First visit on a wide screen: start scrolled so the page name lines up with
     the name in the left rail; the coordinates line sits just above, off screen. */
  (function alignTop() {
    var mark = document.querySelector(".rail .mark"), h1 = document.querySelector(".hero h1");
    if (location.hash || !mark || !h1 || window.innerWidth <= 900) return;
    var set = -1;
    function place() {
      if (set >= 0 && Math.abs(window.scrollY - set) > 2) return;   // the reader has already scrolled
      var y = window.scrollY + h1.getBoundingClientRect().top - mark.getBoundingClientRect().top;
      window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: "instant" });
      set = window.scrollY;
    }
    if (window.scrollY === 0) {
      place();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    }
  })();
})();
