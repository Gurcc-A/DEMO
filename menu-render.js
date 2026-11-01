/* Малює меню з Worker-а або menu.json. Статичний HTML у menu.html лишається запасним. */
(function () {
  "use strict";
  var chips = document.getElementById("category-chips");
  if (!chips) return;
  var EN = document.documentElement.lang === "en";
  var S = {
    chip: "font-weight:800;font-size:16px;padding:10px 22px;min-height:44px;border-radius:999px;border:2px solid #17140F",
    h2: "font-family:'Unbounded',sans-serif;font-weight:700;font-size:28px;line-height:1.15;margin:",
    grid: "display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px",
    h3: "margin:0;font-family:'Unbounded',sans-serif;font-weight:700;font-size:19px;line-height:1.2",
    desc: "margin:0;font-size:16px;line-height:1.5;color:#5B5340;flex:1",
    price: "margin:6px 0 0;font-family:'Unbounded',sans-serif;font-weight:500;font-size:20px",
    tag: "font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;"
  };
  function h(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  function L(o, k) { return (EN && o[k + "_en"]) || o[k] || ""; }

  function card(it, auto) {
    var a = h("article", "background:#FFFFFF;color:#17140F;border:3px solid " + (auto ? "#B7CC6A" : "#17140F") + ";border-radius:22px;padding:22px;display:flex;flex-direction:column;gap:10px");
    var tags = h("div", "display:flex;flex-wrap:wrap;gap:8px;min-height:24px"), t = L(it, "tag");
    if (t) tags.append(h("span", S.tag + (auto ? "background:#B7CC6A;color:#17140F;padding:4px 12px" : "border:2px dashed #8A7D5A;color:#5B5340;padding:2px 10px"), t));
    var n = h("h3", S.h3, L(it, "name"));
    n.dataset.uk = it.name; /* кошик і Telegram завжди отримують українську назву */
    a.append(tags, n, h("p", S.desc, L(it, "desc")), h("p", S.price, it.price ? it.price + " ₴" : ""));
    return a;
  }

  function setCat(cat) {
    chips.querySelectorAll(".chip-btn").forEach(function (b) {
      var on = b.dataset.cat === cat;
      b.classList.toggle("active", on);
      b.style.background = on ? "#17140F" : "transparent";
      b.style.color = on ? "#FFC21A" : "#17140F";
    });
    document.querySelectorAll(".menu-group").forEach(function (g) {
      g.style.display = cat === "all" || g.dataset.cat === cat ? "block" : "none";
    });
  }

  function render(d) {
    var cats = (d.categories || []).map(function (c) {
      return { c: c, items: (c.items || []).filter(function (i) { return !i.hidden; }) };
    }).filter(function (x) { return x.items.length; });
    if (!cats.length) return;
    var root = chips.parentNode;
    root.querySelectorAll(".menu-group").forEach(function (n) { n.remove(); });
    chips.replaceChildren();
    function chip(id, label) {
      var b = h("button", S.chip, label);
      b.className = "chip-btn"; b.dataset.cat = id;
      b.addEventListener("click", function () { setCat(id); });
      chips.append(b);
    }
    chip("all", EN ? "All" : "Усе");
    cats.forEach(function (x) { chip(x.c.id, L(x.c, "name")); });
    cats.forEach(function (x) {
      var auto = x.c.style === "autumn";
      var sec = h("section", "margin-bottom:48px");
      sec.className = "menu-group"; sec.dataset.cat = x.c.id;
      var box = h("div", auto ? "background:#2A1B10;color:#FFF6DC;border-radius:28px;padding:28px" : "");
      if (auto) {
        var head = h("div", "display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:20px");
        head.append(h("h2", S.h2 + "0", L(x.c, "name")));
        var bd = L(x.c, "badge");
        if (bd) head.append(h("span", S.tag + "background:#B7CC6A;color:#17140F;padding:5px 12px", bd));
        box.append(head);
      } else box.append(h("h2", S.h2 + "0 0 20px", L(x.c, "name")));
      var g = h("div", S.grid);
      x.items.forEach(function (i) { g.append(card(i, auto)); });
      box.append(g); sec.append(box); root.append(sec);
    });
    var q = new URLSearchParams(location.search).get("cat");
    setCat(cats.some(function (x) { return x.c.id === q; }) ? q : "all");
    if (window.BTS_enhanceMenu) window.BTS_enhanceMenu();
  }

  function get(u) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 4000);
    return fetch(u, { signal: c.signal }).then(function (r) { clearTimeout(t); if (!r.ok) throw 0; return r.json(); });
  }
  (window.MENU_URL ? get(window.MENU_URL) : Promise.reject()).catch(function () { return get("menu.json"); }).then(render).catch(function () {});
})();
