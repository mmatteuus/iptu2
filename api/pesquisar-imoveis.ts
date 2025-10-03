import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";

type SearchPayload = {
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

const SIG_BASE = process.env.PRODATA_SIG_BASE;
const SIG_PATH = process.env.PRODATA_SIG_PATH ?? "/sig/rest/imovelController/pesquisarImoveis";
const SIG_ORIGIN = process.env.PRODATA_SIG_ORIGIN;
const SIG_URL = process.env.PRODATA_SIG_URL;
const SIG_MODULE = process.env.PRODATA_SIG_MODULO ?? "24";
const SIG_AUTH_TOKEN = process.env.PRODATA_SIG_AUTH_TOKEN;
const SIG_HMAC_SECRET = process.env.PRODATA_SIG_HMAC_SECRET;

function respond501(res: VercelResponse) {
  return res.status(501).json({
    message: "Pesquisa por CPF/CNPJ requer credenciais. Use CCI/CCP/DUAM."
  });
}

function sanitizeDocument(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function parseBody(req: VercelRequest) {
  const raw = req.body;
  if (typeof raw === "object" && raw !== null) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      console.warn("[pesquisar-imoveis] JSON parse error", error);
      return {};
    }
  }
  return {};
}

function buildSignature({ method, path, timestamp, body }: { method: string; path: string; timestamp: string; body: string }) {
  if (!SIG_HMAC_SECRET) return undefined;
  const hashedBody = crypto.createHash("sha256").update(body).digest("hex");
  const stringToSign = `${method.toUpperCase()}${path}${timestamp}${hashedBody}`;
  return crypto.createHmac("sha256", SIG_HMAC_SECRET).update(stringToSign).digest("hex");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Método não suportado" });
  }

  if (!SIG_BASE || !SIG_ORIGIN || !SIG_URL || !SIG_AUTH_TOKEN || !SIG_HMAC_SECRET) {
    return respond501(res);
  }

  const body = parseBody(req);
  const cpfCNPJ = sanitizeDocument(body.cpfCNPJ);

  if (!cpfCNPJ) {
    return res.status(400).json({ message: "Informe um CPF ou CNPJ válido." });
  }

  const payload: SearchPayload = {
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

  const bodyString = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const targetUrl = new URL(SIG_PATH, SIG_BASE).toString();

  const headers: Record<string, string> = {
    "Content-Type": "application/json;charset=UTF-8",
    "x-client-id": "sig-frontend",
    "x-id": "sig",
    "x-modulo": SIG_MODULE,
    "x-origin": SIG_ORIGIN,
    "x-url": SIG_URL,
    "x-timestamp": timestamp,
    "x-auth-token": SIG_AUTH_TOKEN
  };

  const signature = buildSignature({ method: "POST", path: SIG_PATH, timestamp, body: bodyString });
  if (signature) {
    headers["x-request-signature"] = signature;
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: bodyString
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ message: "Falha na consulta", details: text });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error("[pesquisar-imoveis]", error);
    return res.status(502).json({ message: "Erro ao contactar SIG" });
  }
}
