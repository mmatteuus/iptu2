# IPTU2 - Prefeitura de Araguaina

Aplicacao web focada em consultar dados imobiliarios e parcelar debitos de IPTU utilizando a API oficial da Prodata (`sigintegracaorest`) com interface React acessivel.

## Stack principal

- Vite + React 18 + TypeScript
- Bootstrap 5 (sem jQuery) e icones SVG proprios
- Funcoes serverless em `/api` (Vercel ou equivalente)
- ESLint + Prettier + Husky + lint-staged

## Estrutura de pastas

```
iptu2/
├─ api/                         # Proxies serverless
│  ├─ _auth.ts                  # Cache de token Bearer (Prodata)
│  ├─ _lib/                     # Utilitarios compartilhados (CORS, rate limit, logs, etc.)
│  ├─ debitos.ts                # GET /api/debitos
│  ├─ emitir.ts                 # POST /api/emitir
│  ├─ pesquisar-imoveis.ts      # POST /api/pesquisar-imoveis
│  └─ simular-repactuacao.ts    # POST /api/simular-repactuacao
├─ postman/                     # Colecao e ambiente Postman
├─ public/
├─ scripts/healthcheck.mjs      # Script de validacao pos-deploy
├─ src/
│  ├─ components/               # Barra de acessibilidade, tabelas, formulários, etc.
│  ├─ context/                  # Estado global (selecoes + acessibilidade)
│  ├─ pages/                    # Telas Pesquisa e Simulacao/Emissao
│  ├─ services/                 # Clientes fetch para proxies
│  ├─ utils/                    # Formatadores de moeda/data/documento
│  ├─ App.tsx                   # Rotas (React Router)
│  └─ main.tsx                  # Bootstrap da aplicacao
├─ .env.example
└─ README.md
```

## Variaveis de ambiente principais

| Variavel | Obrigatorio | Descricao |
|----------|-------------|-----------|
| `PRODATA_API_BASE` | sim | URL base da API Prodata (`https://.../sigintegracaorest`) |
| `PRODATA_USER` | sim | Usuario tecnico fornecido pela Prodata |
| `PRODATA_PASSWORD` | sim | Senha tecnica fornecida pela Prodata |
| `PRODATA_PESQUISA_SOURCE` | nao (default `auto`) | `api`, `sig` ou `auto` (prefere API oficial quando `PRODATA_USER/PASSWORD` estiverem definidos) |
| `PRODATA_API_PESQUISA_PATH` | nao | Caminho alternativo para busca imobiliaria (default `/arrecadacao/obterDadosImobiliario`) |
| `PRODATA_API_SIMULACAO_PATH` | nao | Caminho principal da simulacao (default `/arrecadacao/simulacao`) |
| `PRODATA_API_SIMULACAO_FALLBACK_PATH` | nao | Caminho legado usado como fallback (default `/arrecadacao/simulacaoRepactuacao`) |
| `PRODATA_API_DEBITOS_PATH` | nao | Caminho dos debitos (default `/arrecadacao/debitos`) |
| `PRODATA_API_EMITIR_PATH` | nao | Caminho da emissao (default `/arrecadacao/emitir`) |
| `PRODATA_SIG_*` | nao | Credenciais para fallback SIG (CPF/CNPJ) quando o endpoint oficial nao estiver disponivel |
| `API_ALLOWED_ORIGINS` | recomendado | Lista separada por virgulas dos dominios autorizados via CORS |
| `RATE_LIMIT_IP`, `RATE_LIMIT_IP_WINDOW_MS` | opcional | Ajuste do rate limit global por IP (default 60 requisicoes/minuto) |
| `RATE_LIMIT_CRITICAL`, `RATE_LIMIT_CRITICAL_WINDOW_MS` | opcional | Ajuste do rate limit para rotas criticas (default 10 requisicoes/minuto por sessao) |
| `VITE_WHATSAPP_PREFEITURA_URL` | nao | Link exibido na UI |
| `VITE_WHATSAPP_ASSINATURA_URL` | nao | Link de assinatura exibido na UI |

> Consulte `.env.example` para o conjunto completo de variaveis e valores padrao. Nunca commite credenciais reais.

## Proxies `/api` implementados

Todos os handlers compartilham:

- CORS restritivo (`API_ALLOWED_ORIGINS`) com suporte a `OPTIONS`.
- Rate limit combinado por IP (60/min) e por rota critica (10/min). Ajuste via variaveis de ambiente.
- `x-correlation-id` ecoado na resposta (gera automaticamente quando nao informado).
- Logs JSON estruturados com mascaramento de CPF/CNPJ/tokens (sem dados sensiveis).
- Metricas em memoria (contagem, erro, p95) com alertas em log quando ultrapassados os limites.

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/pesquisar-imoveis` | POST | Recebe `{ cpfCNPJ? , inscricao?, cci?, ccp? }`. Em modo `api` consulta o endpoint oficial, normaliza resultados e devolve `[ { nome, cgc, cci, ccp, inscricao, logradouro, bairro, origem } ]`. Em modo `sig` preserva a chamada HMAC ao SIG e devolve formato equivalente; sem credenciais responde `501` com instrucoes de fallback. |
| `/api/simular-repactuacao` | POST | Envia payload completo para a Prodata, reutilizando token Bearer com cache renovado T-60s. Sem credenciais responde `200` com `modo: "mock"` para manter o healthcheck. Erros padronizados conforme status (`400/422`, `401`, `404`, `409`, `5xx`). |
| `/api/debitos` | GET | Aceita `inscricaoImobiliaria`, `cci` ou `ccp` como query string. Encaminha para Prodata e devolve a resposta original. |
| `/api/emitir` | POST | Confirma uma simulacao (requer `simulacaoId`). Reenvia `confirmacao: true` por padrao e retorna dados relevantes (numero do titulo, linha digitavel, URL do boleto, etc.) quando presentes. |

### Cache de autenticacao

- `api/_auth.ts` gera tokens via `POST /autenticacao` com `{ usuario, senha }`.
- Armazena o token e `expiresIn` em memoria; renova automaticamente quando restarem menos de 60s.
- Em caso de `401` a chamada invalida o cache, renova e tenta novamente uma unica vez.
- Falhas na autenticacao geram log estruturado (sem vazar credenciais) e retornam erro 503 para o cliente.

## Front-end

### Pesquisa (`/pesquisa`)

- Campo CPF/CNPJ com mascara. Quando a API oficial esta habilitada, permite CPF/CNPJ/inscricao/CCI/CCP (via `pesquisarImoveis`).  
- Resultado normalizado indica a origem (`API`, `SIG` ou `Manual`), permitindo identificar a fonte dos dados.
- Resposta `501` ativa automaticamente o fluxo manual (CCI/CCP/Inscricao/DUAM).  
- Erros (400, 401, 404, 429, 5xx) exibem mensagens alinhadas ao padrao de UX do projeto.

### Simulacao e emissao (`/simulacao`)

- Prefill automatico baseado na selecao de imovel.
- Chamada a `/api/simular-repactuacao` retorna `SimulacaoResult`, preservando `simulacaoId`, mensagem do backend e modo mock.
- Resultado renderiza ate 48 parcelas com exportacao CSV/PDF.
- Botao "Aceitar simulacao e emitir" dispara `/api/emitir`, exibindo numero do titulo, vencimento, valor total, linha digitavel, codigo de barras e link do boleto quando disponiveis.
- Tratamento de erros diferenciando `401`, `409`, `422`, `429` e `5xx`.

## Observabilidade e seguranca

- **Logs**: formatados em JSON, mascarando documentos e tokens; sempre incluem `correlationId`, rota e status.
- **Correlation ID**: aceito via header `x-correlation-id` (gerado automaticamente quando ausente) e devolvido na resposta.
- **Rate limit**: limites padrao 60 req/min por IP e 10 req/min para rotas criticas (`simular`, `emitir`, `debitos`). Resposta `429` com `Retry-After`.
- **Metricas**: contagem, taxa de erro e p95 por rota, com alertas em log quando erro >= 2% por mais de 5 minutos ou p95 > 2000 ms.
- **CORS**: somente origens listadas em `API_ALLOWED_ORIGINS`. Requisicoes de origens nao autorizadas retornam `403`.
- **LGPD**: dados sensiveis mascarados nos logs; nao ha armazenamento persistente de payloads completos nos proxies.

## Healthcheck (`npm run healthcheck`)

Executa duas chamadas na URL base configurada pela variavel `HEALTHCHECK_BASE_URL`:

- `/api/simular-repactuacao`: sucesso esperado `200`. Se o payload contiver `modo: "mock"` significa que as credenciais de producao ainda nao foram informadas.
- `/api/pesquisar-imoveis`:  
  - `200` indica pesquisa habilitada (API ou SIG).  
  - `501` indica que as credenciais SIG nao foram configuradas.  
  - `503` indica ausência de credenciais Prodata para o modo API.

## Colecao Postman

- Arquivos localizados em `postman/`:
  - `iptu2.postman_collection.json`
  - `iptu2.postman_environment.json`
- Variaveis principais: `apiBase`, `user`, `password`, `token`, `cpf`, `inscricaoImobiliaria`, `cci`, `ccp`, `simulacaoId`.
- A request "Autenticacao" inclui script que salva `{{token}}` automaticamente (`pm.environment.set("token", ...)`) para reutilizar nas chamadas subsequentes (obter dados imobiliarios, debitos, simulacao e emissao).
- Ajuste os valores do ambiente antes de executar a colecao. Nunca exponha credenciais em commits.

## Como rodar localmente

1. Copie `.env.example` para `.env` e preencha as variaveis necessarias.
2. Instale dependencias: `npm install`.
3. Inicie o front: `npm run dev` e acesse `http://localhost:5173`.
4. Para validar build/linters:
   - `npm run lint`
   - `npm run build`
5. Opcional: `HEALTHCHECK_BASE_URL=http://localhost:3000 npm run healthcheck` apos levantar os proxies em desenvolvimento.

## Politica de contribucao

- Commits atomicos por feature (proxies, servicos, telas, docs, etc.).
- Evite expor dados sensiveis em commits, issues ou PRs.
- Testes manuais via Postman/Insomnia antes de subir PRs envolvendo integracao real.

