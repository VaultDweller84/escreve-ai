// api/generate.js
// Proxy seguro para a Groq API.
// A chave GROQ_API_KEY existe APENAS aqui (servidor) — nunca no cliente.

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL        = "llama-3.3-70b-versatile";
const MAX_TOKENS   = 1024;

// Origens permitidas — adiciona o teu domínio quando tiveres um
const ALLOWED_ORIGINS = [
  "https://escreve-ai.vercel.app",
  "http://localhost:5173",   // dev local
  "http://localhost:4173",   // preview local
];

export default async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────────────────────
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ── Método ────────────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  // ── Validação do body ─────────────────────────────────────────────────────
  const { messages, temperature } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Body inválido: 'messages' é obrigatório." });
  }

  // Temperatura entre 0 e 1 (default 0.6)
  const temp = typeof temperature === "number"
    ? Math.min(1, Math.max(0, temperature))
    : 0.6;

  // ── Chave da API ──────────────────────────────────────────────────────────
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[generate] GROQ_API_KEY não configurada no ambiente.");
    return res.status(500).json({ error: "Configuração do servidor em falta." });
  }

  // ── Chamada à Groq ────────────────────────────────────────────────────────
  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        messages,
        temperature: temp,
        max_tokens:  MAX_TOKENS,
      }),
    });

    // Erros conhecidos da Groq
    if (!groqRes.ok) {
      const errBody = await groqRes.json().catch(() => ({}));

      if (groqRes.status === 429) {
        return res.status(429).json({ error: "Limite de pedidos atingido. Tenta novamente em breve." });
      }
      if (groqRes.status === 503) {
        return res.status(503).json({ error: "Serviço temporariamente indisponível." });
      }

      console.error("[generate] Groq error:", groqRes.status, errBody);
      return res.status(groqRes.status).json({
        error: errBody?.error?.message || "Erro na API de geração de texto.",
      });
    }

    const data = await groqRes.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("[generate] Erro inesperado:", err);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
}
