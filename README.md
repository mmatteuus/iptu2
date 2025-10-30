# IPTU2 - Prefeitura de Araguaina

Aplicacao web que integra o front-end React + Vite com a API oficial da Prodata (`sigintegracaorest`) para consulta de debitos imobiliarios, simulacao de parcelamentos e emissao de DUAM/boleto.

## Stack

- Node.js >= 18 (fetch global nativo)
- Vite + React 18 + TypeScript
- Funcoes serverless em `/api` (Vercel ou compatível)
- Zod para validacao runtime
- ESLint + Prettier + Husky + lint-staged

## Estrutura principal

```
api/
 ├─ _auth.ts              # Cache de token Bearer (renova T-60 s)
 ├─ _lib/                 # Helpers HTTP, rate limit, logs, métricas
 ├─ debitos.ts            # GET /api/debitos
 ├─ emitir.ts             # POST /api/emitir
 └─ simulacao.ts          # POST /api/simulacao
postman/                  # Colecao + ambiente para testes manuais
scripts/healthcheck.mjs   # Healthcheck pos-deploy
src/
 ├─ context/              # Estado global (identificacao + debitos)
 ├─ pages/                # /pesquisa e /simulacao
 ├─ services/prodata.ts   # Clientes fetch para os proxies
 └─ utils/                # Formatadores (moeda, data, documento)
```

## Variaveis de ambiente

```
# Prodata (obrigatorio)
PRODATA_API_BASE=https://araguaina.prodataweb.inf.br/sigintegracaorest
PRODATA_USER=
PRODATA_PASSWORD=

# (Opcional) fallback SIG (UI privada)
PRODATA_SIG_BASE=
PRODATA_SIG_PATH=
PRODATA_SIG_AUTH_TOKEN=
PRODATA_SIG_HMAC_SECRET=
PRODATA_SIG_ORIGIN=
PRODATA_SIG_MODULO=

# Ajustes de rotas (caso o Swagger utilize nomes diferentes)
# PRODATA_API_DEBITOS_PATH=/arrecadacao/debitos
# PRODATA_API_SIMULACAO_PATH=/arrecadacao/simulacao
# PRODATA_API_EMITIR_PATH=/arrecadacao/emitir

# Seguranca
# API_ALLOWED_ORIGINS=https://seu-front.oficial
# RATE_LIMIT_IP=60
# RATE_LIMIT_IP_WINDOW_MS=60000
# RATE_LIMIT_CRITICAL=10
# RATE_LIMIT_CRITICAL_WINDOW_MS=60000

# Links expostos na UI
VITE_WHATSAPP_PREFEITURA_URL=https://wa.me/5563...
VITE_WHATSAPP_ASSINATURA_URL=https://wa.me/5563...
```

> Nunca commite `.env` com credenciais. Utilize Secret Manager do provedor. Exemplo completo em `.env.example`.

## Proxies `/api`

| Rota | Metodo | Validacao | Descricao |
|------|--------|-----------|-----------|
| `/api/debitos` | GET | Zod (cpf/cnpj/inscricao/cci/ccp) | Consulta debitos na Prodata e normaliza dados de proprietario, endereco, itens e totais. Retorna `{ correlationId, resultados[], original }`. 422 quando parametros invalidos; 503 se credenciais ausentes. |
| `/api/simulacao` | POST | Zod (identificacao + itensSelecionados + opcoes) | Dispara a simulacao oficial (`/arrecadacao/simulacao` ou fallback). Renova token Bearer automaticamente e devolve `{ correlationId, resultado }`. Sem credenciais responde `200` com `modo: "mock"`. |
| `/api/emitir` | POST | Zod (simulacaoId obrigatorio, confirmacao default true) | Efetiva a emissao do DUAM/boleto. Sucesso responde `201` com `{ correlationId, resultado }`. Conflito (titulo existente) responde `409`. |

Caracteristicas comuns:

- Autenticacao dinamica com cache em memoria e retry automatico em 401.
- Rate limit por IP (60 req/min) e por rota critica (10 req/min) configuravel.
- CORS restrito (`API_ALLOWED_ORIGINS`), HTTPS em producao.
- `x-correlation-id` aceito e ecoado.
- Logs estruturados em JSON com mascaramento de CPF/CNPJ/tokens.
- Metricas em memoria (contagem, taxa de erro, P95) com alerta simples em log.

## Fluxos do front

### `/pesquisa`

1. Usuario informa CPF/CNPJ e/ou inscricao/CCI/CCP.
2. Front chama `GET /api/debitos`.
3. Exibe proprietario, endereco e tabela de debitos com checkbox.
4. Botao “Ir para simulacao” habilita quando >= 1 debito esta selecionado.
5. Erros tratados com mensagens claras (422, 404, 429, 5xx).

### `/simulacao`

1. Lista debitos selecionados (com opcao de remover).
2. Usuario ajusta identificacao (inscricao/CCI/CCP), parcelas (1..10) e vencimento.
3. Envia `POST /api/simulacao` com `{ identificacao, itensSelecionados, opcoes }`.
4. Exibe ate 48 parcelas, exporta CSV/PDF e calcula total.
5. “Aceitar simulacao” aciona `POST /api/emitir`, exibindo numero do titulo, linha digitavel, codigo de barras, link do boleto e vencimento.
6. Mensagens padrao para 401/409/422/429/5xx.

## Healthcheck

`npm run healthcheck` executa:

1. `POST /api/simulacao` (payload ficticio).  
   - `200` + `modo: "mock"` => credenciais Prodata nao configuradas.  
   - `>=500` => falha (exit code 1).
2. `GET /api/debitos?inscricao=000000000000`.  
   - `200` => rota operacional.  
   - `422/400` => validacao (esperado sem dados reais).  
   - `501/503` => indica falta de credenciais opcionais/obrigatorias.

## Postman / Insomnia

Colecao e ambiente em `postman/` com os 5 cenarios basicos:

1. Autenticacao (`POST /autenticacao`) – pre-request script salva `{{token}}`.
2. Debitos (`GET /arrecadacao/debitos`).
3. Simulacao (`POST /arrecadacao/simulacao`).
4. Emissao (`POST /arrecadacao/emitir`).
5. Segunda via (placeholder para futuras integracoes).

Ajuste as variaveis antes de executar. Nao compartilhe tokens reais.

## Seguranca e LGPD

- Apenas HTTPS em producao.
- CORS restrito a dominios autorizados.
- Tokens/senhas mascarados nos logs; sem armazenamento de payloads sensiveis.
- Rate limiting ativo para evitar abuso.
- Siga as orientacoes publicas da ANPD/CGU para sensibilizacao e tratamento de dados pessoais.

## Scripts

- `npm run dev` – servidor Vite.
- `npm run build` – `tsc -b` + `vite build`.
- `npm run lint` – ESLint em `src`.
- `npm run healthcheck` – valida deploy (defina `HEALTHCHECK_BASE_URL`).

## Como rodar

1. `cp .env.example .env` e preencha credenciais.
2. `npm install`.
3. `npm run dev` e acesse http://localhost:5173.
4. `npm run lint` / `npm run build` antes de abrir PR.

## Checklist de validacao manual

- Consultar debitos por CPF/CNPJ/inscricao/CCI/CCP.
- Selecionar itens e gerar simulacao (parcelas 1..10).
- Emitir DUAM e verificar retorno (linha digitavel, link, vencimento).
- Testar expiracao de token (rotas se auto-reautenticam).
- Verificar conflitos (emissao duplicada => 409).
- Monitorar logs mascarados e metricas no ambiente.

