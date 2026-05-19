import { useState, useRef, useEffect } from "react";

const GUMROAD_PRODUCT_ID   = "avxvef";
const GUMROAD_CHECKOUT_URL = "https://hugompa.gumroad.com/l/avxvef?wanted=true";
const FREE_LIMIT           = 3;

const CHIPS = [
  { label: "📧 E-mail profissional",    hint: "Escreve um e-mail profissional sobre: " },
  { label: "📱 Post para redes sociais", hint: "Cria um post para redes sociais sobre: " },
  { label: "💬 Mensagem difícil",        hint: "Preciso de uma mensagem para: " },
  { label: "👤 Bio / Apresentação",      hint: "Escreve uma bio profissional: " },
];

const canShare = typeof navigator !== "undefined" && !!navigator.share;

const LS_COUNT = "escreve_usage";
const LS_PRO   = "escreve_pro";
const LS_DATE  = "escreve_date";
const getTodayKey = () => new Date().toISOString().slice(0, 10);
const loadUsage = () => {
  try {
    const date = localStorage.getItem(LS_DATE);
    if (date !== getTodayKey()) { localStorage.setItem(LS_DATE, getTodayKey()); localStorage.setItem(LS_COUNT, "0"); return 0; }
    return parseInt(localStorage.getItem(LS_COUNT) || "0", 10);
  } catch { return 0; }
};
const loadIsPro = () => { try { return localStorage.getItem(LS_PRO) === "true"; } catch { return false; } };

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

  const applyChip = (hint) => {
    setPrompt(hint);
    textareaRef.current?.focus();
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
      // ── Temperatura dinâmica baseada no tipo detetado ─────────────────
      const isCreative = isPost || isBio || pLower.includes("criativ") || pLower.includes("história");
      const isFormal   = isEmail || pLower.includes("proposta") || pLower.includes("contrato") || pLower.includes("relatório");
      const temperature = isCreative ? 0.9 : isFormal ? 0.4 : 0.65;

      // ── Few-shot examples por categoria ──────────────────────────────
      const fewShotExamples = isCreative
        ? `Exemplos de tom e estilo para textos criativos:
❌ Fraco: "A nossa empresa tem o prazer de anunciar o lançamento do nosso produto inovador."
✅ Forte: "Trabalhámos dois anos nisto. Hoje finalmente podes experimentar."
❌ Fraco: "Partilhamos hoje uma novidade muito importante para todos os nossos seguidores."
✅ Forte: "Isto vai mudar a forma como trabalhas. Aqui está porquê."`
        : isFormal
        ? `Exemplos de tom e estilo para textos profissionais:
❌ Fraco: "Venho por este meio informar que a fatura se encontra em dívida há algum tempo."
✅ Forte: "Estava a rever as faturas em aberto e reparei que a referente a março ainda não entrou."
❌ Fraco: "Fico ao vosso inteiro dispor para qualquer esclarecimento adicional."
✅ Forte: "Qualquer dúvida, estou disponível."`
        : `Exemplos de tom e estilo para mensagens pessoais:
❌ Fraco: "Lamento imenso não poder estar presente no teu evento tão especial."
✅ Forte: "Chateou-me não conseguir estar — era mesmo algo que queria muito."
❌ Fraco: "Espero que compreendas a minha situação e que possamos encontrar-nos noutra ocasião."
✅ Forte: "Fica para a próxima — desta vez é a sério."`;

      const systemPrompt = `És um copywriter sénior português com 15 anos de experiência em comunicação escrita.

REGRA ABSOLUTA — NUNCA QUEBRAR:
- NUNCA fazes perguntas ao utilizador. NUNCA. Mesmo que o pedido seja vago ou incompleto.
- Se o contexto for limitado, assumes pressupostos razoáveis e geras o melhor texto possível.
- O teu único output é sempre texto final pronto a usar — nunca perguntas, nunca pedidos de esclarecimento.

REGRAS DE QUALIDADE:
- Escreves SEMPRE em português europeu continental — nunca brasileiro
- Os teus textos soam a pessoa real, não a template corporativo
- Nunca usas: "venho por este meio", "fico ao inteiro dispor", "no seguimento do" de forma mecânica
- Nunca colocas placeholders como [Nome], [Data], [Empresa] — o texto sai sempre completo
- Parágrafos curtos. Frases directas. Sem floreados desnecessários.

QUANDO O PEDIDO É VAGO:
- Geras um texto representativo e útil com base no que foi pedido
- Se o pedido pedir múltiplos textos, geras 1 exemplo completo e de qualidade
- Nunca explicas o que fizeste — apenas entregas o texto

PORTUGUÊS EUROPEU — NÃO usar:
- "você" (usa "tu" em informal; "o senhor/a senhora" em formal)
- "a nível de", "em termos de"
- gerúndio excessivo: "estou precisando", "fui fazendo"`;

      const userMessage = `Pedido do utilizador: "${prompt}"

${fewShotExamples}

Instruções:
1. Determina o tipo de texto (e-mail, post, mensagem, bio, etc.)
2. Escreve o texto final — pronto a copiar e enviar
3. Adapta o comprimento: posts curtos, e-mails sucintos
4. Se o pedido pedir múltiplos textos, gera 1 exemplo excelente
5. NUNCA perguntes nada — entrega sempre texto final

Responde APENAS neste formato JSON:
{
  "tipo": "tipo em 2-3 palavras",
  "texto": "o texto final aqui"
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { temperature, maxOutputTokens: 1200 },
        }),
      });
      const data = await response.json();

      // Gemini error handling
      if (data.error) {
        throw new Error(data.error.message || "Gemini API error");
      }

      // Gemini pode bloquear conteúdo — verificar
      const candidate = data.candidates?.[0];
      if (!candidate || candidate.finishReason === "SAFETY") {
        setResult("O texto não pôde ser gerado. Tenta reformular o pedido.");
        if (!isPro && !isNewVersionRef.current) setUsageCount(c => c + 1);
        isNewVersionRef.current = false;
        return;
      }

      const raw = candidate?.content?.parts?.[0]?.text || "";

      if (!raw) {
        setResult("Não foi possível gerar o texto. Tenta novamente.");
        if (!isPro && !isNewVersionRef.current) setUsageCount(c => c + 1);
        isNewVersionRef.current = false;
        return;
      }

      try {
        // Strip markdown code fences if present
        const clean = raw
          .replace(/^```json\s*/g, "")
          .replace(/^```\s*/g, "")
          .replace(/\s*```$/g, "")
          .trim();
        // Find JSON object in response
        const start = clean.indexOf("{");
        const end = clean.lastIndexOf("}");
        const jsonStr = start !== -1 && end !== -1 ? clean.slice(start, end + 1) : clean;
        const parsed = JSON.parse(jsonStr);
        setDetectedType(parsed.tipo || "");
        setResult(parsed.texto || raw);
      } catch {
        setResult(raw);
      }
      if (!isPro && !isNewVersionRef.current) setUsageCount(c => c + 1);
      isNewVersionRef.current = false;
    } catch (e) {
      const msg = e?.message || "";
      const friendly = msg.includes("fetch")
        ? "Sem ligação à Internet. Verifica a tua rede e tenta novamente."
        : msg.includes("429")
        ? "Demasiados pedidos. Aguarda uns segundos e tenta novamente."
        : "Algo correu mal. Tenta novamente ou recarrega a página.";
      setApiError(friendly);
      setResult("");
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
      <header style={{ padding:"24px 32px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,letterSpacing:".3px" }}>
          <span className="gg">Escreve</span>AI
        </div>
        {isPro
          ? <span className="pro-badge">✦ PRO</span>
          : <button onClick={() => { setUpgradeReason("voluntary"); setShowUpgrade(true); }} style={{ background:"none",border:"1px solid rgba(212,168,83,0.25)",borderRadius:999,padding:"5px 14px",color:"#d4a853",fontSize:12,fontWeight:600,cursor:"pointer",letterSpacing:".3px",transition:"all .2s" }}>
              {remaining} texto{remaining!==1?"s":""} grátis · Upgrade →
            </button>
        }
      </header>

      {/* ── MAIN ──────────────────────────────────────────────────── */}
      <main style={{ maxWidth:660,width:"100%",margin:"0 auto",padding:"56px 24px 60px" }}>

        {/* Hero text */}
        <div style={{ marginBottom:36,textAlign:"center" }}>
          <h1 style={{ fontFamily:"'Cormorant Garamond',serif",fontSize:"clamp(32px,6vw,52px)",fontWeight:300,lineHeight:1.12,letterSpacing:"-0.5px",marginBottom:12 }}>
            O que precisas de<br/><em style={{ fontStyle:"italic",color:"#d4a853" }}>escrever hoje?</em>
          </h1>
          <p style={{ color:"#5a5852",fontSize:15,lineHeight:1.65 }}>Descreve a situação e a IA escreve por ti em segundos.</p>
        </div>

        {/* ── INPUT BOX ─────────────────────────────────────────── */}
        <div className="input-box" style={{ marginBottom:14 }}>
          <textarea
            ref={textareaRef}
            className="ta"
            placeholder="Ex: Preciso de um e-mail para cobrar um cliente sem parecer agressivo..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize:12,color:"#3e3d3a" }}>
              <span className="kbd">Enter</span> para gerar · <span className="kbd">Shift+Enter</span> para nova linha
            </span>
            <button className="gen-btn" disabled={!prompt.trim() || loading} onClick={generate}>
              {loading ? "A escrever..." : "✨ Gerar texto"}
            </button>
          </div>
        </div>

        {/* ── PROMPT ERROR ──────────────────────────────────────── */}
        {promptError && (
          <div style={{ display:"flex",alignItems:"center",gap:10,background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.2)",borderRadius:12,padding:"12px 16px",marginBottom:8 }}>
            <span style={{ fontSize:18,flexShrink:0 }}>💡</span>
            <p style={{ fontSize:13,color:"#d4a853",margin:0,lineHeight:1.5 }}>{promptError}</p>
            <button onClick={() => setPromptError("")} style={{ marginLeft:"auto",background:"none",border:"none",color:"#6b6760",fontSize:16,cursor:"pointer",flexShrink:0 }}>×</button>
          </div>
        )}

        {/* ── CHIPS ─────────────────────────────────────────────── */}
        <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:48 }}>
          {CHIPS.map((c,i) => (
            <button key={i} className="chip" onClick={() => applyChip(c.hint)}>{c.label}</button>
          ))}
        </div>

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
                  <div style={{ marginTop:28,padding:"18px 22px",background:isPro?"rgba(212,168,83,0.05)":"rgba(255,255,255,0.02)",border:`1px solid ${isPro?"rgba(212,168,83,0.18)":"rgba(255,255,255,0.05)"}`,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap" }}>
                    {isPro ? (
                      <p style={{ fontSize:13,color:"#6b6760",margin:0 }}>✦ Conta <span style={{ color:"#d4a853",fontWeight:600 }}>Pro</span> ativa — textos ilimitados</p>
                    ) : (
                      <>
                        <p style={{ fontSize:13,color:"#6b6760",margin:0 }}>
                          {remaining>0 ? `${remaining} texto${remaining!==1?"s":""} grátis restante${remaining!==1?"s":""}` : "Limite atingido — faz upgrade para continuar"}
                        </p>
                        <button onClick={() => { setUpgradeReason("voluntary"); setShowUpgrade(true); }} style={{ background:"none",border:"1px solid rgba(212,168,83,0.28)",borderRadius:8,padding:"7px 16px",color:"#d4a853",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap" }}>
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
