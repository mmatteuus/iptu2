import { nanoid } from "nanoid";

export type Identificacao = {
  inscricaoImobiliaria?: string;
  cci?: string;
  ccp?: string;
};

export type ImovelResumo = {
  inscricao?: string;
  cci?: string;
  ccp?: string;
  endereco?: string;
  situacao?: string;
};

export type DebitoItem = {
  id: string;
  origem?: string;
  exercicio?: number;
  principal: number;
  multa: number;
  juros: number;
  outros: number;
  total: number;
};

export type DebitosDetalhe = {
  proprietario?: string;
  imovel: {
    inscricao?: string;
    endereco?: string;
    cci?: string;
    ccp?: string;
    situacao?: string;
  };
  itens: DebitoItem[];
  totais: {
    principal: number;
    acessorios: number;
    total: number;
  };
  correlationId?: string;
};

export type SimulacaoPayload = {
  identificacao: Identificacao;
  itensSelecionados: Array<{ id: string }>;
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
    const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toStringValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return "";
}

function pickFromRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in record) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number") return value.toString();
    }
  }
  return undefined;
}

async function parseResponsePayload(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return text;
  }
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    return text;
  }
}

function buildError(message: string, payload: unknown, status: number) {
  const error = new Error(message);
  (error as Error & { status?: number; details?: unknown }).status = status;
  (error as Error & { status?: number; details?: unknown }).details = payload;
  return error;
}

function collectCorrelationId(payload: unknown) {
  if (payload && typeof payload === "object" && "correlationId" in payload) {
    const value = (payload as Record<string, unknown>).correlationId;
    if (typeof value === "string") return value;
  }
  return undefined;
}

function unwrap(payload: unknown, key: string) {
  if (payload && typeof payload === "object" && key in (payload as Record<string, unknown>)) {
    return (payload as Record<string, unknown>)[key];
  }
  return payload;
}

export async function buscarImoveisPorDocumento(cpfCnpj: string): Promise<ImovelResumo[]> {
  const digits = cpfCnpj.replace(/\D/g, "");
  const searchParam = digits.length === 14 ? `cnpj=${digits}` : `cpf=${digits}`;

  const response = await fetch(`/api/imoveis?${searchParam}`, { method: "GET" });
  const data = await parseResponsePayload(response);

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data ? (data as Record<string, unknown>).message : undefined) ??
      `Falha na consulta de imoveis (${response.status})`;
    throw buildError(toStringValue(message) || "Falha na consulta de imoveis", data, response.status);
  }

  const imoveis =
    data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).imoveis)
      ? ((data as Record<string, unknown>).imoveis as ImovelResumo[])
      : [];

  return imoveis;
}

export async function buscarDebitos(params: { inscricao?: string; cci?: string; ccp?: string }): Promise<DebitosDetalhe> {
  const query = new URLSearchParams();
  if (params.inscricao) query.set("inscricao", params.inscricao);
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

  const resultado = unwrap(data, "resultado");

  if (resultado && typeof resultado === "object") {
    const record = resultado as Record<string, unknown>;
    const itens = Array.isArray(record.itens)
      ? (record.itens as Array<Record<string, unknown>>).map((item) => {
          const principal = toNumber(item.principal ?? item.valorPrincipal ?? item.valorOriginal) ?? 0;
          const multa = toNumber(item.multa ?? item.valorMulta) ?? 0;
          const juros = toNumber(item.juros ?? item.valorJuros) ?? 0;
          const correcao = toNumber(item.valorCorrecao ?? item.correcao ?? item.valorAtualizacao) ?? 0;
          const honorarios = toNumber(item.valorHonorarios ?? item.honorarios) ?? 0;
          const custas = toNumber(item.valorCustas ?? item.custas) ?? 0;
          const outrosInformados = toNumber(item.outros ?? item.valorOutros) ?? 0;
          const outros = (outrosInformados ?? 0) + correcao + honorarios + custas;
          const totalInformado = toNumber(item.total ?? item.valorTotal ?? item.valorAtualizado);
          const total = totalInformado ?? principal + multa + juros + outros;

          return {
            id: toStringValue(item.id ?? item.codigo ?? item.numeroDocumento ?? nanoid(8)).trim() || nanoid(8),
            origem: toStringValue(item.origem ?? item.tipo ?? item.natureza).trim() || undefined,
            exercicio: toNumber(item.exercicio ?? item.ano ?? item.anoExercicio) ?? undefined,
            principal: Number(principal.toFixed(2)) ?? 0,
            multa: Number(multa.toFixed(2)) ?? 0,
            juros: Number(juros.toFixed(2)) ?? 0,
            outros: Number(outros.toFixed(2)) ?? 0,
            total: Number(total.toFixed(2))
          } as DebitoItem;
        })
      : [];

    const principalTotal = toNumber((record.totais as Record<string, unknown>)?.principal) ?? itens.reduce((acc, item) => acc + item.principal, 0);
    const acessoriosTotal = toNumber((record.totais as Record<string, unknown>)?.acessorios) ?? itens.reduce((acc, item) => acc + (item.total - item.principal), 0);
    const totalGeral = toNumber((record.totais as Record<string, unknown>)?.total) ?? itens.reduce((acc, item) => acc + item.total, 0);

    return {
      proprietario: toStringValue(record.proprietario ?? "").trim() || undefined,
      imovel: {
        inscricao: toStringValue((record.imovel as Record<string, unknown>)?.inscricao ?? record.inscricao ?? "").trim() || undefined,
        endereco: toStringValue((record.imovel as Record<string, unknown>)?.endereco ?? record.endereco ?? "").trim() || undefined,
        cci: toStringValue((record.imovel as Record<string, unknown>)?.cci ?? record.cci ?? "").trim() || undefined,
        ccp: toStringValue((record.imovel as Record<string, unknown>)?.ccp ?? record.ccp ?? "").trim() || undefined,
        situacao: toStringValue((record.imovel as Record<string, unknown>)?.situacao ?? record.situacao ?? "").trim() || undefined
      },
      itens,
      totais: {
        principal: Number(principalTotal.toFixed(2)),
        acessorios: Number(acessoriosTotal.toFixed(2)),
        total: Number(totalGeral.toFixed(2))
      },
      correlationId: collectCorrelationId(data)
    };
  }

  return {
    proprietario: undefined,
    imovel: {},
    itens: [],
    totais: { principal: 0, acessorios: 0, total: 0 },
    correlationId: collectCorrelationId(data)
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
    return {
      parcelas: [],
      simulacaoId: undefined,
      message,
      isMock: true,
      correlationId: collectCorrelationId(data),
      raw: data
    };
  }

  const resultado = unwrap(data, "resultado");
  const parcelasPayload = unwrap(resultado, "parcelas");
  const parcelas: Parcela[] = Array.isArray(parcelasPayload)
    ? (parcelasPayload as unknown[]).map((item) => {
        if (!item || typeof item !== "object") {
          return {
            parcela: 0,
            vencimento: "",
            valorDivida: 0,
            valorJuros: 0,
            valorMulta: 0,
            valorCorrecao: 0,
            valorExpediente: 0
          };
        }
        const record = item as Record<string, unknown>;
        return {
          parcela: Number(record.parcela ?? record.numero ?? record.numeroParcela ?? 0),
          vencimento: toStringValue(record.vencimento ?? record.dataVencimento ?? ""),
          valorDivida: toNumber(record.valorDivida ?? record.valorPrincipal ?? 0) ?? 0,
          valorJuros: toNumber(record.valorJuros ?? 0) ?? 0,
          valorMulta: toNumber(record.valorMulta ?? 0) ?? 0,
          valorCorrecao: toNumber(record.valorCorrecao ?? record.valorCorrecaoMonetaria ?? 0) ?? 0,
          valorExpediente: toNumber(record.valorExpediente ?? record.valorTaxa ?? 0) ?? 0,
          valorSaldoDevedor: toNumber(record.valorSaldoDevedor ?? record.saldoDevedor ?? undefined)
        };
      })
    : [];

  const simulacaoId =
    resultado && typeof resultado === "object"
      ? pickFromRecord(resultado as Record<string, unknown>, ["simulacaoId", "idSimulacao", "id"])
      : undefined;

  const message =
    resultado && typeof resultado === "object" && "message" in (resultado as Record<string, unknown>)
      ? toStringValue((resultado as Record<string, unknown>).message)
      : undefined;

  return {
    parcelas,
    simulacaoId: simulacaoId?.trim() || undefined,
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

  const resultado = unwrap(data, "resultado");
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
