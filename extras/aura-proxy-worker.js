// RemindPay — proxy de Aura para iPhone/PWA (Cloudflare Worker, gratis).
//
// Por qué existe: OpenCode Go/Zen no envía cabeceras CORS, así que Safari no
// deja llamar directo desde la PWA. Este Worker reenvía al endpoint con tu
// clave (guardada como secreto en Cloudflare, nunca en el teléfono).
//
// Despliegue (5 min, $0):
//   1. Entra a dash.cloudflare.com → Workers & Pages → Create → Worker.
//   2. Pega este archivo completo como worker.
//   3. Settings → Variables → añade secretos:
//        GO_KEY = tu clave de opencode.ai/auth
//        PROXY_TOKEN = inventa un token largo (ej. 32 caracteres)
//      (Opcional) GO_URL si usas Zen u otro base; por defecto Go.
//   4. Deploy. Tu URL proxy será:
//        https://<tu-worker>.workers.dev/<PROXY_TOKEN>
//   5. En RemindPay iPhone → Configuración → OpenCode Go/Zen → Proxy:
//      pega esa URL + el modelo (ej. mimo-v2.5) → Probar conexión.
//
// La app de PC sigue hablando directo (sin proxy). Aquí solo pasan los
// textos del chat; tus finanzas quedan en el dispositivo.

const GO_DEFAULT = "https://opencode.ai/zen/go/v1";

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-opencode-session",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const token = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!env.PROXY_TOKEN || token !== env.PROXY_TOKEN) {
      return new Response("no autorizado", { status: 401, headers: cors });
    }
    if (req.method === "GET") {
      return new Response("RemindPay proxy OK", { headers: cors });
    }
    if (req.method !== "POST") {
      return new Response("solo POST", { status: 405, headers: cors });
    }
    let body;
    try {
      body = await req.text();
      JSON.parse(body);
    } catch {
      return new Response("JSON inválido", { status: 400, headers: cors });
    }
    const base = (env.GO_URL || GO_DEFAULT).replace(/\/+$/, "");
    const session = req.headers.get("x-opencode-session") || "remindpay-pwa";
    let up;
    try {
      up = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.GO_KEY || ""}`,
          "User-Agent": "RemindPay",
          "x-opencode-session": session,
        },
        body,
      });
    } catch (e) {
      return new Response(`no se pudo contactar Go: ${e}`, {
        status: 502,
        headers: cors,
      });
    }
    const texto = await up.text();
    return new Response(texto, {
      status: up.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
