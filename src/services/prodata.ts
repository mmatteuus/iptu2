import { nanoid } from "nanoid";

export type Identificacao = {
  inscricaoImobiliaria?: string;
  cci?: string;
  ccp?: string;
};

export type DebitoResumo = {
  id: string;
  descricao?: string;
  situacao?: string;
  vencimento?: string;
  valorPrincipal?: number;
  valorAtualizado?: number;
};

export type DebitoImovel = {
  proprietario?: string;
  documento?: string;
  inscricao?: string;
  cci?: string;
  ccp?: string;
  endereco?: string;
  debitos: DebitoResumo[];
  totais: {
    quantidade: number;
    valorTotal: number;
  };
  raw: unknown;
};

export type DebitosResponse = {
  correlationId?: string;
  resultados: DebitoImovel[];
  original: unknown;
};

export type DebitosParams = {
  cpf?: string;
  cnpj?: string;
  inscricao?: string;
  cci?: string;
  ccp?: string;
};

export type SimulacaoPayload = {
  identificacao: Identificacao;
  itensSelecionados: Array<{ id: string; valor?: number }>;
  opcoes: {
    parcelas: number;
    vencimento: string;
  };
};

export type Parcela = {
  parcela: number;
  vencimento: string;
  valorDivida: number;
  valorJuros: number;
  valorMulta: number;
  valorCorrecao: number;
  valorExpediente: number;
  valorSaldoDevedor?: number;
};

export type SimulacaoResult = {
  parcelas: Parcela[];
  simulacaoId?: string;
  message?: string;
  isMock?: boolean;
  correlationId?: string;
  raw: unknown;
};

export type EmitirPayload = {
  simulacaoId: string;
  confirmacao?: boolean;
  [key: string]: unknown;
};

export type EmissaoResult = {
  sucesso: boolean;
  numeroTitulo?: string;
  linhaDigitavel?: string;
  urlBoleto?: string;
  codigoBarras?: string;
  vencimento?: string;
  valorTotal?: number;
  correlationId?: string;
  raw: unknown;
};

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toStringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return "";
}

function pickFromKeys<T>(
  record: Record<string, unknown>,
  keys: string[],
  transform: (value: unknown) => T,
  fallback: T
) {
  for (const key of keys) {
    if (key in record) {
      const value = transform(record[key]);
      if (value !== fallback) return value;
    }
  }
  return fallback;
}

function parseResponsePayload(response: Response) {
  return response
    .text()
    .then((text) => {
      const isJson = response.headers.get("content-type")?.includes("application/json");
      if (!isJson) return text;
      if (!text) return {};
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    })
    .catch(() => undefined);
}

function buildError(message: string, payload: unknown, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number; details?: unknown }).status = status;
  (error as Error & { status?: number; details?: unknown }).details = payload;
  return error;
}

function extractParcelas(payload: unknown): Parcela[] {
  const root =
    payload && typeof payload === "object"
      ? ((payload as Record<string, unknown>).resultado as unknown) ?? payload
      : payload;

  const items: unknown[] = Array.isArray(root)
    ? root
    : root && typeof root === "object"
      ? Array.isArray((root as Record<string, unknown>).parcelas)
        ? ((root as Record<string, unknown>).parcelas as unknown[])
        : Array.isArray((root as Record<string, unknown>).parcelasSimuladas)
          ? ((root as Record<string, unknown>).parcelasSimuladas as unknown[])
          : Array.isArray((root as Record<string, unknown>).listaParcelas)
            ? ((root as Record<string, unknown>).listaParcelas as unknown[])
            : []
      : [];

  return items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        parcela: pickFromKeys(record, ["parcela", "numeroParcela", "numero"], (value) => toNumber(value) ?? 0, 0),
        vencimento: pickFromKeys(record, ["vencimento", "dataVencimento"], toStringValue, ""),
        valorDivida: pickFromKeys(record, ["valorDivida", "valorPrincipal"], (value) => toNumber(value) ?? 0, 0),
        valorJuros: pickFromKeys(record, ["valorJuros"], (value) => toNumber(value) ?? 0, 0),
        valorMulta: pickFromKeys(record, ["valorMulta"], (value) => toNumber(value) ?? 0, 0),
        valorCorrecao: pickFromKeys(
          record,
          ["valorCorrecao", "valorCorrecaoMonetaria"],
          (value) => toNumber(value) ?? 0,
          0
        ),
        valorExpediente: pickFromKeys(record, ["valorExpediente", "valorTaxa"], (value) => toNumber(value) ?? 0, 0),
        valorSaldoDevedor: pickFromKeys(record, ["valorSaldoDevedor", "saldoDevedor"], (value) => toNumber(value) ?? 0, 0)
      };
    });
}

function extractSimulacaoId(payload: unknown) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const value =
      record.simulacaoId ?? record.idSimulacao ?? record.id ?? record.identificadorSimulacao ?? record.simulacao;
    const text = toStringValue(value).trim();
    return text.length ? text : undefined;
  }
  return undefined;
}

function unwrapResultado(payload: unknown) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if ("resultado" in record) return record.resultado;
  }
  return payload;
}

function collectCorrelationId(payload: unknown) {
  if (payload && typeof payload === "object" && "correlationId" in payload) {
    const value = (payload as Record<string, unknown>).correlationId;
    if (typeof value === "string") return value;
  }
  return undefined;
}

export async function consultarDebitos(params: DebitosParams): Promise<DebitosResponse> {
  const query = new URLSearchParams();
  if (params.inscricao) query.set("inscricao", params.inscricao);
  if (params.cci) query.set("cci", params.cci);
  if (params.ccp) query.set("ccp", params.ccp);
  if (params.cpf) query.set("cpf", params.cpf);
  if (params.cnpj) query.set("cnpj", params.cnpj);

  const response = await fetch(`/api/debitos?${query.toString()}`, { method: "GET" });
  const data = await parseResponsePayload(response);

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data ? (data as Record<string, unknown>).message : undefined) ??
      `Falha na consulta de debitos (${response.status})`;
    throw buildError(toStringValue(message) || "Falha na consulta de debitos", data, response.status);
  }

  const correlationId = collectCorrelationId(data);
  const resultadosRaw =
    data && typeof data === "object" && "resultados" in data ? ((data as Record<string, unknown>).resultados as unknown[]) : [];

  const resultados: DebitoImovel[] = Array.isArray(resultadosRaw)
    ? resultadosRaw.map((entry) => {
        if (!entry || typeof entry !== "object") {
          return {
            debitos: [],
            totais: { quantidade: 0, valorTotal: 0 },
            raw: entry
          };
        }
        const record = entry as Record<string, unknown>;
        const debitosRaw = Array.isArray(record.debitos) ? (record.debitos as DebitoResumo[]) : [];

        const debitos = debitosRaw.map((item) => ({
          id: item.id ?? nanoid(8),
          descricao: item.descricao,
          situacao: item.situacao,
          vencimento: item.vencimento,
          valorPrincipal: item.valorPrincipal,
          valorAtualizado: item.valorAtualizado
        }));

        const total =
          typeof record.totais === "object" && record.totais !== null
            ? Number((record.totais as Record<string, unknown>).valorTotal) || 0
            : debitos.reduce((sum, debito) => sum + (debito.valorAtualizado ?? debito.valorPrincipal ?? 0), 0);

        return {
          proprietario: typeof record.proprietario === "string" ? record.proprietario : undefined,
          documento: typeof record.documento === "string" ? record.documento : undefined,
          inscricao: typeof record.inscricao === "string" ? record.inscricao : undefined,
          cci: typeof record.cci === "string" ? record.cci : undefined,
          ccp: typeof record.ccp === "string" ? record.ccp : undefined,
          endereco: typeof record.endereco === "string" ? record.endereco : undefined,
          debitos,
          totais: {
            quantidade:
              typeof record.totais === "object" && record.totais !== null
                ? Number((record.totais as Record<string, unknown>).quantidade) || debitos.length
                : debitos.length,
            valorTotal: Number(total || 0)
          },
          raw: record
        };
      })
    : [];

  return {
    correlationId,
    resultados,
    original: data
  };
}

export async function simular(payload: SimulacaoPayload): Promise<SimulacaoResult> {
  const response = await fetch("/api/simulacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await parseResponsePayload(response);

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data ? (data as Record<string, unknown>).message : undefined) ??
      `Falha na simulacao (${response.status})`;
    throw buildError(toStringValue(message) || "Falha na simulacao", data, response.status);
  }

  if (data && typeof data === "object" && "modo" in data && (data as Record<string, unknown>).modo === "mock") {
    const message =
      (data as Record<string, unknown>).message?.toString() ??
      "Simulacao em modo demonstracao. Configure credenciais para ativar o modo real.";
    return { parcelas: [], simulacaoId: undefined, message, isMock: true, correlationId: collectCorrelationId(data), raw: data };
  }

  const resultado = unwrapResultado(data);
  const parcelas = extractParcelas(resultado);
  const simulacaoId = extractSimulacaoId(resultado);
  const message =
    resultado && typeof resultado === "object" && "message" in resultado
      ? toStringValue((resultado as Record<string, unknown>).message)
      : undefined;

  return {
    parcelas,
    simulacaoId,
    message: message?.trim() || undefined,
    isMock: false,
    correlationId: collectCorrelationId(data),
    raw: resultado
  };
}

export async function emitirSimulacao(payload: EmitirPayload): Promise<EmissaoResult> {
  const response = await fetch("/api/emitir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await parseResponsePayload(response);

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data ? (data as Record<string, unknown>).message : undefined) ??
      `Falha na emissao (${response.status})`;
    throw buildError(toStringValue(message) || "Falha na emissao", data, response.status);
  }

  const resultado = unwrapResultado(data);
  const record = resultado && typeof resultado === "object" ? (resultado as Record<string, unknown>) : {};

  const numeroTitulo = toStringValue(
    record.numeroTitulo ?? record.duam ?? record.numeroDuam ?? record.numeroDocumento ?? record.identificadorTitulo
  ).trim();
  const linhaDigitavel = toStringValue(record.linhaDigitavel ?? record.codigoDigitavel ?? record.linha).trim();
  const urlBoleto = toStringValue(record.urlBoleto ?? record.linkBoleto ?? record.url).trim();
  const codigoBarras = toStringValue(record.codigoBarras ?? record.codBarras).trim();
  const vencimento = toStringValue(record.vencimento ?? record.dataVencimento ?? record.vencimentoTitulo).trim();
  const valorTotal = toNumber(record.valorTotal ?? record.valorTitulo ?? record.valor);

  return {
    sucesso: true,
    numeroTitulo: numeroTitulo || undefined,
    linhaDigitavel: linhaDigitavel || undefined,
    urlBoleto: urlBoleto || undefined,
    codigoBarras: codigoBarras || undefined,
    vencimento: vencimento || undefined,
    valorTotal: valorTotal ?? undefined,
    correlationId: collectCorrelationId(data),
    raw: resultado
  };
}
