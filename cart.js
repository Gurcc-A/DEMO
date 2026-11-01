// Bee Tasty Story — кошик і замовлення (без бекенду, демо-режим)
// Підключається на всіх сторінках. Сам знаходить картки меню на menu.html.

const CONFIG = {
  currency: "₴",
  // Способи доставки: fee — вартість, freeFrom — безкоштовно від суми
  delivery: [
    { id: "pickup",  label: "Самовивіз",            desc: "Безкоштовно. Адреси — на сторінці «Локації»", fee: 0 },
    { id: "courier", label: "Курʼєр по місту",      desc: "60 ₴, безкоштовно від 500 ₴", fee: 60, freeFrom: 500 },
    { id: "np",      label: "Нова Пошта (відділення)", desc: "Вартість за тарифом перевізника, платить отримувач", fee: 0 },
  ],
  // Способи оплати: allowed — для яких видів доставки доступні
  payments: [
    { id: "cash",     label: "Готівкою при отриманні",            desc: "Курʼєру або на касі", allowed: ["pickup", "courier"] },
    { id: "terminal", label: "Карткою або телефоном (NFC) при отриманні", desc: "Apple Pay / Google Pay на терміналі", allowed: ["pickup", "courier"] },
    { id: "cod",      label: "Післяплата (Нова Пошта)",           desc: "Оплата у відділенні при отриманні", allowed: ["np"] },
    { id: "online",   label: "Карткою онлайн",                    desc: "Visa / Mastercard, Apple Pay, Google Pay", allowed: ["pickup", "courier", "np"] },
  ],
  minOrder: 0,              // мінімальна сума замовлення
  sizeLabels: ["Мала", "Велика"], // для цін виду "70 / 85"
  // Адреса твого Cloudflare Worker (він пересилає замовлення в Telegram).
  // Приклад: "https://orders.твійнік.workers.dev"
  orderUrl: "https://orders.gurrcc.workers.dev",
};

(function () {
  "use strict";

  const KEY = "bts_cart";
  const fmt = (n) => n + " " + CONFIG.currency;
  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- стан ---------- */
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { cart = []; }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
    render();
  }

  function add(name, size, price) {
    const id = name + "|" + size;
    const it = cart.find((i) => i.id === id);
    if (it) it.qty++; else cart.push({ id, name, size, price, qty: 1 });
    save();
    pulse();
  }

  function changeQty(id, d) {
    const it = cart.find((i) => i.id === id);
    if (!it) return;
    it.qty += d;
    if (it.qty <= 0) cart = cart.filter((i) => i.id !== id);
    save();
  }

  const subtotal = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = () => cart.reduce((s, i) => s + i.qty, 0);
  const deliveryCost = (id, sum) => {
    const d = CONFIG.delivery.find((x) => x.id === id);
    if (!d || sum === 0) return 0;
    return d.freeFrom && sum >= d.freeFrom ? 0 : d.fee;
  };

  /* ---------- кнопки «У кошик» на картках меню ---------- */
  function enhanceMenu() {
    document.querySelectorAll(".menu-group article").forEach((card) => {
      if (card.dataset.cart) return;
      card.dataset.cart = "1";
      const name = $("h3", card).textContent.trim();
      const priceEl = card.querySelector("p:last-of-type");
      const nums = (priceEl.textContent.match(/\d+/g) || []).map(Number);

      const box = document.createElement("div");
      box.className = "buy";

      if (!nums.length) {
        const b = document.createElement("button");
        b.className = "buy-btn"; b.disabled = true; b.textContent = "Ціну уточнюйте";
        box.append(b);
        card.append(box);
        return;
      }

      let chosen = 0;
      if (nums.length > 1) {
        const sizes = document.createElement("div");
        sizes.className = "sizes";
        nums.forEach((p, i) => {
          const lab = document.createElement("label");
          const r = document.createElement("input");
          r.type = "radio"; r.name = "size-" + name; r.checked = i === 0;
          r.addEventListener("change", () => { chosen = i; btn.textContent = "У кошик · " + fmt(p); });
          const sp = document.createElement("span");
          sp.textContent = (CONFIG.sizeLabels[i] || "Розмір " + (i + 1)) + " " + p;
          lab.append(r, sp);
          sizes.append(lab);
        });
        box.append(sizes);
      }

      const btn = document.createElement("button");
      btn.className = "buy-btn";
      btn.textContent = "У кошик · " + fmt(nums[0]);
      btn.addEventListener("click", () => {
        const label = nums.length > 1 ? (CONFIG.sizeLabels[chosen] || "") : "";
        add(name, label, nums[chosen]);
      });
      box.append(btn);
      card.append(box);
    });
  }

  /* ---------- інтерфейс: кнопка в шапці + панель ---------- */
  let badge, drawer, body, totals;

  function build() {
    const inner = $(".header-inner");
    const openBtn = document.createElement("button");
    openBtn.className = "cart-open";
    openBtn.setAttribute("aria-label", "Відкрити кошик");
    openBtn.innerHTML = '🛒 <span class="cart-badge">0</span>';
    (inner || document.body).append(openBtn);
    badge = $(".cart-badge", openBtn);
    openBtn.addEventListener("click", openDrawer);

    drawer = document.createElement("div");
    drawer.className = "cart-overlay";
    drawer.hidden = true;
    drawer.innerHTML = `
      <aside class="cart-panel" role="dialog" aria-modal="true" aria-label="Кошик">
        <div class="cart-head">
          <h2>Кошик</h2>
          <button class="cart-close" aria-label="Закрити">✕</button>
        </div>
        <div class="cart-body"></div>
      </aside>`;
    document.body.append(drawer);
    body = $(".cart-body", drawer);
    drawer.addEventListener("click", (e) => { if (e.target === drawer) closeDrawer(); });
    $(".cart-close", drawer).addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });
  }

  function openDrawer() { view = "cart"; drawer.hidden = false; document.body.style.overflow = "hidden"; render(); }
  function closeDrawer() { drawer.hidden = true; document.body.style.overflow = ""; }
  function pulse() { badge.classList.remove("pop"); void badge.offsetWidth; badge.classList.add("pop"); }

  let view = "cart"; // cart | checkout | done
  let lastOrder = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    badge.textContent = count();
    badge.hidden = count() === 0;
    if (drawer.hidden) return;
    body.replaceChildren();
    if (view === "cart") renderCart();
    else if (view === "checkout") renderCheckout();
    else renderDone();
  }

  function renderCart() {
    if (!cart.length) {
      body.append(el("p", "cart-empty", "Кошик порожній. Додайте щось смачне з меню."));
      const a = el("a", "buy-btn", "Перейти до меню"); a.href = "menu.html";
      body.append(a);
      return;
    }
    const list = el("ul", "cart-list");
    cart.forEach((i) => {
      const li = el("li", "cart-item");
      const info = el("div", "ci-info");
      info.append(el("strong", "", i.name));
      if (i.size) info.append(el("small", "", i.size));
      info.append(el("span", "", fmt(i.price)));
      const qty = el("div", "ci-qty");
      const minus = el("button", "", "−"); minus.setAttribute("aria-label", "Менше");
      const plus = el("button", "", "+"); plus.setAttribute("aria-label", "Більше");
      minus.onclick = () => changeQty(i.id, -1);
      plus.onclick = () => changeQty(i.id, 1);
      qty.append(minus, el("b", "", String(i.qty)), plus);
      li.append(info, qty, el("div", "ci-sum", fmt(i.price * i.qty)));
      list.append(li);
    });
    body.append(list);
    const sum = subtotal();
    const row = el("div", "cart-total");
    row.append(el("span", "", "Разом"), el("b", "", fmt(sum)));
    body.append(row);
    const go = el("button", "buy-btn", "Оформити замовлення");
    if (sum < CONFIG.minOrder) {
      go.disabled = true;
      go.textContent = "Мінімальне замовлення " + fmt(CONFIG.minOrder);
    }
    go.onclick = () => { view = "checkout"; render(); };
    body.append(go);
    const clear = el("button", "link-btn", "Очистити кошик");
    clear.onclick = () => { cart = []; save(); };
    body.append(clear);
  }

  const api = (p) => (CONFIG.orderUrl ? fetch(CONFIG.orderUrl + p).then((r) => r.json()) : Promise.resolve([]));

  // Поле з випадаючим списком підказок (місто / відділення)
  function combo(o) {
    const wrap = el("div", "combo");
    const lab = el("label", "", o.label);
    const inp = document.createElement("input");
    inp.placeholder = o.placeholder; inp.autocomplete = "off";
    inp.value = o.value || ""; inp.disabled = !!o.disabled;
    lab.append(inp);
    const list = el("ul", "combo-list"); list.hidden = true;
    wrap.append(lab, list);
    let timer, seq = 0;
    async function search() {
      const q = inp.value.trim();
      if (q.length < o.min) { list.hidden = true; return; }
      const my = ++seq;
      list.replaceChildren(el("li", "combo-msg", "Шукаємо…")); list.hidden = false;
      let items = [];
      try { items = await o.fetch(q); } catch (e) {}
      if (my !== seq) return;
      list.replaceChildren();
      if (!items.length) { list.append(el("li", "combo-msg", "Нічого не знайдено")); return; }
      items.forEach((it) => {
        const li = el("li", "", it.name);
        li.addEventListener("mousedown", (ev) => { ev.preventDefault(); inp.value = it.name; list.hidden = true; o.pick(it); });
        list.append(li);
      });
    }
    inp.addEventListener("input", () => { o.edit(); clearTimeout(timer); timer = setTimeout(search, 300); });
    inp.addEventListener("focus", () => { if (inp.value.trim().length >= o.min) search(); });
    inp.addEventListener("blur", () => { list.hidden = true; });
    return wrap;
  }

  function renderCheckout() {
    const f = document.createElement("form");
    f.className = "co-form";
    f.noValidate = true;
    f.innerHTML = `
      <button type="button" class="link-btn back">← Назад до кошика</button>
      <label>Ім'я <input name="name" autocomplete="name"></label>
      <label>Телефон <input name="phone" type="tel" autocomplete="tel" placeholder="+380..."></label>
      <h3 class="co-h">1. Доставка</h3>
      <div class="opts" data-g="method"></div>
      <div class="dl-fields"></div>
      <label>Коли потрібно <input name="when" type="datetime-local"></label>
      <h3 class="co-h">2. Оплата</h3>
      <div class="opts" data-g="pay"></div>
      <label>Коментар <textarea name="comment" rows="2"></textarea></label>
      <div class="co-summary"></div>
      <p class="co-error" role="alert"></p>
      <button class="buy-btn" type="submit">Підтвердити замовлення</button>`;
    body.append(f);

    const st = { method: CONFIG.delivery[0].id, pay: null, npCity: "", npRef: null, npBranch: "" };
    const mBox = $('[data-g=method]', f), pBox = $('[data-g=pay]', f);
    const fields = $(".dl-fields", f), sum = $(".co-summary", f), err = $(".co-error", f);

    function opt(group, o, checked) {
      const l = el("label", "opt" + (o.disabled ? " off" : ""));
      const r = document.createElement("input");
      r.type = "radio"; r.name = group; r.value = o.id; r.checked = checked; r.disabled = !!o.disabled;
      const t = el("span", "opt-t"); t.append(el("strong", "", o.label), el("small", "", o.desc || ""));
      l.append(r, t);
      return l;
    }

    function draw() {
      mBox.replaceChildren(...CONFIG.delivery.map((o) => opt("method", o, o.id === st.method)));
      const list = CONFIG.payments.filter((p) => p.allowed.includes(st.method));
      if (!list.some((p) => p.id === st.pay && !p.disabled)) st.pay = (list.find((p) => !p.disabled) || {}).id;
      pBox.replaceChildren(...list.map((o) => opt("pay", o, o.id === st.pay)));
      // поля залежно від доставки
      const keep = Object.fromEntries(new FormData(f));
      fields.replaceChildren();
      if (st.method === "courier") {
        fields.innerHTML = '<label>Адреса доставки <input name="address" autocomplete="street-address" placeholder="Вулиця, будинок, квартира"></label>';
      } else if (st.method === "np") {
        const cityBox = combo({
          label: "Населений пункт", placeholder: "Почніть вводити назву (від 3 літер)", min: 3, value: st.npCity,
          fetch: (q) => api("/np/cities?q=" + encodeURIComponent(q)),
          pick: (it) => { st.npCity = it.name; st.npRef = it.ref; st.npBranch = ""; draw(); setTimeout(() => { const x = fields.querySelectorAll("input")[1]; if (x) x.focus(); }, 0); },
          edit: () => { st.npCity = ""; st.npRef = null; st.npBranch = ""; const x = fields.querySelectorAll("input")[1]; if (x) { x.value = ""; x.disabled = true; } },
        });
        const brBox = combo({
          label: "Відділення або поштомат", placeholder: st.npRef ? "Номер або адреса відділення" : "Спочатку оберіть населений пункт", min: 0, value: st.npBranch, disabled: !st.npRef,
          fetch: (q) => api("/np/warehouses?city=" + st.npRef + "&q=" + encodeURIComponent(q)),
          pick: (it) => { st.npBranch = it.name; },
          edit: () => { st.npBranch = ""; },
        });
        fields.append(cityBox, brBox);
      }
      summary();
    }

    function summary() {
      const s = subtotal(), d = deliveryCost(st.method, s);
      sum.replaceChildren();
      const dText = st.method === "pickup" ? "—" : st.method === "np" ? "за тарифом НП" : d ? fmt(d) : "безкоштовно";
      [["Товари", fmt(s)], ["Доставка", dText]].forEach(([a, b]) => {
        const r = el("div", "sum-row"); r.append(el("span", "", a), el("span", "", b)); sum.append(r);
      });
      const t = el("div", "sum-row total"); t.append(el("span", "", "До сплати"), el("b", "", fmt(s + d))); sum.append(t);
    }

    f.addEventListener("change", (e) => {
      if (e.target.name === "method") { st.method = e.target.value; draw(); }
      if (e.target.name === "pay") st.pay = e.target.value;
    });
    draw();
    $(".back", f).onclick = () => { view = "cart"; render(); };

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const data = Object.fromEntries(new FormData(f));
      const digits = (data.phone || "").replace(/\D/g, "");
      if (!data.name.trim()) return (err.textContent = "Вкажіть ім'я.");
      if (digits.length < 10) return (err.textContent = "Вкажіть коректний номер телефону.");
      if (st.method === "courier" && !(data.address || "").trim()) return (err.textContent = "Вкажіть адресу доставки.");
      if (st.method === "np" && !(st.npRef && st.npBranch))
        return (err.textContent = "Оберіть населений пункт і відділення зі списку.");
      if (!st.pay) return (err.textContent = "Оберіть спосіб оплати.");

      const s = subtotal(), d = deliveryCost(st.method, s);
      const order = {
        id: "BTS-" + Date.now().toString().slice(-6),
        createdAt: new Date().toISOString(),
        name: data.name.trim(), phone: data.phone.trim(),
        method: st.method, address: (data.address || "").trim(),
        npCity: st.npCity, npBranch: st.npBranch,
        when: data.when, pay: st.pay, comment: data.comment.trim(),
        items: cart.map((i) => ({ name: i.name, size: i.size, qty: i.qty, price: i.price })),
        subtotal: s, delivery: d, total: s + d,
      };
      const btn = $("button[type=submit]", f);
      btn.disabled = true; btn.textContent = "Надсилаємо…";
      try {
        await sendOrder(order);
      } catch (ex) {
        btn.disabled = false; btn.textContent = "Підтвердити замовлення";
        err.textContent = "Не вдалося надіслати замовлення. Спробуйте ще раз або зателефонуйте нам.";
        return;
      }
      if (order.payUrl) {
        cart = [];
        try { localStorage.setItem(KEY, "[]"); } catch (e) {}
        location.href = order.payUrl; // перехід на сторінку оплати
        return;
      }
      lastOrder = order; cart = []; view = "done"; save();
    });
  }

  function orderText(o) {
    const dl = CONFIG.delivery.find((x) => x.id === o.method);
    const pl = CONFIG.payments.find((x) => x.id === o.pay);
    const lines = o.items.map((i) => `• ${i.name}${i.size ? " (" + i.size + ")" : ""} × ${i.qty} = ${i.price * i.qty} ${CONFIG.currency}`);
    return [
      `Нове замовлення ${o.id}`,
      `${o.name}, ${o.phone}`,
      `Доставка: ${dl ? dl.label : o.method}`,
      o.method === "courier" ? `Адреса: ${o.address}` : "",
      o.method === "np" ? `НП: ${o.npCity}, ${o.npBranch}` : "",
      o.when ? `Коли: ${o.when.replace("T", " ")}` : "",
      "", ...lines, "",
      `Товари: ${o.subtotal} ${CONFIG.currency}`,
      o.method === "courier" ? `Доставка: ${o.delivery} ${CONFIG.currency}` : "",
      `Разом: ${o.total} ${CONFIG.currency}`,
      `Оплата: ${pl ? pl.label : o.pay}`,
      o.comment ? `Коментар: ${o.comment}` : "",
    ].filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i)).join("\n");
  }

  async function sendOrder(o) {
    // 1) Зберігаємо в браузері (для демо / історії)
    try {
      const all = JSON.parse(localStorage.getItem("bts_orders") || "[]");
      all.push(o); localStorage.setItem("bts_orders", JSON.stringify(all));
    } catch (e) {}
    // 2) Надсилаємо на Worker, який пересилає власнику в Telegram
    if (CONFIG.orderUrl && o.pay === "online") {
      const r = await fetch(CONFIG.orderUrl + "/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, name: o.name, phone: o.phone, items: o.items, delivery: o.delivery, text: orderText(o) }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error("pay " + r.status);
      o.payUrl = d.url;
      return;
    }
    if (CONFIG.orderUrl) {
      const r = await fetch(CONFIG.orderUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: orderText(o) }),
      });
      if (!r.ok) throw new Error("worker " + r.status);
    }
  }

  function renderDone() {
    const o = lastOrder;
    body.append(el("h3", "done-title", "Дякуємо! Замовлення прийнято ✅"));
    body.append(el("p", "", "Номер замовлення: " + o.id + ". Ми зателефонуємо за номером " + o.phone + ", щоб підтвердити."));
    const pre = el("pre", "done-pre", orderText(o));
    body.append(pre);
    if (!CONFIG.orderUrl) {
      body.append(el("small", "", "Демо-режим: замовлення збережено лише в цьому браузері."));
    }
    const b = el("button", "buy-btn", "Закрити");
    b.onclick = closeDrawer;
    body.append(b);
  }

  /* ---------- старт ---------- */
  function init() {
    build();
    enhanceMenu();
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
