import { nanoid } from "nanoid";
import { z } from "zod";
import { hasProdataCredentials } from "./_auth";
import { createHandler } from "./_lib/http";
import { prodataFetch } from "./_lib/prodataFetch";
import { sendProdataError, sendValidationError } from "./_lib/errors";
import { ensureArray, pickFirstValue, sanitizeDigits, sanitizeString } from "./_lib/sanitize";

const DEBITOS_PATH = process.env.PRODATA_API_DEBITOS_PATH ?? "/arrecadacao/debitos";

const QuerySchema = z
  .object({
    cpf: z.string().trim().optional(),
    cnpj: z.string().trim().optional(),
    inscricao: z.string().trim().optional(),
    inscricaoImobiliaria: z.string().trim().optional(),
    cci: z.string().trim().optional(),
    ccp: z.string().trim().optional()
  })
  .refine(
    (value) =>
      Boolean(
        value.cpf ||
          value.cnpj ||
          value.inscricao ||
          value.inscricaoImobiliaria ||
          value.cci ||
          value.ccp
      ),
    { message: "Informe ao menos um identificador: cpf, cnpj, inscricao, cci ou ccp." }
  );

type DebitoItem = {
  id: string;
  descricao?: string;
  situacao?: string;
  vencimento?: string;
  valorPrincipal?: number;
  valorAtualizado?: number;
  selecionavel: boolean;
  raw: Record<string, unknown>;
};

type DebitoImovel = {
  proprietario?: string;
  documento?: string;
  inscricao?: string;
  cci?: string;
  ccp?: string;
  endereco?: string;
  debitos: DebitoItem[];
  totais: {
    quantidade: number;
    valorTotal: number;
  };
  raw: Record<string, unknown>;
};

function normalizeQuery(data: z.infer<typeof QuerySchema>) {
  const cpfDigits = sanitizeDigits(data.cpf);
  const cnpjDigits = sanitizeDigits(data.cnpj);
  const inscricao = sanitizeDigits(data.inscricao ?? data.inscricaoImobiliaria);
  const cci = sanitizeDigits(data.cci);
  const ccp = sanitizeDigits(data.ccp);

  return {
    cpf: cpfDigits && cpfDigits.length >= 11 ? cpfDigits : undefined,
    cnpj: cnpjDigits && cnpjDigits.length >= 14 ? cnpjDigits : undefined,
    inscricao: inscricao || undefined,
    cci: cci || undefined,
    ccp: ccp || undefined
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\./g, "").replace(",", ".");
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

const DEBIT_KEYS = [
  "debitos",
  "listaDebitos",
  "itens",
  "itensSelecionados",
  "titulos",
  "titulosDebito",
  "debito",
  "lista",
  "items"
] as const;

function extractDebitos(record: Record<string, unknown>, depth = 0): Record<string, unknown>[] {
  if (depth > 4) return [];
  for (const key of DEBIT_KEYS) {
    const value = record[key as keyof typeof record];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = extractDebitos(value as Record<string, unknown>, depth + 1);
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizeDebitos(payload: unknown): DebitoImovel[] {
  const entries = ensureArray(payload);

  return entries
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((record) => {
      const proprietario = pickFirstValue(record, ["nomeProprietario", "nomeContribuinte", "proprietario", "nome"]);
      const documento =
        sanitizeDigits(pickFirstValue(record, ["cpf", "cnpj", "cpfCnpj", "documento", "cgc"]) ?? undefined) || undefined;
      const inscricao = pickFirstValue(record, ["inscricao", "inscricaoImobiliaria", "inscricaoMunicipal"]);
      const cci = pickFirstValue(record, ["cci", "codigoCci", "numeroCci"]);
      const ccp = pickFirstValue(record, ["ccp", "codigoCcp", "numeroCcp"]);
      const logradouro = pickFirstValue(record, ["logradouro", "endereco"]);
      const bairro = pickFirstValue(record, ["bairro", "setor"]);
      const debitosRaw = extractDebitos(record);

      const debitos = debitosRaw.map((item) => {
        const identifier =
          pickFirstValue(item, ["id", "idDebito", "codigo", "numeroDocumento", "numeroTitulo", "idTitulo"]) ?? nanoid(8);
        return {
          id: identifier,
          descricao: pickFirstValue(item, ["descricao", "descricaoDebito", "titulo"]),
          situacao: pickFirstValue(item, ["situacao", "status", "situacaoTitulo"]),
          vencimento: pickFirstValue(item, ["vencimento", "dataVencimento", "vencimentoTitulo"]),
          valorPrincipal: toNumber(
            pickFirstValue(item, ["valorPrincipal", "valorOriginal", "valorDebito", "valor"])
          ),
          valorAtualizado: toNumber(
            pickFirstValue(item, ["valorAtualizado", "valorComAcrescimos", "valorAtual", "valorTotal"])
          ),
          selecionavel: true,
          raw: item
        };
      });

      const total = debitos.reduce((acc, debito) => acc + (debito.valorAtualizado ?? debito.valorPrincipal ?? 0), 0);

      return {
        proprietario: proprietario ?? undefined,
        documento,
        inscricao: inscricao ?? undefined,
        cci: cci ?? undefined,
        ccp: ccp ?? undefined,
        endereco: [logradouro, bairro].filter(Boolean).join(" - ") || undefined,
        debitos,
        totais: {
          quantidade: debitos.length,
          valorTotal: Number(total.toFixed(2))
        },
        raw: record
      };
    });
}

export default createHandler(
  {
    route: "debitos",
    methods: ["GET"],
    critical: true
  },
  async ({ req, res, correlationId }) => {
    if (!hasProdataCredentials()) {
      res.status(503).json({ message: "Consulta indisponivel: configure PRODATA_USER/PRODATA_PASSWORD.", correlationId });
      return;
    }

    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.flatten(), correlationId);
      return;
    }

    const query = normalizeQuery(parsed.data);

    if (!query.cpf && !query.cnpj && !query.inscricao && !query.cci && !query.ccp) {
      sendValidationError(res, { message: "Parametros insuficientes." }, correlationId);
      return;
    }

    const params = new URLSearchParams();
    if (query.inscricao) params.set("inscricaoImobiliaria", query.inscricao);
    if (query.cci) params.set("cci", query.cci);
    if (query.ccp) params.set("ccp", query.ccp);
    if (query.cpf) params.set("cpf", query.cpf);
    if (query.cnpj) params.set("cnpj", query.cnpj);

    const path = `${DEBITOS_PATH}?${params.toString()}`;

    try {
      const response = await prodataFetch(path, { method: "GET", correlationId });
      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const payload = isJson && text ? JSON.parse(text) : isJson ? {} : text;

      if (!response.ok) {
        sendProdataError(res, response.status, payload, correlationId);
        return;
      }

      const normalizado = normalizeDebitos(payload);

      res.status(200).json({
        correlationId,
        resultados: normalizado,
        original: payload
      });
    } catch (error) {
      sendProdataError(res, 502, (error as Error).message, correlationId);
    }
  }
);
