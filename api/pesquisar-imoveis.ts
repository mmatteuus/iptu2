import crypto from "node:crypto";
import { hasProdataCredentials } from "./_auth";
import { createHandler, readJsonBody } from "./_lib/http";
import { prodataFetch } from "./_lib/prodataFetch";
import { sendProdataError } from "./_lib/errors";
import { logWarn } from "./_lib/logger";
import { ensureArray, pickFirstValue, sanitizeDigits, sanitizeString } from "./_lib/sanitize";

type SigPayload = {
  tipo_consulta: number;
  tipo_certidao: number;
  cpf_cnpj_imovel_obrigatorio: "S" | "N";
  cpfCNPJ: string;
  tabela: Record<string, unknown>;
  isConsultaText: boolean;
  nomeTelaAtualAutocomplete: null;
  propriedadeValor: string;
  propriedadeDescricao: string;
  moduloAtual: string;
  descricaoModuloAtual: string;
};

type SearchRequest = {
  cpfCNPJ?: string;
  inscricao?: string;
  cci?: string;
  ccp?: string;
};

type NormalizedImovel = {
  nome?: string;
  cgc?: string;
  cci?: string;
  ccp?: string;
  inscricao?: string;
  logradouro?: string;
  bairro?: string;
  origem: "api" | "sig";
};

type PesquisaMode = "api" | "sig" | "auto";

const RAW_MODE = (process.env.PRODATA_PESQUISA_SOURCE ?? "auto").toLowerCase() as PesquisaMode;

function resolveMode(): "api" | "sig" {
  if (RAW_MODE === "api" || RAW_MODE === "sig") return RAW_MODE;
  return hasProdataCredentials() ? "api" : "sig";
}

const SIG_BASE = process.env.PRODATA_SIG_BASE;
const SIG_PATH = process.env.PRODATA_SIG_PATH ?? "/sig/rest/imovelController/pesquisarImoveis";
const SIG_ORIGIN = process.env.PRODATA_SIG_ORIGIN;
const SIG_URL = process.env.PRODATA_SIG_URL;
const SIG_MODULE = process.env.PRODATA_SIG_MODULO ?? "24";
const SIG_AUTH_TOKEN = process.env.PRODATA_SIG_AUTH_TOKEN;
const SIG_HMAC_SECRET = process.env.PRODATA_SIG_HMAC_SECRET;

const API_PESQUISA_PATH = process.env.PRODATA_API_PESQUISA_PATH ?? "/arrecadacao/obterDadosImobiliario";

function normalizeApiPayload(payload: unknown): NormalizedImovel[] {
  const entries = ensureArray(payload);

  return entries
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const documento = pickFirstValue(record, ["cpf", "cnpj", "cpfCnpj", "documento", "cpfCnpjProprietario", "cgc"]);
      const logradouro =
        pickFirstValue(record, ["logradouro", "endereco", "descricaoEndereco"]) ??
        pickFirstValue(record, ["logradouroCobranca"]);

      return {
        nome: pickFirstValue(record, ["nome", "nomeProprietario", "proprietario", "nomeContribuinte"]),
        cgc: documento ? sanitizeDigits(documento) : undefined,
        cci: pickFirstValue(record, ["cci", "codigoCci", "numeroCci", "cadastroCci"]),
        ccp: pickFirstValue(record, ["ccp", "codigoCcp", "numeroCcp", "cadastroCcp"]),
        inscricao: pickFirstValue(record, ["inscricao", "inscricaoImobiliaria", "inscricaoMunicipal"]),
        logradouro,
        bairro: pickFirstValue(record, ["bairro", "bairroCobranca", "nomeBairro"]),
        origem: "api" as const
      };
    })
    .filter((item) => item.nome || item.cci || item.ccp || item.inscricao || item.cgc);
}

function normalizeSigPayload(payload: unknown): NormalizedImovel[] {
  const entries = Array.isArray(payload) ? payload : [];

  return entries
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const documento = pickFirstValue(record, ["cgc", "cpfCnpj"]);
      return {
        nome: pickFirstValue(record, ["nome", "nomeContribuinte", "proprietario"]),
        cgc: documento ? sanitizeDigits(documento) : undefined,
        cci: pickFirstValue(record, ["cci"]),
        ccp: pickFirstValue(record, ["ccp"]),
        inscricao: pickFirstValue(record, ["inscricao", "inscricaoImobiliaria"]),
        logradouro: pickFirstValue(record, ["logradouro", "endereco"]),
        bairro: pickFirstValue(record, ["bairro"]),
        origem: "sig" as const
      };
    });
}

function ensureSigCredenciais() {
  if (!SIG_BASE || !SIG_ORIGIN || !SIG_URL || !SIG_AUTH_TOKEN || !SIG_HMAC_SECRET) {
    return false;
  }
  return true;
}

function buildSigPayload(cpfCNPJ: string): SigPayload {
  return {
    tipo_consulta: 1,
    tipo_certidao: 1,
    cpf_cnpj_imovel_obrigatorio: "S",
    cpfCNPJ,
    tabela: {},
    isConsultaText: false,
    nomeTelaAtualAutocomplete: null,
    propriedadeValor: "cci",
    propriedadeDescricao: "cci",
    moduloAtual: SIG_MODULE,
    descricaoModuloAtual: "servicosonline"
  };
}

function buildSignature({ method, path, timestamp, body }: { method: string; path: string; timestamp: string; body: string }) {
  if (!SIG_HMAC_SECRET) return undefined;
  const hashedBody = crypto.createHash("sha256").update(body).digest("hex");
  const stringToSign = `${method.toUpperCase()}${path}${timestamp}${hashedBody}`;
  return crypto.createHmac("sha256", SIG_HMAC_SECRET).update(stringToSign).digest("hex");
}

function missingApiParams({ cpfCNPJ, inscricao, cci, ccp }: SearchRequest) {
  return !sanitizeDigits(cpfCNPJ) && !sanitizeString(inscricao) && !sanitizeString(cci) && !sanitizeString(ccp);
}

async function handleApiSearch(body: SearchRequest, correlationId: string) {
  if (!hasProdataCredentials()) {
    const error = new Error("Credenciais PRODATA_USER e PRODATA_PASSWORD ausentes.");
    (error as Error & { status?: number }).status = 503;
    throw error;
  }

  if (missingApiParams(body)) {
    const error = new Error("Informe ao menos um parametro de busca.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const doc = sanitizeDigits(body.cpfCNPJ);
  const params = new URLSearchParams();

  if (doc.length === 11) params.set("cpf", doc);
  if (doc.length === 14) params.set("cnpj", doc);

  const inscricao = sanitizeString(body.inscricao);
  const cci = sanitizeString(body.cci);
  const ccp = sanitizeString(body.ccp);

  if (inscricao) params.set("inscricaoImobiliaria", sanitizeDigits(inscricao));
  if (cci) params.set("cci", sanitizeDigits(cci));
  if (ccp) params.set("ccp", sanitizeDigits(ccp));

  const path = `${API_PESQUISA_PATH}?${params.toString()}`;

  const response = await prodataFetch(path, { method: "GET", correlationId });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson && text ? JSON.parse(text) : isJson ? {} : text;

  return { response, payload, normalized: normalizeApiPayload(payload) };
}

async function handleSigSearch(body: SearchRequest, correlationId: string) {
  if (!ensureSigCredenciais()) {
    const error = new Error("Pesquisa por CPF/CNPJ requer credenciais SIG. Configure PRODATA_SIG_*.");
    (error as Error & { status?: number }).status = 501;
    throw error;
  }

  const cpfCNPJ = sanitizeDigits(body.cpfCNPJ);

  if (!cpfCNPJ) {
    const error = new Error("Informe um CPF ou CNPJ valido.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const payload = buildSigPayload(cpfCNPJ);
  const bodyString = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const targetUrl = new URL(SIG_PATH, SIG_BASE).toString();

  const headers: Record<string, string> = {
    "Content-Type": "application/json;charset=UTF-8",
    "x-client-id": "sig-frontend",
    "x-id": "sig",
    "x-modulo": SIG_MODULE,
    "x-origin": SIG_ORIGIN as string,
    "x-url": SIG_URL as string,
    "x-timestamp": timestamp,
    "x-auth-token": SIG_AUTH_TOKEN as string
  };

  const signature = buildSignature({ method: "POST", path: SIG_PATH, timestamp, body: bodyString });
  if (signature) {
    headers["x-request-signature"] = signature;
  }

  const response = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: bodyString
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payloadJson = isJson && text ? JSON.parse(text) : isJson ? {} : text;

  if (!response.ok) {
    const status = response.status >= 400 ? response.status : 502;
    const error = new Error("Falha na consulta ao SIG.");
    (error as Error & { status?: number; details?: unknown }).status = status;
    (error as Error & { status?: number; details?: unknown }).details = payloadJson;
    throw error;
  }

  return {
    normalized: normalizeSigPayload(payloadJson),
    payload: payloadJson
  };
}

export default createHandler(
  {
    route: "pesquisar-imoveis",
    methods: ["POST"]
  },
  async ({ req, res, correlationId }) => {
    const body = await readJsonBody<SearchRequest>(req);
    const mode = resolveMode();

    try {
      if (mode === "sig") {
        const result = await handleSigSearch(body, correlationId);
        res.status(200).json(result.normalized);
        return;
      }

      const { response, payload, normalized } = await handleApiSearch(body, correlationId);
      if (!response.ok) {
        if (response.status === 404) {
          res.status(404).json({ message: "Registro nao encontrado.", correlationId });
          return;
        }
        sendProdataError(res, response.status, payload, correlationId);
        return;
      }

      res.status(200).json(normalized);
    } catch (error) {
      const err = error as Error & { status?: number; details?: unknown };
      const status = err.status ?? 502;

      if (mode === "sig" && status === 501) {
        res.status(501).json({ message: "Pesquisa por CPF/CNPJ requer credenciais. Use CCI/CCP/DUAM.", correlationId });
        return;
      }

      if (mode === "sig") {
        res.status(status).json({ message: err.message, details: err.details, correlationId });
        return;
      }

      if (status === 503) {
        res.status(503).json({ message: "Pesquisa indisponivel: configure PRODATA_USER/PRODATA_PASSWORD.", correlationId });
        return;
      }

      if (status === 400) {
        res.status(400).json({ message: "Dados invalidos. Informe um parametro de busca.", correlationId });
        return;
      }

      logWarn("[pesquisar-imoveis] falha inesperada", { correlationId, message: err.message });
      res.status(502).json({ message: "Servico indisponivel. Tente novamente em alguns minutos.", correlationId });
    }
  }
);
