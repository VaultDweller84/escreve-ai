import { useState, useRef, useEffect } from "react";

const GUMROAD_PRODUCT_ID   = "avxvef";
const GUMROAD_CHECKOUT_URL = "https://hugompa.gumroad.com/l/avxvef?wanted=true";
const FREE_LIMIT           = 50; // TESTES — mudar para 3 antes do lançamento

// Chip único de resposta
const REPLY_CHIP = { label: "↩ Responder", special: "reply" };

// ── Feature flags ────────────────────────────────────────────────────────────
// Muda para true para reactivar quando Claude API estiver activa e houver
// feedback dos testers a pedir controlo de tom
const SHOW_REGISTER_SLIDER = false;

// Detecção de contexto client-side (sem chamada API)
const detectContext = (text) => {
  const t = text.toLowerCase();
  if (!t || t.length < 5) return null;
  if (/e-?mail|correio|assunto:|para:|mensagem formal|escreve.*mail/.test(t))
    return { icon: "📧", label: "E-mail" };
  if (/post|instagram|linkedin|tiktok|redes sociais|publicar|legenda/.test(t))
    return { icon: "📱", label: "Post" };
  if (/bio|apresenta[çc]|sobre mim|perfil|quem sou/.test(t))
    return { icon: "👤", label: "Bio" };
  if (/mensagem|dizer|comunicar|avisar|informar|recusar|pedir desculp/.test(t))
    return { icon: "💬", label: "Mensagem" };
  if (/proposta|or[çc]amento|contrato|relat[oó]rio|documento/.test(t))
    return { icon: "📄", label: "Documento" };
  if (/resposta|responder|reply/.test(t))
    return { icon: "↩", label: "Resposta" };
  return null;
};

const canShare = typeof navigator !== "undefined" && !!navigator.share;

// TESTES: sem persistência — contador por sessão
// Antes do lançamento: reactivar localStorage e FREE_LIMIT = 3
const loadUsage = () => 0;
const loadIsPro = () => false;

const REGISTER_LEVELS = [
  { value: 0, label: "Descontraído", icon: "😊", desc: "Amigos e família", color: "#7ec8a0" },
  { value: 1, label: "Casual",       icon: "👋", desc: "Colegas e conhecidos", color: "#a0bfe0" },
  { value: 2, label: "Neutro",       icon: "◉",  desc: "Comunicação geral", color: "#c9a84c" },
  { value: 3, label: "Profissional", icon: "👔", desc: "Trabalho e clientes", color: "#d4956a" },
  { value: 4, label: "Formal",       icon: "🏛️", desc: "Documentos e instituições", color: "#c47eb5" },
];

function RegisterSlider({ register, setRegister }) {
  const reg = REGISTER_LEVELS[register];
  const pct = register * 25;
  const bg  = `linear-gradient(to right, ${reg.color} 0%, ${reg.color} ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`;

  // Fix mobile snap — round to nearest integer on touch end
  const handleChange = (e) => setRegister(Number(e.target.value));
  const handleTouchEnd = (e) => setRegister(Math.round(Number(e.target.value)));

  return (
    <div style={{ padding:"14px 0 6px", borderTop:"1px solid rgba(255,255,255,0.05)", marginTop:12 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
        <span style={{ fontSize:11,color:"#5a5852",letterSpacing:"0.8px",textTransform:"uppercase",fontWeight:600 }}>Registo</span>
        <span style={{ fontSize:13,fontWeight:700,color:reg.color,display:"flex",alignItems:"center",gap:5 }}>
          {reg.icon} {reg.label}
          <span style={{ fontSize:11,color:"#5a5852",fontWeight:400,display:"none" }} className="reg-desc">· {reg.desc}</span>
        </span>
      </div>
      <input
        type="range"
        className="reg-slider"
        min={0} max={4} step={1}
        value={register}
        onChange={handleChange}
        onTouchEnd={handleTouchEnd}
        style={{ "--thumb-color": reg.color, background: bg }}
      />
      <div className="reg-tick">
        {REGISTER_LEVELS.map((r,i) => (
          <span
            key={i}
            className={register === i ? "active" : ""}
            style={{ color: register === i ? r.color : "#3e3d3a", fontSize: register === i ? 18 : 14, transition:"all .2s" }}
            onClick={() => setRegister(i)}
          >{r.icon}</span>
        ))}
      </div>
    </div>
  );
}

export default function EscreveAI() {
  const [prompt,         setPrompt]         = useState("");
  const [result,         setResult]         = useState("");
  const [detectedType,   setDetectedType]   = useState("");
  const [loading,        setLoading]        = useState(false);
  const [copyState,      setCopyState]      = useState("idle");
  const [usageCount,     setUsageCount]     = useState(() => loadUsage());
  const [isPro,          setIsPro]          = useState(() => loadIsPro());
  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [upgradeReason,  setUpgradeReason]  = useState("voluntary"); // "voluntary" | "limit"
  const [showLicense,    setShowLicense]    = useState(false);
  const [licenseKey,     setLicenseKey]     = useState("");
  const [licenseError,   setLicenseError]   = useState("");
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [shareError,     setShareError]     = useState("");
  const [apiError,       setApiError]       = useState("");
  const [specialMode,    setSpecialMode]    = useState(null); // null | "reply"
  const [replyType,      setReplyType]      = useState("email"); // "email" | "comment"
  const [detectedCtx,    setDetectedCtx]    = useState(null); // context hint from typing
  const [register,       setRegister]       = useState(2); // 0=Descontraído 1=Casual 2=Neutro 3=Profissional 4=Formal
  const [originalText,   setOriginalText]   = useState("");   // email/comment being replied to
  const [retryCount,     setRetryCount]     = useState(0);
  const [retrying,       setRetrying]       = useState(false);
  const [promptError,    setPromptError]    = useState("");
  const isNewVersionRef  = useRef(false);
  const textareaRef = useRef(null);
  const resultRef   = useRef(null);

  const isEmail = detectedType.toLowerCase().includes("email") || detectedType.toLowerCase().includes("e-mail");
  const remaining = Math.max(0, FREE_LIMIT - usageCount);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [prompt]);

  // Detecção de contexto com debounce
  useEffect(() => {
    if (specialMode) { setDetectedCtx(null); return; }
    const timer = setTimeout(() => setDetectedCtx(detectContext(prompt)), 400);
    return () => clearTimeout(timer);
  }, [prompt, specialMode]);

  const applyChip = (chip) => {
    if (chip.special === "reply") {
      setSpecialMode("reply");
      setReplyType("email"); // default
      setOriginalText("");
      setPrompt("");
      setDetectedCtx(null);
    }
  };

  const cancelSpecialMode = () => {
    setSpecialMode(null);
    setReplyType("email");
    setOriginalText("");
    setPrompt("");
    setDetectedCtx(null);
  };

  // ── Robust copy with textarea fallback ──────────────────────────────
  const copyText = () => {
    const text = result;
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    setCopyState("copied");
    setTimeout(() => setCopyState("flash"), 100);
    setTimeout(() => setCopyState("idle"), 2000);
  };

  const fallbackCopy = (text) => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.focus();
    el.select();
    try { document.execCommand("copy"); } catch {}
    document.body.removeChild(el);
  };

  // ── Open in mail client ──────────────────────────────────────────────
  const openInMail = () => {
    const body = encodeURIComponent(result);
    // Use location.href for better sandbox compatibility
    const mailto = `mailto:?body=${body}`;
    const a = document.createElement("a");
    a.href = mailto;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Web Share API ────────────────────────────────────────────────────
  const shareText = async () => {
    try {
      await navigator.share({ text: result });
    } catch {
      // Fallback: copy to clipboard
      copyText();
      setShareError("Texto copiado — partilha manualmente.");
      setTimeout(() => setShareError(""), 3000);
    }
  };

  // ── Nova versão — uses latest prompt from ref ────────────────────────
  const promptRef = useRef(prompt);
  useEffect(() => { promptRef.current = prompt; }, [prompt]);

  const generateNewVersion = () => {
    if (!promptRef.current.trim()) return;
    isNewVersionRef.current = true;
    generate();
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    if (!isPro && usageCount >= FREE_LIMIT && !isNewVersionRef.current) { setUpgradeReason("limit"); setShowUpgrade(true); return; }
    // ── Validação inteligente do prompt ─────────────────────────────────
    setPromptError("");
    const p = prompt.trim();

    // Muito curto
    if (p.length < 15) {
      setPromptError("Descreve melhor a situação — precisamos de mais detalhe para gerar um texto útil.");
      return;
    }

    // Mensagem de teste óbvia
    const looksLikeTest = /^(teste|test|hello|ola|olá|oi|hi|abc|123|asd)[\s.!?]*$/i.test(p);
    if (looksLikeTest) {
      setPromptError("Parece uma mensagem de teste. Descreve o que realmente precisas de escrever!");
      return;
    }

    // ── Deteção de tipo ANTES da validação contextual ─────────────────
    const pLower = p.toLowerCase();
    const isPost   = pLower.includes("post") || pLower.includes("instagram") || pLower.includes("linkedin") || pLower.includes("tiktok") || pLower.includes("redes sociais");
    const isBio    = pLower.includes("bio") || pLower.includes("apresentação") || pLower.includes("sobre mim");
    const isEmail  = pLower.includes("email") || pLower.includes("e-mail") || pLower.includes("mensagem") || pLower.includes("correio");
    const hasSubject = p.length > 40 || /sobre\s+\w+|para\s+\w+|acerca\s+de|a\s+dizer|a\s+falar|tema:|assunto:/i.test(p);

    // Post vago — sem assunto definido
    if (isPost && !hasSubject) {
      setPromptError(
        "Para um post de Instagram/LinkedIn precisamos saber sobre o quê — o teu produto, uma dica do teu nicho, uma conquista? Acrescenta o assunto ao pedido."
      );
      return;
    }

    // Bio vaga — sem contexto profissional
    if (isBio && p.length < 35) {
      setPromptError(
        "Para escrever uma boa bio precisamos de contexto: o que fazes, para quem, há quanto tempo? Ex: 'Sou designer freelancer há 5 anos, ajudo marcas a comunicar melhor.'"
      );
      return;
    }

    // E-mail vago — sem contexto do que comunicar
    if (isEmail && !hasSubject && p.length < 40) {
      setPromptError(
        "Descreve melhor o e-mail: quem é o destinatário, qual o assunto e o que queres comunicar?"
      );
      return;
    }
    setLoading(true);
    setResult("");
    setDetectedType("");
    setShareError("");
    setApiError("");
    try {
      // ── Temperatura dinâmica ──────────────────────────────────────────
      const isCreative = isPost || isBio || pLower.includes("criativ") || pLower.includes("história");
      const isFormal   = isEmail || pLower.includes("proposta") || pLower.includes("contrato") || pLower.includes("relatório");
      const temperature = isCreative ? 0.9 : isFormal ? 0.3 : 0.6;

      // ── Exemplo de estilo por categoria (1 par, não 2) ────────────────
      const styleExample = isCreative
        ? `Exemplo de tom: em vez de "A nossa empresa tem o prazer de anunciar...", escreve "Trabalhámos dois anos nisto. Hoje podes experimentar."`
        : isFormal
        ? `Exemplo de tom: em vez de "Venho por este meio informar...", escreve "Estava a rever as faturas e reparei que..."`
        : `Exemplo de tom: em vez de "Lamento imenso não poder estar presente...", escreve "Chateou-me não conseguir estar."`;

      // ── System prompt simplificado — instruções positivas, menos proibições ──
      const reg = REGISTER_LEVELS[register];
      const systemPrompt = `És um copywriter experiente a escrever em português europeu (de Portugal, não do Brasil).

O teu trabalho: receber um pedido e entregar o texto final, pronto a usar.

Registo solicitado: ${reg.label} (${reg.desc})
Adapta TODA a linguagem, vocabulário e estrutura a este registo.

Estilo que usas:
- Linguagem natural, directa, como uma pessoa real escreveria
- Frases curtas. Parágrafos breves. Sem clichês corporativos.
- Em contexto informal usa "tu"; em formal usa "o senhor / a senhora"
- O texto sai sempre completo — sem espaços por preencher

${styleExample}

Regra única: entrega sempre o texto. Nunca peças mais informação.`;

      // ── Build final prompt (special modes) ───────────────────────────
      let finalPrompt = prompt;
      if (specialMode === "reply" && originalText.trim()) {
        if (replyType === "email") {
          finalPrompt = `Responde a este e-mail:\n\n---\n${originalText}\n---\n\nComo responder: ${prompt || "de forma profissional e directa"}`;
        } else {
          finalPrompt = `Responde a este comentário público (redes sociais):\n\n"${originalText}"\n\nTom: ${prompt || "simpático e natural"}`;
        }
      }

      // ── User message — simples e directo ─────────────────────────────
      const userMessage = `${finalPrompt}

Devolve a resposta neste formato JSON:
{"tipo": "tipo do texto em 2-3 palavras", "texto": "o texto final"}`;

      // ── Groq API (Llama 3.3 70B) ─────────────────────────────────────
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: finalPrompt  },
          ],
          temperature,
        }),
      });

      // HTTP error handling
      if (!response.ok) {
        const status = response.status;
        if (status === 503 || status === 502) throw new Error("503 service unavailable");
        if (status === 429) throw new Error("429 too many requests");
        if (status === 401) throw new Error("401 chave de API inválida");
        throw new Error(`HTTP error ${status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || "API error");
      }

      const raw = data.choices?.[0]?.message?.content || "";

      if (!raw) {
        setResult("Não foi possível gerar o texto. Tenta novamente.");
        if (!isPro && !isNewVersionRef.current) setUsageCount(c => c + 1);
        isNewVersionRef.current = false;
        return;
      }

      // ── Parse JSON response (com fallback robusto) ────────────────────
      try {
        const start = raw.indexOf("{");
        const end   = raw.lastIndexOf("}");
        const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;
        const parsed = JSON.parse(jsonStr);
        setDetectedType(parsed.tipo || "");
        setResult(parsed.texto || raw);
      } catch {
        // Se não vier JSON, mostra o texto directamente — nunca falha
        const cleanRaw = raw.replace(/^```[\w]*\n?/g, "").replace(/```$/g, "").trim();
        setResult(cleanRaw);
      }
      if (!isPro && !isNewVersionRef.current) setUsageCount(c => c + 1);
      isNewVersionRef.current = false;
    } catch (e) {
      const msg = e?.message || "";
      const is503 = msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded");
      const is429 = msg.includes("429");

      // Auto-retry once on 503 (service unavailable)
      if (is503 && retryCount < 2) {
        setRetrying(true);
        setRetryCount(c => c + 1);
        setLoading(false);
        setTimeout(() => {
          setRetrying(false);
          generate();
        }, 3000);
        return;
      }

      const friendly = is503
        ? "O serviço está temporariamente sobrecarregado. A tentar novamente..."
        : is429
        ? "Demasiados pedidos seguidos. Aguarda uns segundos e tenta novamente."
        : msg.includes("fetch")
        ? "Sem ligação à Internet. Verifica a tua rede e tenta novamente."
        : "Algo correu mal. Tenta novamente ou recarrega a página.";
      setApiError(friendly);
      setResult("");
      setRetryCount(0);
      isNewVersionRef.current = false;
    } finally {
      setLoading(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); }
  };

  // ── Gumroad license verify
  const verifyLicense = async () => {
    if (!licenseKey.trim()) { setLicenseError("Introduz a tua license key."); return; }
    setLicenseError("");
    setLicenseLoading(true);
    try {
      const res = await fetch("https://api.gumroad.com/v2/licenses/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ product_id: GUMROAD_PRODUCT_ID, license_key: licenseKey.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setIsPro(true); setShowUpgrade(false); setShowLicense(false); setLicenseKey("");
      } else {
        setLicenseError("License key inválida. Verifica o e-mail de confirmação do Gumroad.");
      }
    } catch { setLicenseError("Erro ao verificar. Tenta novamente."); }
    finally { setLicenseLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0f", fontFamily:"'DM Sans',sans-serif", color:"#f0ede8" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .gg{background:linear-gradient(135deg,#d4a853,#e8c97a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        
        /* Chip */
        .chip{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:999px;padding:8px 16px;cursor:pointer;color:#8b8780;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;transition:all .2s;white-space:nowrap}
        .chip:hover{background:rgba(212,168,83,0.1);border-color:rgba(212,168,83,0.35);color:#d4a853;transform:translateY(-1px)}

        /* Textarea */
        .ta{width:100%;background:transparent;border:none;outline:none;color:#f0ede8;font-family:'DM Sans',sans-serif;font-size:17px;line-height:1.7;resize:none;min-height:56px;max-height:200px;overflow-y:auto}
        .ta::placeholder{color:#3e3d3a}

        /* Input box */
        .input-box{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.09);border-radius:20px;padding:22px 24px 16px;transition:border-color .25s}
        .input-box:focus-within{border-color:rgba(212,168,83,0.45);box-shadow:0 0 0 4px rgba(212,168,83,0.06)}

        /* Generate btn */
        .gen-btn{background:linear-gradient(135deg,#d4a853,#c8922e);border:none;border-radius:12px;padding:13px 28px;color:#0a0a0f;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;white-space:nowrap;flex-shrink:0}
        .gen-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 28px rgba(212,168,83,0.35)}
        .gen-btn:disabled{opacity:0.35;cursor:not-allowed}

        /* Result box */
        .result-box{border-radius:18px;padding:28px 28px 20px;line-height:1.85;font-size:16px;color:#e8e4de;white-space:pre-wrap;transition:all .35s;border:1px solid rgba(212,168,83,0.2);background:rgba(255,255,255,0.03)}
        .result-box.flash{background:rgba(212,168,83,0.07);border-color:rgba(212,168,83,0.5)}

        /* Action buttons */
        .action-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
        .act-btn{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:10px 18px;color:#9b9790;font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer;transition:all .2s;white-space:nowrap}
        .act-btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.18);color:#f0ede8;transform:translateY(-1px)}
        .act-btn.primary{background:linear-gradient(135deg,#d4a853,#c8922e);border-color:transparent;color:#0a0a0f;font-weight:700}
        .act-btn.primary:hover{box-shadow:0 6px 24px rgba(212,168,83,0.3);transform:translateY(-2px)}
        .act-btn.copied{background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.3);color:#4ade80}

        /* Loader */
        .dl{display:flex;gap:7px;align-items:center;justify-content:center;padding:48px 0}
        .dl span{width:9px;height:9px;background:#d4a853;border-radius:50%;animation:bn 1.2s infinite ease-in-out}
        .dl span:nth-child(2){animation-delay:.2s}
        .dl span:nth-child(3){animation-delay:.4s}
        @keyframes bn{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}

        /* Fade in */
        .fi{animation:fi .4s ease}
        @keyframes fi{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

        /* Modal */
        .mo{position:fixed;inset:0;background:rgba(0,0,0,0.82);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;z-index:100;padding:24px}
        .mb2{background:#0f0f17;border:1px solid rgba(212,168,83,0.22);border-radius:24px;padding:40px 36px;max-width:420px;width:100%;position:relative}
        .li{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:14px 16px;color:#f0ede8;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;letter-spacing:1px}
        .li:focus{border-color:rgba(212,168,83,0.5)}
        .li::placeholder{color:#3e3d3a;letter-spacing:0}
        .em-msg{font-size:13px;color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-top:12px}
        .main-btn{background:linear-gradient(135deg,#d4a853,#c8922e);border:none;border-radius:12px;padding:15px;color:#0a0a0f;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;width:100%}
        .main-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 28px rgba(212,168,83,0.3)}
        .main-btn:disabled{opacity:0.4;cursor:not-allowed}
        .ghost-btn{background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:13px;color:#8b8780;font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer;transition:all .2s;width:100%}
        .ghost-btn:hover{border-color:rgba(255,255,255,0.2);color:#f0ede8}

        /* Usage bar */
        .ub{background:rgba(255,255,255,0.05);border-radius:999px;height:3px;overflow:hidden}
        .ubf{height:100%;border-radius:999px;background:linear-gradient(90deg,#d4a853,#e8c97a);transition:width .5s}

        /* Detected type badge */
        .type-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(212,168,83,0.1);border:1px solid rgba(212,168,83,0.22);border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;color:#d4a853;letter-spacing:.5px;margin-bottom:16px}

        /* Pro badge */
        .pro-badge{background:rgba(212,168,83,0.12);border:1px solid rgba(212,168,83,0.3);border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700;color:#d4a853;letter-spacing:1px}

        /* Kbd hint */
        .kbd{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:5px;padding:2px 6px;font-size:11px;color:#5a5852;font-family:monospace}

        /* ── REGISTER SLIDER ────────────────────────────────────── */
        .reg-slider { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:999px; outline:none; cursor:pointer; background:rgba(255,255,255,0.08); }
        .reg-slider::-webkit-slider-thumb { -webkit-appearance:none; width:22px; height:22px; border-radius:50%; background:var(--thumb-color, #c9a84c); cursor:pointer; border:2px solid #0a0a0f; transition:transform .15s, background .2s; box-shadow:0 2px 8px rgba(0,0,0,0.4); }
        .reg-slider::-moz-range-thumb { width:22px; height:22px; border-radius:50%; background:var(--thumb-color, #c9a84c); cursor:pointer; border:2px solid #0a0a0f; transition:transform .15s, background .2s; box-shadow:0 2px 8px rgba(0,0,0,0.4); }
        .reg-slider:hover::-webkit-slider-thumb { transform:scale(1.2); }
        .reg-slider:hover::-moz-range-thumb { transform:scale(1.2); }
        .reg-tick { display:flex; justify-content:space-between; margin-top:8px; }
        .reg-tick span { font-size:11px; color:#3e3d3a; text-align:center; flex:1; cursor:pointer; transition:color .2s; user-select:none; }
        .reg-tick span.active { font-weight:700; }
        @media(max-width:600px) { .reg-tick span { font-size:10px; } }

        /* ── MOBILE ─────────────────────────────────────────────── */
        @media (max-width: 600px) {
          /* Header — mais compacto, PT badge esconde-se */
          .hdr { padding: 12px 16px !important; }
          .hdr-logo { font-size: 19px !important; }
          .hdr-btn { font-size: 10px !important; padding: 4px 9px !important; max-width: 130px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
          .pt-badge { display: none !important; }

          /* Hero — muito mais compacto no mobile */
          .main-wrap { padding: 20px 16px 48px !important; }
          .hero-block { margin-bottom: 18px !important; }
          .hero-title { font-size: 26px !important; margin-bottom: 6px !important; line-height: 1.15 !important; }
          .hero-sub { font-size: 13px !important; margin-bottom: 0 !important; }

          /* Input box */
          .input-box { border-radius: 14px !important; padding: 14px 14px 12px !important; }
          .input-footer { flex-direction: column !important; align-items: stretch !important; gap: 8px !important; }
          .kbd-hint { display: none !important; }
          .gen-btn { width: 100% !important; padding: 14px !important; font-size: 15px !important; border-radius: 10px !important; }

          /* Slider mobile — thumb maior para facilitar toque */
          .reg-slider::-webkit-slider-thumb { width: 28px !important; height: 28px !important; }
          .reg-slider::-moz-range-thumb { width: 28px !important; height: 28px !important; }
          .reg-slider { height: 6px !important; }
          .reg-desc { display: none !important; }

          /* Chips */
          .chips-row { flex-wrap: nowrap !important; overflow-x: auto !important; padding-bottom: 6px !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .chips-row::-webkit-scrollbar { display: none; }
          .chip { flex-shrink: 0 !important; font-size: 13px !important; }

          /* Result */
          .result-box { padding: 18px 16px 14px !important; font-size: 15px !important; border-radius: 12px !important; }

          /* Action buttons */
          .action-row { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
          .act-btn { justify-content: center !important; padding: 12px 8px !important; font-size: 13px !important; }
          .act-btn.primary { grid-column: 1 / -1 !important; padding: 14px !important; font-size: 15px !important; }

          /* Upsell */
          .upsell-strip { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          .upsell-btn { width: 100% !important; text-align: center !important; padding: 11px !important; }

          /* Modal — bottom sheet */
          .mb2 { padding: 24px 18px !important; border-radius: 18px 18px 0 0 !important; margin: 0 !important; max-height: 92vh; overflow-y: auto; }
          .mo { align-items: flex-end !important; padding: 0 !important; }

          /* Usage */
          .usage-label { font-size: 11px !important; }
        }
      `}</style>

      {/* ── MODAL UPGRADE ─────────────────────────────────────────── */}
      {showUpgrade && (
        <div className="mo" onClick={() => setShowUpgrade(false)}>
          <div className="mb2 fi" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setShowUpgrade(false); setShowLicense(false); }} style={{ position:"absolute",top:16,right:20,background:"none",border:"none",color:"#5a5852",fontSize:22,cursor:"pointer",lineHeight:1 }}>×</button>

            {!showLicense ? (<>
              <div style={{ textAlign:"center",marginBottom:28 }}>
                <div style={{ fontSize:36,marginBottom:14 }}>{upgradeReason==="limit" ? "🚫" : "✨"}</div>
                <h2 style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:28,fontWeight:600,marginBottom:8 }}>
                  {upgradeReason==="limit" ? "Limite grátis atingido" : "EscreveAI Pro"}
                </h2>
                <p style={{ color:"#6b6760",fontSize:15,lineHeight:1.65 }}>
                  {upgradeReason==="limit"
                    ? <>Usaste os teus {FREE_LIMIT} textos de hoje.<br/>Faz upgrade para Pro e gera textos ilimitados.</>
                    : <>Textos ilimitados, todos os tipos e tons.<br/>Cancela quando quiseres.</>
                  }
                </p>
              </div>
              <div style={{ background:"rgba(212,168,83,0.06)",border:"1px solid rgba(212,168,83,0.2)",borderRadius:16,padding:"22px 24px",marginBottom:20,textAlign:"center" }}>
                <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,marginBottom:4 }}>EscreveAI <span className="gg">Pro</span></div>
                <div style={{ fontSize:42,fontWeight:700,letterSpacing:"-2px",marginBottom:4 }}><span className="gg">€5</span><span style={{ fontSize:15,color:"#5a5852",fontWeight:400 }}>/mês</span></div>
                <div style={{ fontSize:13,color:"#6b6760" }}>Textos ilimitados · Cancela quando quiseres</div>
              </div>
              <a href={GUMROAD_CHECKOUT_URL} target="_blank" rel="noopener noreferrer" style={{ display:"block",textDecoration:"none",marginBottom:10 }}>
                <button className="main-btn">Comprar Pro no Gumroad →</button>
              </a>
              <button className="ghost-btn" onClick={() => setShowLicense(true)}>Já tenho uma license key</button>
            </>) : (<>
              <button onClick={() => setShowLicense(false)} style={{ background:"none",border:"none",color:"#5a5852",fontSize:14,cursor:"pointer",marginBottom:20,padding:0,display:"flex",alignItems:"center",gap:6 }}>← Voltar</button>
              <h2 style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,marginBottom:8 }}>License key</h2>
              <p style={{ color:"#6b6760",fontSize:14,lineHeight:1.6,marginBottom:18 }}>Encontras a key no e-mail de confirmação do Gumroad.</p>
              <input className="li" type="text" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" value={licenseKey} onChange={e => { setLicenseKey(e.target.value); setLicenseError(""); }} onKeyDown={e => e.key==="Enter" && verifyLicense()} />
              {licenseError && <div className="em-msg">{licenseError}</div>}
              <button className="main-btn" style={{ marginTop:16,opacity:licenseLoading?0.6:1 }} disabled={licenseLoading} onClick={verifyLicense}>
                {licenseLoading ? "A verificar..." : "Ativar Pro"}
              </button>
            </>)}
          </div>
        </div>
      )}

      {/* ── HEADER ────────────────────────────────────────────────── */}
      <header className="hdr" style={{ padding:"24px 32px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div className="hdr-logo" style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,letterSpacing:".3px" }}>
            <span className="gg">Escreve</span>AI
          </div>
          <span className="pt-badge" style={{ background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.25)",borderRadius:999,padding:"3px 10px",fontSize:11,fontWeight:600,color:"#c9a84c",letterSpacing:"0.5px",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5 }}>
            <span style={{ display:"inline-flex",width:18,height:12,borderRadius:2,overflow:"hidden",flexShrink:0,boxShadow:"0 0 0 1px rgba(0,0,0,0.2)" }}>
              <span style={{ flex:"2",background:"#006600" }} />
              <span style={{ flex:"3",background:"#CC0000" }} />
            </span>
            PT Europeu
          </span>
        </div>
        {isPro
          ? <span className="pro-badge">✦ PRO</span>
          : <button className="hdr-btn" onClick={() => { setUpgradeReason("voluntary"); setShowUpgrade(true); }} style={{ background:"none",border:"1px solid rgba(212,168,83,0.25)",borderRadius:999,padding:"5px 14px",color:"#d4a853",fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:".3px",transition:"all .2s" }}>
              {remaining} texto{remaining!==1?"s":""} grátis · Upgrade →
            </button>
        }
      </header>

      {/* ── MAIN ──────────────────────────────────────────────────── */}
      <main className="main-wrap" style={{ maxWidth:660,width:"100%",margin:"0 auto",padding:"56px 24px 60px" }}>

        {/* Hero text — compacto quando em modo de resposta */}
        <div className="hero-block" style={{ marginBottom: specialMode ? 20 : 36, textAlign:"center", transition:"margin .3s" }}>
          <h1 className="hero-title" style={{ fontFamily:"'Cormorant Garamond',serif", fontSize: specialMode ? "clamp(22px,4vw,32px)" : "clamp(32px,6vw,52px)", fontWeight:300,lineHeight:1.12,letterSpacing:"-0.5px",marginBottom: specialMode ? 0 : 12, transition:"font-size .3s, margin .3s" }}>
            O que precisas de<br/><em style={{ fontStyle:"italic",color:"#d4a853" }}>escrever hoje?</em>
          </h1>
          {!specialMode && (
            <p className="hero-sub" style={{ color:"#5a5852",fontSize:15,lineHeight:1.65 }}>Descreve a situação e a IA escreve por ti em segundos.</p>
          )}
        </div>

        {/* ── REPLY CHIPS + CONTEXT HINT — always above input ─── */}
        <div style={{ marginBottom:16 }}>
          <div className="chips-row" style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom: detectedCtx && !specialMode ? 10 : 0 }}>
            <button
              className="chip"
              style={{ background: specialMode==="reply" ? "rgba(201,168,76,0.15)" : undefined, borderColor: specialMode==="reply" ? "#c9a84c" : undefined, color: specialMode==="reply" ? "#c9a84c" : undefined }}
              onClick={() => specialMode==="reply" ? cancelSpecialMode() : applyChip(REPLY_CHIP)}
            >
              {REPLY_CHIP.label}
            </button>
          </div>
          {detectedCtx && !specialMode && (
            <div className="fi" style={{ display:"flex",alignItems:"center",gap:8,marginTop:8 }}>
              <span style={{ background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.2)",borderRadius:999,padding:"5px 14px",fontSize:13,color:"#c9a84c",display:"flex",alignItems:"center",gap:6 }}>
                {detectedCtx.icon} {detectedCtx.label} detectado
              </span>
              <span style={{ fontSize:12,color:"#3e3d3a" }}>Gera directamente ou continua a descrever</span>
            </div>
          )}
        </div>

        {/* ── INPUT BOX ─────────────────────────────────────────── */}
        <div className="input-box" style={{ display: specialMode ? "none" : undefined, marginBottom:14 }}>
          <textarea
            ref={textareaRef}
            className="ta"
            placeholder="Ex: Preciso de um e-mail para cobrar um cliente sem parecer agressivo..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {SHOW_REGISTER_SLIDER && <RegisterSlider register={register} setRegister={setRegister} />}

          <div className="input-footer" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.05)" }}>
            <span className="kbd-hint" style={{ fontSize:12,color:"#3e3d3a" }}>
              <span className="kbd">Enter</span> para gerar · <span className="kbd">Shift+Enter</span> para nova linha
            </span>
            <button className="gen-btn" disabled={!prompt.trim() || loading} onClick={generate}>
              {loading ? (retrying ? "A tentar novamente..." : "A escrever...") : "✨ Gerar texto"}
            </button>
          </div>
        </div>

        {/* ── SPECIAL MODE — Reply Email / Reply Comment ────────── */}
        {specialMode === "reply" && (
          <div className="fi" style={{ background:"rgba(201,168,76,0.05)",border:"1px solid rgba(201,168,76,0.2)",borderRadius:16,padding:"20px",marginBottom:16 }}>

            {/* Selector de tipo */}
            <div style={{ display:"flex",gap:8,marginBottom:16 }}>
              {[
                { id:"email",   label:"📧 E-mail" },
                { id:"comment", label:"💬 Comentário / Post" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setReplyType(t.id)}
                  style={{
                    flex:1, padding:"9px 12px", borderRadius:10, cursor:"pointer",
                    fontFamily:"'DM Sans',sans-serif", fontSize:13, fontWeight:600,
                    transition:"all .2s",
                    background: replyType===t.id ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.03)",
                    border: replyType===t.id ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    color: replyType===t.id ? "#c9a84c" : "#6b6760",
                  }}
                >{t.label}</button>
              ))}
            </div>

            {/* Texto original */}
            <textarea
              className="ta"
              rows={4}
              placeholder={replyType==="email" ? "Cola aqui o e-mail que recebeste..." : "Cola aqui o comentário a que queres responder..."}
              value={originalText}
              onChange={e => setOriginalText(e.target.value)}
              style={{ marginBottom:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px",fontSize:14 }}
            />

            {/* Instrução */}
            <input
              type="text"
              placeholder={replyType==="email" ? "Como queres responder? (ex: recusar com educação)" : "Tom da resposta (ex: simpático, profissional)"}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"12px 14px",color:"#f0ede8",fontFamily:"'DM Sans',sans-serif",fontSize:14,outline:"none",boxSizing:"border-box",marginBottom:12 }}
            />

            {SHOW_REGISTER_SLIDER && <RegisterSlider register={register} setRegister={setRegister} />}

            <button
              className="gen-btn"
              style={{ width:"100%", marginTop: SHOW_REGISTER_SLIDER ? 14 : 0 }}
              disabled={!originalText.trim() || loading}
              onClick={generate}
            >
              {loading ? (retrying ? "A tentar novamente..." : "A escrever...") : "✨ Gerar resposta"}
            </button>
          </div>
        )}

        {/* ── PROMPT ERROR ──────────────────────────────────────── */}
        {promptError && (
          <div style={{ display:"flex",alignItems:"center",gap:10,background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:12,padding:"12px 16px",marginBottom:8 }}>
            <span style={{ fontSize:18,flexShrink:0 }}>💡</span>
            <p style={{ fontSize:13,color:"#d4a853",margin:0,lineHeight:1.5 }}>{promptError}</p>
            <button onClick={() => setPromptError("")} style={{ marginLeft:"auto",background:"none",border:"none",color:"#6b6760",fontSize:16,cursor:"pointer",flexShrink:0 }}>×</button>
          </div>
        )}

        {/* ── USAGE BAR (free users) ────────────────────────────── */}
        {!isPro && (
          <div style={{ marginBottom:40 }}>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:"#3e3d3a",marginBottom:6 }}>
              <span>Textos grátis</span>
              <span>{usageCount} / {FREE_LIMIT}</span>
            </div>
            <div className="ub"><div className="ubf" style={{ width:`${Math.min((usageCount/FREE_LIMIT)*100,100)}%` }} /></div>
          </div>
        )}

        {/* ── API ERROR ────────────────────────────────────────── */}
        {retrying && (
          <div style={{ display:"flex",alignItems:"center",gap:10,background:"rgba(201,168,76,0.07)",border:"1px solid rgba(201,168,76,0.2)",borderRadius:14,padding:"14px 18px",marginBottom:16 }}>
            <span style={{ fontSize:18 }}>🔄</span>
            <p style={{ fontSize:13,color:"#c9a84c",margin:0 }}>Serviço temporariamente indisponível — a tentar novamente em 3 segundos...</p>
          </div>
        )}

        {apiError && (
          <div style={{ background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:14,padding:"16px 20px",marginBottom:24,display:"flex",alignItems:"center",gap:12 }}>
            <span style={{ fontSize:20 }}>⚠️</span>
            <div>
              <p style={{ fontSize:14,color:"#fca5a5",fontWeight:600,margin:"0 0 2px" }}>Erro ao gerar texto</p>
              <p style={{ fontSize:13,color:"#9b6060",margin:0 }}>{apiError}</p>
            </div>
            <button onClick={() => setApiError("")} style={{ marginLeft:"auto",background:"none",border:"none",color:"#9b6060",fontSize:18,cursor:"pointer",flexShrink:0 }}>×</button>
          </div>
        )}

        {/* ── RESULT ────────────────────────────────────────────── */}
        {(loading || result) && (
          <div ref={resultRef} className="fi">

            {detectedType && !loading && (
              <div className="type-badge">✦ {detectedType} detetado automaticamente</div>
            )}

            {loading
              ? <div className="dl"><span/><span/><span/></div>
              : <>
                  <div className={`result-box ${copyState==="flash"?"flash":""}`}>{result}</div>

                  {/* ── ACTION BUTTONS ──────────────────────────── */}
                  <div className="action-row">

                    {/* Copiar — primário */}
                    <button
                      className={`act-btn primary ${copyState==="copied"||copyState==="flash"?"copied":""}`}
                      onClick={copyText}
                      style={{ flex:1 }}
                    >
                      {copyState==="copied"||copyState==="flash" ? (<><span>✓</span> Copiado!</>) : (<><span>⎘</span> Copiar texto</>)}
                    </button>

                    {/* Abrir no e-mail (só para e-mails detetados) */}
                    {isEmail && (
                      <button className="act-btn" onClick={openInMail} title="Abrir no cliente de e-mail">
                        <span>📨</span> Abrir no e-mail
                      </button>
                    )}

                    {/* Partilhar via Web Share API */}
                    {canShare && (
                      <button className="act-btn" onClick={shareText} title="Partilhar">
                        <span>↗</span> Partilhar
                      </button>
                    )}

                    {/* Gerar de novo */}
                    <button className="act-btn" onClick={generateNewVersion} title="Gerar nova versão">
                      <span>↻</span> Nova versão
                    </button>

                  </div>

                  {shareError && <p style={{ fontSize:12,color:"#ef4444",marginTop:8 }}>{shareError}</p>}

                  {/* ── UPSELL / PRO STATUS ────────────────────── */}
                  <div className="upsell-strip" style={{ marginTop:28,padding:"18px 22px",background:isPro?"rgba(212,168,83,0.05)":"rgba(255,255,255,0.02)",border:`1px solid ${isPro?"rgba(212,168,83,0.18)":"rgba(255,255,255,0.05)"}`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
                    {isPro ? (
                      <p style={{ fontSize:13,color:"#6b6760",margin:0 }}>✦ Conta <span style={{ color:"#d4a853",fontWeight:600 }}>Pro</span> ativa — textos ilimitados</p>
                    ) : (
                      <>
                        <p style={{ fontSize:13,color:"#6b6760",margin:0 }}>
                          {remaining>0 ? `${remaining} texto${remaining!==1?"s":""} grátis restante${remaining!==1?"s":""}` : "Limite atingido — faz upgrade para continuar"}
                        </p>
                        <button className="upsell-btn" onClick={() => { setUpgradeReason("voluntary"); setShowUpgrade(true); }} style={{ background:"none",border:"1px solid rgba(212,168,83,0.28)",borderRadius:8,padding:"7px 16px",color:"#d4a853",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap" }}>
                          Pro — €5/mês →
                        </button>
                      </>
                    )}
                  </div>
                </>
            }
          </div>
        )}
      </main>
    </div>
  );
}
