# EscreveAI

Gerador de textos com IA em português europeu.

## Stack
- React 18 + Vite
- Claude API (Anthropic)
- Gumroad (pagamentos e license keys)

## Configuração

No ficheiro `src/App.jsx`, as primeiras linhas têm as configurações:

```js
const GUMROAD_PRODUCT_ID   = "avxvef";
const GUMROAD_CHECKOUT_URL = "https://hugompa.gumroad.com/l/avxvef?wanted=true";
const FREE_LIMIT           = 3; // gerações grátis por dia
```

## Desenvolvimento local

```bash
npm install
npm run dev
```

## Deploy (Vercel)

1. Faz push para o GitHub
2. Liga o repositório no vercel.com
3. Vercel detecta Vite automaticamente — zero configuração necessária

Cada push para `main` faz deploy automático.
