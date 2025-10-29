export type SimulacaoReq = {
  tipoDevedor: "I" | "P";
  devedor: number;
  vencimento: string;
  tipoEntrada: "PERCENTUAL" | "VALOR";
  percentualValorEntrada?: number;
  valorParcelas?: number;
  duams?: string;
  tipoSimulacao?: string;
  tipoPesquisa?: number;
  dataInicial?: string;
  dataFinal?: string;
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
  raw: unknown;
};

export type DebitosParams = {
  inscricaoImobiliaria?: string;
  cci?: string;
  ccp?: string;
};

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(typeof value === "string" ? value.replace(/\./g, "").replace(",", ".") : "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return "";
}

function pickFromKeys<T>(record: Record<string, unknown>, keys: string[], transform: (value: unknown) => T, fallback: T) {
  for (const key of keys) {
    if (key in record) {
      const value = transform(record[key]);
      if (value !== fallback) return value;
    }
  }
  return fallback;
}

function extractParcelas(payload: unknown): Parcela[] {
  const items: unknown[] = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? Array.isArray((payload as Record<string, unknown>).parcelas)
        ? ((payload as Record<string, unknown>).parcelas as unknown[])
        : Array.isArray((payload as Record<string, unknown>).parcelasSimuladas)
          ? ((payload as Record<string, unknown>).parcelasSimuladas as unknown[])
          : Array.isArray((payload as Record<string, unknown>).listaParcelas)
            ? ((payload as Record<string, unknown>).listaParcelas as unknown[])
            : []
      : [];

  return items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;

      const parcela = pickFromKeys(record, ["parcela", "numeroParcela", "numero"], (value) => toNumber(value, 0), 0);
      const vencimento = pickFromKeys(
        record,
        ["vencimento", "dataVencimento", "vencimentoParcela"],
        toStringValue,
        ""
      );

      return {
        parcela,
        vencimento,
        valorDivida: pickFromKeys(record, ["valorDivida", "valorPrincipal"], (value) => toNumber(value, 0), 0),
        valorJuros: pickFromKeys(record, ["valorJuros"], (value) => toNumber(value, 0), 0),
        valorMulta: pickFromKeys(record, ["valorMulta"], (value) => toNumber(value, 0), 0),
        valorCorrecao: pickFromKeys(
          record,
          ["valorCorrecao", "valorCorrecaoMonetaria"],
          (value) => toNumber(value, 0),
          0
        ),
        valorExpediente: pickFromKeys(record, ["valorExpediente", "valorTaxa"], (value) => toNumber(value, 0), 0),
        valorSaldoDevedor: pickFromKeys(
          record,
          ["valorSaldoDevedor", "saldoDevedor"],
          (value) => toNumber(value, 0),
          0
        )
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

function parseResponsePayload(response: Response) {
  return response
    .text()
    .then((text) => {
      const isJson = response.headers.get("content-type")?.includes("application/json");
      if (!isJson) return text;
      if (!text) return {};
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
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

function extractEmissaoInfo(payload: unknown): Partial<EmissaoResult> {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;

  const numeroTitulo = toStringValue(
    record.numeroTitulo ?? record.duam ?? record.numeroDuam ?? record.numeroDocumento ?? record.identificadorTitulo
  ).trim();
  const linhaDigitavel = toStringValue(record.linhaDigitavel ?? record.codigoDigitavel ?? record.linha).trim();
  const urlBoleto = toStringValue(record.urlBoleto ?? record.linkBoleto ?? record.url).trim();
  const codigoBarras = toStringValue(record.codigoBarras ?? record.codBarras).trim();
  const vencimento = toStringValue(record.vencimento ?? record.dataVencimento ?? record.vencimentoTitulo).trim();
  const valorTotal = toNumber(record.valorTotal ?? record.valorTitulo ?? record.valor, NaN);

  return {
    numeroTitulo: numeroTitulo || undefined,
    linhaDigitavel: linhaDigitavel || undefined,
    urlBoleto: urlBoleto || undefined,
    codigoBarras: codigoBarras || undefined,
    vencimento: vencimento || undefined,
    valorTotal: Number.isFinite(valorTotal) ? valorTotal : undefined
  };
}

export async function simular(payload: SimulacaoReq): Promise<SimulacaoResult> {
  const response = await fetch("/api/simular-repactuacao", {
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
    return { parcelas: [], simulacaoId: undefined, message, isMock: true, raw: data };
  }

  const parcelas = extractParcelas(data);
  const simulacaoId = extractSimulacaoId(data);
  const message =
    data && typeof data === "object" && "message" in data ? toStringValue((data as Record<string, unknown>).message) : undefined;

  return {
    parcelas,
    simulacaoId,
    message: message?.trim() || undefined,
    isMock: false,
    raw: data
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

  const extracted = extractEmissaoInfo(data);

  return {
    sucesso: true,
    ...extracted,
    raw: data
  };
}

export async function consultarDebitos(params: DebitosParams): Promise<unknown> {
  const query = new URLSearchParams();
  if (params.inscricaoImobiliaria) query.set("inscricaoImobiliaria", params.inscricaoImobiliaria);
  if (params.cci) query.set("cci", params.cci);
  if (params.ccp) query.set("ccp", params.ccp);

  const response = await fetch(`/api/debitos?${query.toString()}`, { method: "GET" });
  const data = await parseResponsePayload(response);

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data ? (data as Record<string, unknown>).message : undefined) ??
      `Falha na consulta de debitos (${response.status})`;
    throw buildError(toStringValue(message) || "Falha na consulta de debitos", data, response.status);
  }

  return data;
}

