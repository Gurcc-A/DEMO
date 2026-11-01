// Cloudflare Worker: зберігає меню в KV. Привʼязка KV: MENU, секрет: ADMIN_PASSWORD.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PUT,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type", "Access-Control-Max-Age": "86400" };
const JSONH = { "Content-Type": "application/json; charset=utf-8", ...CORS };
const reply = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: JSONH });
const str = (v, n = 200) => String(v ?? "").trim().slice(0, n);
const slug = (v, f) => str(v, 40).replace(/[^\w-]/g, "") || f;

async function authed(req, env) {
  const got = new TextEncoder().encode((req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
  const want = new TextEncoder().encode(env.ADMIN_PASSWORD || "");
  return want.length > 0 && got.length === want.length && crypto.subtle.timingSafeEqual(got, want);
}

function clean(d) {
  if (!d || !Array.isArray(d.categories)) throw new Error("Невірний формат меню");
  const categories = d.categories.slice(0, 20).map((c, i) => ({
    id: slug(c.id, "c" + i), name: str(c.name), name_en: str(c.name_en), badge: str(c.badge), badge_en: str(c.badge_en),
    style: c.style === "autumn" ? "autumn" : "",
    items: (Array.isArray(c.items) ? c.items : []).slice(0, 100).map((x, j) => {
      const it = { id: slug(x.id, "i" + j), name: str(x.name), name_en: str(x.name_en), desc: str(x.desc, 300), desc_en: str(x.desc_en, 300),
        price: str(x.price, 30), tag: str(x.tag, 40), tag_en: str(x.tag_en, 40), hidden: !!x.hidden };
      if (!it.name) throw new Error("У позиції немає назви");
      if (!/^[\d\s\/.,]*$/.test(it.price)) throw new Error("Ціна «" + it.price + "»: лише цифри та «/»");
      return it;
    }),
  }));
  return { version: 1, updated: new Date().toISOString(), categories };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (new URL(req.url).pathname !== "/menu") return reply({ error: "not found" }, 404);
    if (req.method === "GET") {
      const v = await env.MENU.get("menu");
      return v ? new Response(v, { headers: { ...JSONH, "Cache-Control": "public, max-age=30" } }) : reply({ error: "empty" }, 404);
    }
    if (req.method === "PUT") {
      if (!(await authed(req, env))) return reply({ error: "unauthorized" }, 401);
      const text = await req.text();
      if (text.length > 200000) return reply({ error: "Забагато даних" }, 413);
      try { await env.MENU.put("menu", JSON.stringify(clean(JSON.parse(text)))); } catch (e) { return reply({ error: e.message }, 400); }
      return reply({ ok: true });
    }
    return reply({ error: "method not allowed" }, 405);
  },
};
