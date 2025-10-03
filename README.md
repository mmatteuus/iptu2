# IPTU2 - Prefeitura de Araguaina

Aplicacao web em duas etapas para consulta de imoveis no SIG e simulacao oficial de parcelamento via sigintegracaorest.

## Stack principal

- Vite + React 18 + TypeScript
- Bootstrap 5 (sem jQuery) e icones SVG proprios
- Proxies serverless em `/api` para SIG e Prodata
- ESLint + Prettier + Husky + lint-staged

## Estrutura de pastas

```
iptu2/
├─ api/                      # Funcoes serverless (Vercel ou similares)
│  ├─ pesquisar-imoveis.ts   # Proxy para UI SIG (CPF/CNPJ via credencial tecnica)
│  └─ simular-repactuacao.ts # Proxy para API oficial sigintegracaorest
├─ public/
├─ scripts/healthcheck.mjs   # Script de verificacao pos-deploy
├─ src/
│  ├─ components/            # Barra de acessibilidade, formulários, tabelas, export, etc.
│  ├─ context/               # Estado global (acessibilidade, selecao de imovel, prefill)
│  ├─ pages/                 # Telas Pesquisa e Simulacao
│  ├─ services/              # Clientes fetch para os proxies
│  ├─ utils/                 # Formatadores de moeda/data/documento
│  └─ main.tsx               # Entrada React com React Router
└─ README.md
```

## Variaveis de ambiente (`.env`)

```
# Pesquisa (endpoint privado da UI SIG)
PRODATA_SIG_BASE=https://araguaina.prodataweb.inf.br
PRODATA_SIG_PATH=/sig/rest/imovelController/pesquisarImoveis
PRODATA_SIG_AUTH_TOKEN=
PRODATA_SIG_HMAC_SECRET=
PRODATA_SIG_MODULO=24
PRODATA_SIG_ORIGIN=https://araguaina.prodataweb.inf.br
PRODATA_SIG_URL=https://araguaina.prodataweb.inf.br/sig/app.html#/servicosonline/debito-imovel

# Simulacao (API oficial)
PRODATA_API_BASE=https://araguaina.prodataweb.inf.br/sigintegracaorest
PRODATA_API_TOKEN=

# URLs expostas no front (WhatsApp)
VITE_WHATSAPP_PREFEITURA_URL=https://wa.me/5563999999999
VITE_WHATSAPP_ASSINATURA_URL=https://wa.me/5563999999999
```

- Guarde tokens e segredos apenas no backend. A aplicacao chama sempre os proxies em `/api`.
- Se `PRODATA_SIG_AUTH_TOKEN` ou `PRODATA_SIG_HMAC_SECRET` nao forem definidos, o proxy `/api/pesquisar-imoveis` responde **501** e a UI oferece fluxo manual por CCI/CCP/DUAM.

## Scripts principais

- `npm run dev` – inicia servidor Vite.
- `npm run build` – `tsc -b` + build Vite.
- `npm run lint` – ESLint nos fontes TS/TSX.
- `npm run healthcheck` – executa `scripts/healthcheck.mjs` (ver abaixo).
- `npm run prepare` – instala ganchos Husky.

### Healthcheck

Script pensado para rodar apos deploy a partir de uma URL base:

```bash
HEALTHCHECK_BASE_URL=https://seu-deploy.vercel.app npm run healthcheck
```

- Esperado: `/api/simular-repactuacao` responder `200` sem credenciais.
- `/api/pesquisar-imoveis` deve retornar `501` quando os segredos nao estiverem configurados (mensagem "aguardando credenciais").

## Fluxos implementados

### Tela 1 — Pesquisa (`/pesquisa`)

- Entrada CPF/CNPJ com mascara e validacao.
- Chamada ao proxy `/api/pesquisar-imoveis` (mensagens claras para 501/401/403).
- Lista de imoveis (nome, CCI, CCP, inscricao, endereco) com botoes que pre-preenchem a simulacao.
- Fallback quando nao ha credenciais: campos CCI/CCP/Inscricao/DUAM e redirecionamento manual.

### Tela 2 — Simulacao (`/simulacao`)

- Formulario completo (tipo devedor, codigo, vencimento, tipo de entrada, percentual/valor, DUAM).
- Chamada ao proxy `/api/simular-repactuacao` com limites de 48 parcelas.
- Tabela responsiva com resumo por parcela e totalizador.
- Exportacoes CSV e PDF (jsPDF + autoTable) considerando as 48 primeiras parcelas.

## Acessibilidade e UX

- Barra flotante com A+/A/A-, alto contraste, foco visivel e rotulos claros.
- Navegacao por teclado preservada via Bootstrap 5.
- Avisos `aria-live` para mensagens de erro/estado.
- Datas e valores formatados em `pt-BR`.
- Botao flutuante para WhatsApp da Prefeitura e assinatura "Desenvolvido por MtsFerreira" com deep link.

## Observacoes e limites

- Simulacao limita a exibicao a 48 parcelas; se a API retornar mais, a UI alerta o usuario.
- A pesquisa por CPF/CNPJ depende de credenciais fornecidas pela TI municipal (token + assinatura HMAC). Sem elas, apenas o fluxo manual estara ativo.
- Os proxies devem ser hospedados em ambiente seguro (Vercel `/api` ou Netlify functions). Nunca exponha tokens no front.
- Bundle gerado inclui bibliotecas pesadas (jsPDF/html2canvas); caso deseje reduzir o tamanho, considere carregamento sob demanda dos exports.

## Como rodar localmente

1. Preencha `.env` com as variaveis relevantes.
2. `npm install`
3. `npm run dev`
4. Acesse `http://localhost:5173`.

Para validar a build: `npm run build`.

---

Contribuicoes:

- Padrao de commit sugerido: atomicos por feature (scaffold, proxies, servicos, telas, acessibilidade, export, docs).
- Branch inicial sugerida: `feat/pesquisa-simulacao-iptu`.

