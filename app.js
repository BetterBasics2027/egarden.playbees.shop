/* Playbees wholesale catalog — catalog + order request. No build step, no framework. */
(function () {
  "use strict";
  const CFG = window.EG_CONFIG || {};
  const CONTACT = CFG.CONTACT || {};
  const LS_CART = "pbw.cart.v1", LS_FORM = "pbw.form.v1", LS_VIEW = "pbw.view.v1", LS_OUTBOX = "pbw.outbox.v1", LS_BRAND = "pbw.brand.v1";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n).toFixed(2);
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode etc. */ } };

  // This site replaced the 67-item show catalog at the same address. Carry over what a buyer's phone
  // saved there: unsent order requests (re-sent below), their details, and cart lines that still exist.
  (function migrateShowCatalog() {
    try {
      const old = lsGet("eg.outbox.v1", []);
      if (old.length) { lsSet(LS_OUTBOX, lsGet(LS_OUTBOX, []).concat(old)); localStorage.removeItem("eg.outbox.v1"); }
      const f = lsGet("eg.form.v1", null);
      if (f && !lsGet(LS_FORM, null)) lsSet(LS_FORM, f);
      const c = lsGet("eg.cart.v1", null);
      if (c && !lsGet(LS_CART, null)) lsSet(LS_CART, c);
      localStorage.removeItem("eg.form.v1"); localStorage.removeItem("eg.cart.v1");
    } catch (e) { /* storage unavailable */ }
  })();

  let DATA = null, ITEMS = [], BY = {}, CATS = [], CATBY = {}, BRANDS = [], BRAND = null;
  let cart = lsGet(LS_CART, {});
  let view = lsGet(LS_VIEW, "grid");
  let query = "";
  let lastFocus = null;

  // ---------------------------------------------------------------- boot
  fetch("data/catalog.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("catalog " + r.status); return r.json(); })
    .then(init)
    .catch((e) => { $("#catalog").innerHTML = '<p class="empty">The catalog could not load. Please refresh, or call ' + esc(CONTACT.phone || "") + ".</p>"; console.error(e); });

  function init(d) {
    DATA = d; ITEMS = d.items; CATS = d.categories;
    ITEMS.forEach((i) => (BY[i.id] = i));
    CATS.forEach((c) => (CATBY[c.id] = c));
    // drop cart lines that no longer exist
    Object.keys(cart).forEach((k) => { if (!BY[k] || !(cart[k] > 0)) delete cart[k]; });

    BRANDS = d.brands || [];
    $("#eyebrow").textContent = d.eyebrow || "Wholesale Pricing";
    $("#note").textContent = d.note || "All prices in US dollars.";
    // Hero brand switcher: both logos side by side; the selected one is full color, the other greyed out.
    $("#herobrands").innerHTML = BRANDS.map((b) => '<button type="button" style="--bc:' + esc(b.color || "") + '" data-brand="' + esc(b.id) + '" aria-label="' + esc(b.name) + " catalog, " + b.count + ' items" aria-pressed="false"><img src="' + esc(b.logo) + '" alt="' + esc(b.name) + '"><span>' + b.count + " items</span></button>").join("");
    // brand from ?brand=, then the last one viewed on this phone, then the first
    const want = (new URLSearchParams(location.search).get("brand") || lsGet(LS_BRAND, "") || "").toLowerCase();
    BRAND = BRANDS.find((b) => b.id === want) || BRANDS[0];

    const ct = CONTACT;
    $("#c-name").textContent = ct.name || "";
    $("#c-title").textContent = ct.title || "";
    $("#c-phone").textContent = ct.phone || "";
    $("#c-email").textContent = ct.email || "";
    $("#c-tel").href = "tel:" + String(ct.phone || "").replace(/[^\d+]/g, "");
    $("#c-mail").href = "mailto:" + (ct.email || "");

    $("#vgrid").setAttribute("aria-pressed", view === "grid");
    $("#vlist").setAttribute("aria-pressed", view === "list");

    applyBrand();
    syncCart();
    wire();
    flushOutbox();
  }

  // ---------------------------------------------------------------- brand switch (header logos)
  function applyBrand() {
    const b = BRAND;
    document.body.dataset.theme = b.id;
    document.title = b.name + " Wholesale Catalog";
    $$("#herobrands button").forEach((el) => el.setAttribute("aria-pressed", el.dataset.brand === b.id));
    $("#toplogo-img").src = b.logo; $("#toplogo-img").alt = b.name;
    $("#subtitle").textContent = b.subtitle || "";
    [$("#pdfbtn"), $("#pdfbig")].forEach((a) => { a.href = b.pdf + "?v=" + (DATA.built || ""); a.setAttribute("download", b.pdf.split("/").pop()); a.setAttribute("aria-label", "Download the " + b.name + " catalog (PDF)"); });
    $("#pdfbig-t").textContent = "Download the " + b.name + " catalog (PDF)";
    $("#mosaic").innerHTML = (b.mosaic || []).map((m) => '<div style="background:' + esc(m.bg) + '"><img src="' + esc(m.image) + '" alt="" loading="lazy"></div>').join("");
    const cats = CATS.filter((c) => c.counts[b.name]);
    $("#chips").innerHTML = cats.map((c) => '<a class="chip" href="#cat-' + esc(c.id) + '" style="--c:' + c.c + ";--cd:" + c.cd + '"><i></i>' + esc(c.name) + " <small>" + c.counts[b.name] + "</small></a>").join("");
    $("#navstrip").innerHTML = cats.map((c) => '<a href="#cat-' + esc(c.id) + '" data-cat="' + esc(c.id) + '" style="--c:' + c.c + ";--cd:" + c.cd + ";--t:" + c.t + '"><i></i>' + esc(c.name) + "</a>").join("");
    $("#q").placeholder = "Search " + b.count + " " + b.name + " items… (name or SKU)";
    render();
  }

  function setBrand(id) {
    const b = BRANDS.find((x) => x.id === id);
    if (!b) return;
    const same = b === BRAND;
    BRAND = b; lsSet(LS_BRAND, b.id);
    try { const u = new URL(location.href); u.searchParams.set("brand", b.id); u.hash = ""; history.replaceState(null, "", u); } catch (e) {}
    if (!same) applyBrand();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  // ---------------------------------------------------------------- render catalog
  function hit(i, q) {
    if (!q) return true;
    const hay = (i.uid || "") + " " + i.name + " " + i.spec + " " + i.brand + " " + (CATBY[i.category] || {}).name;
    return q.split(/\s+/).every((w) => hay.toLowerCase().includes(w));
  }

  function matches(i, q) { return i.brand === BRAND.name && hit(i, q); }

  function render() {
    const q = query.trim().toLowerCase();
    const main = $("#catalog");
    let html = "", any = false;
    const navOn = {};
    CATS.forEach((c) => {
      const its = ITEMS.filter((i) => i.category === c.id && matches(i, q));
      if (!its.length) return;
      any = true; navOn[c.id] = its.length;
      html += '<section class="sec" id="cat-' + esc(c.id) + '" data-cat="' + esc(c.id) + '" style="--c:' + c.c + ";--cd:" + c.cd + ";--t:" + c.t + '">';
      html += '<div class="band"><h2>' + esc(c.name) + "</h2><p>" + esc(c.blurb) + '</p><span class="cnt">' + its.length + (q ? " of " + c.counts[BRAND.name] : "") + (its.length === 1 && !q ? " item" : " items") + "</span></div>";
      html += view === "list" ? listHtml(its) : '<div class="grid">' + its.map(cardHtml).join("") + "</div>";
      html += "</section>";
    });
    if (!any) {
      const other = BRANDS.filter((b) => b !== BRAND).map((b) => ({ b, n: ITEMS.filter((i) => i.brand === b.name && hit(i, q)).length })).filter((x) => x.n);
      html = '<p class="empty">No ' + esc(BRAND.name) + " items match “" + esc(query) + "”." +
        other.map((x) => '<br><button class="ghost" data-brand="' + esc(x.b.id) + '">See ' + x.n + " in " + esc(x.b.name) + "</button>").join("") + "</p>";
    }
    main.innerHTML = html;
    $$("#navstrip a").forEach((a) => { a.hidden = !navOn[a.dataset.cat]; });
    syncCart();
    observeSections();
  }

  function badgeHtml(i) {
    return '<span class="uid">' + esc(i.uid) + "</span>";
  }

  function photoHtml(i, lazy) {
    if (i.image) return '<img src="' + esc(i.image) + '" alt="' + esc(i.name) + '"' + (lazy === false ? "" : ' loading="lazy"') + ">";
    return '<div class="nophoto"><b>' + esc(i.brand) + "</b><span>Photo coming soon</span></div>";
  }

  function specLine(i) { return i.spec; }
  function specBrand(i) { return i.brand + " · " + i.spec; }   // cart + order lines span both brands

  // Every item shows both prices; a 1-piece pack's piece price equals its pack price.
  function piece(i) { return i.piecePrice == null ? i.packPrice : i.piecePrice; }

  function priceHtml(i) {
    if (i.onRequest) return '<div class="px req"><div><span>Pack price</span><b>Ask us</b></div><div class="pc"><span>Per Piece</span><b>Ask us</b></div></div>';
    return '<div class="px"><div><span>Pack price</span><b>' + money(i.packPrice) + "</b></div>" +
      '<div class="pc"><span>Per Piece</span><b>' + money(piece(i)) + "</b></div></div>";
  }

  function actHtml(i) {
    const n = cart[i.id] || 0;
    if (!n) return '<div class="act"><button class="add" data-add="' + esc(i.id) + '">+ Add to order</button></div>';
    return '<div class="act"><div class="step" data-step="' + esc(i.id) + '"><button data-dec aria-label="Fewer packs">−</button>' +
      '<input type="number" inputmode="numeric" min="0" max="9999" value="' + n + '" aria-label="Packs"><button data-inc aria-label="More packs">+</button></div>' +
      '<button class="add done" data-open="' + esc(i.id) + '">' + unit(i, n) + " ✓</button></div>";
  }

  function cardHtml(i) {
    const n = cart[i.id] || 0;
    return '<article class="card' + (n ? " incart" : "") + '" data-id="' + esc(i.id) + '">' +
      '<div class="ph" style="background:' + esc(i.bg) + '" data-open="' + esc(i.id) + '">' + photoHtml(i) + badgeHtml(i) +
      (n ? '<span class="qtybadge">' + n + "</span>" : "") + "</div>" +
      '<div class="bd"><div class="nm" data-open="' + esc(i.id) + '">' + esc(i.name) + '</div><div class="sp">' + esc(specLine(i)) + "</div>" + priceHtml(i) + actHtml(i) + "</div></article>";
  }

  function listHtml(its) {
    return '<div class="list"><table><thead><tr><th></th><th>Product</th><th class="p">Pack</th><th class="p pc">Piece</th><th class="q">Qty</th></tr></thead><tbody>' +
      its.map((i) => {
        const n = cart[i.id] || 0;
        const thumb = i.image ? '<img class="thumb" src="' + esc(i.image) + '" alt="" loading="lazy" style="background:' + esc(i.bg) + '" data-open="' + esc(i.id) + '">' : '<div class="thumb nophoto" data-open="' + esc(i.id) + '"></div>';
        return '<tr data-id="' + esc(i.id) + '"><td>' + thumb + "</td>" +
          '<td class="n"><div class="nm" data-open="' + esc(i.id) + '"><small style="color:var(--cd);font-size:11px;margin-right:6px">' + esc(i.uid) + "</small>" + esc(i.name) + '</div><div class="sp">' + esc(specLine(i)) + "</div></td>" +
          (i.onRequest ? '<td class="p" colspan="2"><small>Ask us</small></td>'
            : '<td class="p">' + money(i.packPrice) + '<small class="pcm">' + money(piece(i)) + '/pc</small></td><td class="p pc">' + money(piece(i)) + "</td>") +
          '<td class="q"><input type="number" inputmode="numeric" min="0" max="9999" placeholder="0" value="' + (n || "") + '" class="' + (n ? "has" : "") + '" data-qty="' + esc(i.id) + '" aria-label="Packs of ' + esc(i.name) + '"></td></tr>';
      }).join("") + "</tbody></table></div>";
  }

  // ---------------------------------------------------------------- cart state
  function unit(i, n) { return n + (n === 1 ? " pack" : " packs"); }

  function setQty(id, n, opts) {
    n = Math.max(0, Math.min(9999, Math.floor(Number(n) || 0)));
    const was = cart[id] || 0;
    if (n === 0) delete cart[id]; else cart[id] = n;
    lsSet(LS_CART, cart);
    syncCart(id);
    if (!opts || !opts.quiet) {
      if (n > was) { bump(); toast((n === 1 && !was ? "Added " : "") + BY[id].name + " · " + unit(BY[id], n)); }
      else if (n === 0 && was) toast("Removed " + BY[id].name);
    }
  }

  function totals() {
    let packs = 0, sub = 0, req = 0, lines = 0;
    Object.keys(cart).forEach((id) => {
      const i = BY[id], n = cart[id];
      lines++; packs += n;
      if (i.onRequest) req++; else sub += n * i.packPrice;
    });
    return { packs, sub, req, lines };
  }

  function syncCart(onlyId) {
    const t = totals();
    $("#cartcount").textContent = t.packs;
    const bb = $("#bottombar");
    if (t.lines) {
      $("#bb-packs").textContent = t.lines + (t.lines === 1 ? " item · " : " items · ") + t.packs + " qty";
      $("#bb-total").textContent = money(t.sub) + (t.req ? " + " + t.req + " on request" : "");
      bb.classList.add("show");
    } else bb.classList.remove("show");

    // cards + list rows currently rendered
    $$(".card").forEach((el) => {
      const id = el.dataset.id; if (onlyId && id !== onlyId) return;
      const i = BY[id], n = cart[id] || 0;
      el.classList.toggle("incart", n > 0);
      const ph = $(".ph", el); const qb = $(".qtybadge", ph);
      if (n && !qb) ph.insertAdjacentHTML("beforeend", '<span class="qtybadge">' + n + "</span>");
      else if (n && qb) qb.textContent = n;
      else if (!n && qb) qb.remove();
      const act = $(".act", el);
      if (act) act.outerHTML = actHtml(i);
    });
    $$("input[data-qty]").forEach((inp) => {
      const id = inp.dataset.qty; if (onlyId && id !== onlyId) return;
      const n = cart[id] || 0;
      if (document.activeElement !== inp) inp.value = n || "";
      inp.classList.toggle("has", n > 0);
    });
    if ($("#sheet").classList.contains("show") && $("#sbody").dataset.id && (!onlyId || $("#sbody").dataset.id === onlyId)) {
      const act = $("#sbody .act"); if (act) act.outerHTML = actHtml(BY[$("#sbody").dataset.id]);
    }
    if ($("#drawer").classList.contains("show")) renderDrawer(onlyId);
  }

  function bump() { const n = $("#cartcount"); n.classList.remove("bump"); void n.offsetWidth; n.classList.add("bump"); }
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1600); }

  // ---------------------------------------------------------------- detail sheet
  function openSheet(id) {
    const i = BY[id]; if (!i) return;
    lastFocus = document.activeElement;
    const b = $("#sbody"); b.dataset.id = id;
    b.innerHTML = '<div><div class="sph" style="background:' + esc(i.bg) + '">' + photoHtml(i, false) + badgeHtml(i) + "</div></div>" +
      '<div><div class="snm">' + esc(i.name) + '</div><div class="ssp">' + esc(i.brand + " · " + i.spec) + " · " + esc((CATBY[i.category] || {}).name || "") + "</div>" + priceHtml(i) + actHtml(i) +
      (i.onRequest ? '<p class="msg" style="text-align:left">Add it with a quantity and we will quote it with your order.</p>' : "") + "</div>";
    $("#sheet").style.setProperty("--c", CATBY[i.category].c);
    $("#sheet").style.setProperty("--cd", CATBY[i.category].cd);
    $("#sheet").style.setProperty("--t", CATBY[i.category].t);
    show($("#sheet"));
  }

  // ---------------------------------------------------------------- drawer (cart + form)
  const form = Object.assign({ name: "", company: "", email: "", phone: "", notes: "" }, lsGet(LS_FORM, {}));
  let sending = false, doneState = null;

  function openDrawer() { lastFocus = document.activeElement; doneState = null; renderDrawer(); show($("#drawer")); }

  function renderDrawer(onlyId) {
    const body = $("#dbody"), foot = $("#dfoot");
    if (doneState) { body.innerHTML = doneHtml(doneState); foot.innerHTML = ""; return; }
    const t = totals();
    const ids = Object.keys(cart);
    // incremental update of one line if it's already drawn
    if (onlyId && $(".line[data-id]", body) && ids.includes(onlyId)) {
      const el = $('.line[data-id="' + onlyId + '"]', body);
      if (el) { el.outerHTML = lineHtml(BY[onlyId]); $("#tot").outerHTML = totHtml(t); return; }
    }
    if (!ids.length) {
      body.innerHTML = '<div class="done"><div class="big">🧸</div><h3>Nothing here yet</h3><p>Tap <b>+ Add to order</b> on any item, or type quantities in the Price list view.</p><button class="ghost" id="d-browse">Browse the catalog</button></div>';
      foot.innerHTML = "";
      return;
    }
    body.innerHTML = '<div id="lines">' + ids.map((id) => lineHtml(BY[id])).join("") + "</div>" + totHtml(t) + formHtml();
    foot.innerHTML = '<button class="send" id="send"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4z"/></svg>Submit order request</button><div class="msg" id="sendmsg">Goes straight to ' + esc(CONTACT.name || "our sales team") + ". No payment now; we confirm with you by email.</div>";
  }

  function lineHtml(i) {
    const n = cart[i.id] || 0;
    const c = CATBY[i.category];
    return '<div class="line" data-id="' + esc(i.id) + '" style="--c:' + c.c + ";--cd:" + c.cd + '">' + (i.image ? '<img src="' + esc(i.image) + '" alt="" style="background:' + esc(i.bg) + '" data-open="' + esc(i.id) + '">' : '<div class="nophoto sm"></div>') +
      '<div class="t"><div class="u">' + esc(i.uid) + '</div><div class="nm">' + esc(i.name) + '</div><div class="sp">' + esc(specBrand(i)) + "</div></div>" +
      '<div class="r">' + (i.onRequest ? '<div class="money" style="color:var(--mut);font-size:12px">Ask us</div>' : '<div class="money">' + money(n * i.packPrice) + '</div><div class="each">' + money(i.packPrice) + " / pack · " + money(piece(i)) + " / pc</div>") +
      '<div class="step" data-step="' + esc(i.id) + '"><button data-dec aria-label="Fewer packs">−</button><input type="number" inputmode="numeric" min="0" max="9999" value="' + n + '" aria-label="Packs"><button data-inc aria-label="More packs">+</button></div>' +
      '<button class="rm" data-rm="' + esc(i.id) + '">remove</button></div></div>';
  }

  function totHtml(t) {
    return '<div class="tot" id="tot"><div><span>' + t.lines + (t.lines === 1 ? " item" : " items") + "</span><span>" + t.packs + " total qty</span></div>" +
      (t.req ? '<div class="req"><span>Priced on request</span><span>' + t.req + (t.req === 1 ? " item" : " items") + "</span></div>" : "") +
      '<div class="big"><span>Subtotal</span><span>' + money(t.sub) + "</span></div>" +
      '<div class="req"><span>Excludes shipping' + (t.req ? " and on-request items" : "") + "</span><span></span></div></div>";
  }

  function formHtml() {
    return '<div class="form"><h3>Your details</h3>' +
      '<label for="f-name">Name *</label><input id="f-name" data-f="name" autocomplete="name" value="' + esc(form.name) + '">' +
      '<label for="f-company">Company / store *</label><input id="f-company" data-f="company" autocomplete="organization" value="' + esc(form.company) + '">' +
      '<div class="row"><div><label for="f-email">Email *</label><input id="f-email" data-f="email" type="email" autocomplete="email" inputmode="email" value="' + esc(form.email) + '"></div>' +
      '<div><label for="f-phone">Phone</label><input id="f-phone" data-f="phone" type="tel" autocomplete="tel" inputmode="tel" value="' + esc(form.phone) + '"></div></div>' +
      '<label for="f-notes">Notes</label><textarea id="f-notes" data-f="notes" placeholder="Ship-to, timing, questions…">' + esc(form.notes) + "</textarea></div>";
  }

  function doneHtml(s) {
    if (s.mode === "sent") return '<div class="done"><div class="big">🎉</div><h3>Request sent!</h3><div class="ref">' + esc(s.ref) + "</div><p>" + esc(CONTACT.name || "We") + " will confirm by email at " + esc(s.email) + '.</p><button class="ghost" id="d-browse">Keep browsing</button></div>';
    if (s.mode === "queued") return '<div class="done"><div class="big">📶</div><h3>Saved on this phone</h3><div class="ref">' + esc(s.ref) + '</div><p>No signal right now. Your request is saved and will send itself as soon as this page is back online. Keep the tab open, or reopen this site later.</p><a class="mail" href="#" id="d-retry">Try sending now</a><br><button class="ghost" id="d-browse">Keep browsing</button></div>';
    return "";
  }

  function readForm() {
    $$("[data-f]").forEach((el) => (form[el.dataset.f] = el.value.trim()));
    lsSet(LS_FORM, form);
  }

  function validate() {
    readForm();
    let ok = true;
    const need = { name: form.name, company: form.company, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) };
    Object.keys(need).forEach((k) => { const el = $("#f-" + k); el.classList.toggle("bad", !need[k]); if (!need[k]) ok = false; });
    if (!ok) { $("#sendmsg").textContent = "Please fill in name, company and a valid email."; $("#sendmsg").classList.add("err"); const bad = $(".form .bad"); if (bad) bad.focus(); }
    return ok;
  }

  function makeRef() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = "";
    for (let k = 0; k < 4; k++) r += a[Math.floor(Math.random() * a.length)];
    return "PB-" + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + "-" + r;
  }

  function payload(ref) {
    const t = totals();
    const lines = Object.keys(cart).map((id) => {
      const i = BY[id], n = cart[id];
      return { id: i.id, uid: i.uid, name: i.name, spec: specBrand(i), brand: i.brand, category: (CATBY[i.category] || {}).name, packs: n,
        packPrice: i.onRequest ? null : i.packPrice, piecePrice: i.onRequest ? null : i.piecePrice, lineTotal: i.onRequest ? null : +(n * i.packPrice).toFixed(2), onRequest: !!i.onRequest };
    });
    return { ref, site: CFG.SITE || location.host, submittedAt: new Date().toISOString(), name: form.name, company: form.company, email: form.email, phone: form.phone, notes: form.notes,
      lines, items: t.lines, packs: t.packs, subtotal: +t.sub.toFixed(2), onRequestLines: t.req, userAgent: navigator.userAgent };
  }

  // ---------------------------------------------------------------- sending + offline outbox
  async function post(p) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(CFG.ORDER_ENDPOINT, { method: "POST", body: JSON.stringify(p), redirect: "follow", signal: ctl.signal });
      const j = await r.json();
      if (!j || !j.ok) throw new Error((j && j.error) || "server said no");
      return j.ref || p.ref;
    } finally { clearTimeout(tm); }
  }

  async function send() {
    if (sending || !validate()) return;
    const ref = makeRef(), p = payload(ref), btn = $("#send"), msg = $("#sendmsg");
    sending = true; btn.disabled = true; btn.classList.add("busy"); btn.textContent = "Sending…"; msg.classList.remove("err"); msg.textContent = "";
    try {
      if (!CFG.ORDER_ENDPOINT) throw new Error("no endpoint configured");
      const got = await post(p);
      finish({ mode: "sent", ref: got, email: p.email });
    } catch (err) {
      console.error(err);
      // Save it and retry automatically; the buyer never has to do anything else.
      const box = lsGet(LS_OUTBOX, []); box.push(p); lsSet(LS_OUTBOX, box);
      finish({ mode: "queued", ref, email: p.email });
      scheduleFlush();
    } finally { sending = false; }
  }

  let flushing = false, flushTimer;
  async function flushOutbox() {
    if (flushing || !CFG.ORDER_ENDPOINT) return;
    const box = lsGet(LS_OUTBOX, []);
    if (!box.length) return;
    flushing = true;
    try {
      while (box.length) {
        const p = box[0];
        const got = await post(p);            // throws → stop, keep the rest for later
        box.shift(); lsSet(LS_OUTBOX, box);
        toast("Order request " + got + " sent");
        if (doneState && doneState.mode === "queued" && doneState.ref === p.ref) { doneState = { mode: "sent", ref: got, email: p.email }; if ($("#drawer").classList.contains("show")) renderDrawer(); }
      }
    } catch (err) { console.warn("outbox retry failed", err); scheduleFlush(); }
    finally { flushing = false; }
  }
  function scheduleFlush() { clearTimeout(flushTimer); if (lsGet(LS_OUTBOX, []).length) flushTimer = setTimeout(flushOutbox, 45000); }
  window.addEventListener("online", flushOutbox);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) flushOutbox(); });

  function finish(s) {
    doneState = s;
    cart = {}; lsSet(LS_CART, cart);
    syncCart();
    renderDrawer();
    $("#dbody").scrollTop = 0;
  }

  // ---------------------------------------------------------------- overlays
  function show(el) { $("#scrim").classList.add("show"); el.classList.add("show"); document.body.classList.add("locked"); const x = $(".x", el); if (x) x.focus({ preventScroll: true }); }
  function hideAll() {
    ["#drawer", "#sheet"].forEach((s) => $(s).classList.remove("show"));
    $("#scrim").classList.remove("show"); document.body.classList.remove("locked");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  // ---------------------------------------------------------------- scroll spy
  let io;
  function observeSections() {
    if (io) io.disconnect();
    const links = $$("#navstrip a");
    io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        const id = en.target.dataset.cat;
        links.forEach((a) => a.classList.toggle("on", a.dataset.cat === id));
        const on = links.find((a) => a.dataset.cat === id);
        if (on) on.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    $$(".sec").forEach((s) => io.observe(s));
  }

  // ---------------------------------------------------------------- events
  function wire() {
    const q = $("#q");
    let qt;
    q.addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { query = q.value; $("#qclr").hidden = !query; render(); }, 120); });
    $("#qclr").addEventListener("click", () => { q.value = ""; query = ""; $("#qclr").hidden = true; render(); q.focus(); });
    $("#vgrid").addEventListener("click", () => setView("grid"));
    $("#vlist").addEventListener("click", () => setView("list"));
    $("#cartbtn").addEventListener("click", openDrawer);
    $("#bb-open").addEventListener("click", openDrawer);
    $("#drawer-x").addEventListener("click", hideAll);
    $("#sheet-x").addEventListener("click", hideAll);
    $("#scrim").addEventListener("click", hideAll);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideAll(); });

    document.addEventListener("click", (e) => {
      const bt = e.target.closest("button[data-brand]");
      if (bt) { if (query) { query = ""; $("#q").value = ""; $("#qclr").hidden = true; } setBrand(bt.dataset.brand); return; }
      const t = e.target.closest("[data-add],[data-open],[data-inc],[data-dec],[data-rm],#send,#d-browse");
      if (!t) return;
      if (t.dataset.add !== undefined) { setQty(t.dataset.add, 1); return; }
      if (t.dataset.rm !== undefined) { setQty(t.dataset.rm, 0); return; }
      if (t.dataset.inc !== undefined || t.dataset.dec !== undefined) {
        const step = t.closest("[data-step]"), id = step.dataset.step, cur = cart[id] || 0;
        setQty(id, cur + (t.dataset.inc !== undefined ? 1 : -1));
        return;
      }
      if (t.dataset.open !== undefined) { if (!$("#drawer").classList.contains("show")) openSheet(t.dataset.open); return; }
      if (t.id === "send") { send(); return; }
      if (t.id === "d-browse") { hideAll(); return; }
      if (t.id === "d-retry") { e.preventDefault(); t.textContent = "Sending…"; flushOutbox().then(() => { if (lsGet(LS_OUTBOX, []).length) t.textContent = "Still no signal, try again"; }); return; }
    });

    document.addEventListener("change", (e) => {
      const inp = e.target;
      if (inp.matches("[data-step] input")) setQty(inp.closest("[data-step]").dataset.step, inp.value);
      else if (inp.matches("input[data-qty]")) setQty(inp.dataset.qty, inp.value, { quiet: true });
    });
    document.addEventListener("input", (e) => {
      const inp = e.target;
      if (inp.matches("input[data-qty]")) { const n = Math.floor(Number(inp.value) || 0); inp.classList.toggle("has", n > 0); if (n !== (cart[inp.dataset.qty] || 0)) setQty(inp.dataset.qty, n, { quiet: true }); }
      else if (inp.matches("[data-f]")) { form[inp.dataset.f] = inp.value; lsSet(LS_FORM, form); inp.classList.remove("bad"); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("input[data-qty]")) { e.preventDefault(); const rows = $$("input[data-qty]"); const k = rows.indexOf(e.target); if (rows[k + 1]) rows[k + 1].focus(); else e.target.blur(); }
    });
  }

  function setView(v) {
    view = v; lsSet(LS_VIEW, v);
    $("#vgrid").setAttribute("aria-pressed", v === "grid");
    $("#vlist").setAttribute("aria-pressed", v === "list");
    render();
  }
})();
