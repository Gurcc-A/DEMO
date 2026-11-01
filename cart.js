// Bee Tasty Story — кошик і замовлення (без бекенду, демо-режим)
// Підключається на всіх сторінках. Сам знаходить картки меню на menu.html.

const CONFIG = {
  currency: "₴",
  deliveryFee: 60,          // вартість доставки
  freeDeliveryFrom: 500,    // безкоштовно від цієї суми
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
  const deliveryCost = (method, sum) =>
    method !== "delivery" || sum === 0 || sum >= CONFIG.freeDeliveryFrom ? 0 : CONFIG.deliveryFee;

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

  function renderCheckout() {
    const f = document.createElement("form");
    f.className = "co-form";
    f.noValidate = true;
    f.innerHTML = `
      <button type="button" class="link-btn back">← Назад до кошика</button>
      <label>Ім'я <input name="name" autocomplete="name" required></label>
      <label>Телефон <input name="phone" type="tel" autocomplete="tel" placeholder="+380..." required></label>
      <fieldset>
        <legend>Отримання</legend>
        <label class="radio"><input type="radio" name="method" value="pickup" checked> Самовивіз</label>
        <label class="radio"><input type="radio" name="method" value="delivery"> Доставка</label>
      </fieldset>
      <label class="addr" hidden>Адреса доставки <input name="address" autocomplete="street-address"></label>
      <label>Коли потрібно <input name="when" type="datetime-local"></label>
      <fieldset>
        <legend>Оплата</legend>
        <label class="radio"><input type="radio" name="pay" value="cash" checked> При отриманні</label>
        <label class="radio"><input type="radio" name="pay" value="online" disabled> Онлайн (скоро)</label>
      </fieldset>
      <label>Коментар <textarea name="comment" rows="2"></textarea></label>
      <div class="co-summary"></div>
      <p class="co-error" role="alert"></p>
      <button class="buy-btn" type="submit">Підтвердити замовлення</button>`;
    body.append(f);

    const addr = $(".addr", f), sum = $(".co-summary", f), err = $(".co-error", f);
    const method = () => f.method.value;

    function updateSummary() {
      const s = subtotal(), d = deliveryCost(method(), s);
      sum.replaceChildren();
      [["Товари", fmt(s)], ["Доставка", method() === "delivery" ? (d ? fmt(d) : "безкоштовно") : "—"]]
        .forEach(([a, b]) => { const r = el("div", "sum-row"); r.append(el("span", "", a), el("span", "", b)); sum.append(r); });
      const t = el("div", "sum-row total"); t.append(el("span", "", "До сплати"), el("b", "", fmt(s + d))); sum.append(t);
      if (method() === "delivery" && d) sum.append(el("small", "", "Безкоштовна доставка від " + fmt(CONFIG.freeDeliveryFrom)));
    }
    f.querySelectorAll('input[name="method"]').forEach((r) => r.addEventListener("change", () => {
      addr.hidden = method() !== "delivery";
      updateSummary();
    }));
    updateSummary();
    $(".back", f).onclick = () => { view = "cart"; render(); };

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const data = Object.fromEntries(new FormData(f));
      const digits = (data.phone || "").replace(/\D/g, "");
      if (!data.name.trim()) return (err.textContent = "Вкажіть ім'я.");
      if (digits.length < 10) return (err.textContent = "Вкажіть коректний номер телефону.");
      if (data.method === "delivery" && !data.address.trim()) return (err.textContent = "Вкажіть адресу доставки.");

      const s = subtotal(), d = deliveryCost(data.method, s);
      const order = {
        id: "BTS-" + Date.now().toString().slice(-6),
        createdAt: new Date().toISOString(),
        name: data.name.trim(), phone: data.phone.trim(),
        method: data.method, address: (data.address || "").trim(),
        when: data.when, pay: data.pay, comment: data.comment.trim(),
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
      lastOrder = order; cart = []; view = "done"; save();
    });
  }

  function orderText(o) {
    const lines = o.items.map((i) => `• ${i.name}${i.size ? " (" + i.size + ")" : ""} × ${i.qty} = ${i.price * i.qty} ${CONFIG.currency}`);
    return [
      `Нове замовлення ${o.id}`,
      `${o.name}, ${o.phone}`,
      o.method === "delivery" ? `Доставка: ${o.address}` : "Самовивіз",
      o.when ? `Коли: ${o.when.replace("T", " ")}` : "",
      "", ...lines, "",
      `Товари: ${o.subtotal} ${CONFIG.currency}`,
      o.method === "delivery" ? `Доставка: ${o.delivery} ${CONFIG.currency}` : "",
      `Разом: ${o.total} ${CONFIG.currency}`,
      `Оплата: ${o.pay === "cash" ? "при отриманні" : "онлайн"}`,
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
