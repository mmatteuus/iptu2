import { nanoid } from "nanoid";
import { z } from "zod";
import { hasProdataCredentials } from "./_auth";
import { createHandler } from "./_lib/http";
import { prodataFetch } from "./_lib/prodataFetch";
import { sendProdataError, sendValidationError } from "./_lib/errors";
import { ensureArray, pickFirstValue, sanitizeDigits } from "./_lib/sanitize";

const DEBITOS_PATH = process.env.PRODATA_API_DEBITOS_PATH ?? "/arrecadacao/debitos";

const QuerySchema = z
  .object({
    inscricao: z.string().trim().optional(),
    cci: z.string().trim().optional(),
    ccp: z.string().trim().optional()
  })
  .superRefine((value, ctx) => {
    const provided = ["inscricao", "cci", "ccp"].filter((key) => {
      const v = value[key as keyof typeof value];
      return typeof v === "string" && v.trim().length > 0;
    });

    if (provided.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe inscricao, CCI ou CCP.",
        path: []
      });
    } else if (provided.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe apenas um identificador por vez (inscricao, CCI ou CCP).",
        path: []
      });
    }
  });

type DebitoItem = {
  id: string;
  origem?: string;
  exercicio?: number;
  principal: number;
  multa: number;
  juros: number;
  outros: number;
  total: number;
};

type DebitosNormalizados = {
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
};

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

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

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

function normalizeItem(item: Record<string, unknown>): DebitoItem {
  const principal = toNumber(
    pickFirstValue(item, ["valorPrincipal", "valorOriginal", "valorDebito", "principal"]),
    0
  );
  const multa = toNumber(pickFirstValue(item, ["valorMulta", "multa"]), 0);
  const juros = toNumber(pickFirstValue(item, ["valorJuros", "juros"]), 0);
  const correcao = toNumber(pickFirstValue(item, ["valorCorrecao", "correcao", "valorAtualizacao"]), 0);
  const honorarios = toNumber(pickFirstValue(item, ["valorHonorarios", "honorarios"]), 0);
  const custas = toNumber(pickFirstValue(item, ["valorCustas", "custas"]), 0);
  const outrosInformados = toNumber(pickFirstValue(item, ["valorOutros", "outros"]), 0);

  const totalInformado = toNumber(
    pickFirstValue(item, ["valorTotal", "valorAtualizado", "valorComAcrescimos", "total"]),
    principal + multa + juros + correcao + honorarios + custas + outrosInformados
  );

  const outros = outrosInformados + correcao + honorarios + custas;
  const total = totalInformado || principal + multa + juros + outros;
  const acessorios = Math.max(total - principal, multa + juros + outros);

  return {
    id: pickFirstValue(item, ["id", "idDebito", "codigo", "numeroDocumento", "numeroTitulo"]) ?? nanoid(8),
    origem: pickFirstValue(item, ["origem", "tipo", "tipoDebito", "natureza"]),
    exercicio: toNumber(pickFirstValue(item, ["exercicio", "ano", "anoExercicio"]), undefined) || undefined,
    principal: Number(principal.toFixed(2)),
    multa: Number(multa.toFixed(2)),
    juros: Number(juros.toFixed(2)),
    outros: Number(outros.toFixed(2)),
    total: Number((principal + acessorios).toFixed(2))
  };
}

function normalizeDebitos(payload: unknown): DebitosNormalizados {
  const registros = ensureArray(payload);
  const registroPrincipal =
    registros[0] ??
    (payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {});

  const proprietario = pickFirstValue(registroPrincipal, [
    "nomeProprietario",
    "nomeContribuinte",
    "proprietario",
    "nome"
  ]);

  const inscricao = pickFirstValue(registroPrincipal, ["inscricao", "inscricaoImobiliaria", "inscricaoMunicipal"]);
  const cci = pickFirstValue(registroPrincipal, ["cci", "codigoCci", "numeroCci"]);
  const ccp = pickFirstValue(registroPrincipal, ["ccp", "codigoCcp", "numeroCcp"]);
  const logradouro = pickFirstValue(registroPrincipal, ["logradouro", "endereco", "descricaoEndereco"]);
  const bairro = pickFirstValue(registroPrincipal, ["bairro", "setor"]);
  const situacao = pickFirstValue(registroPrincipal, ["situacao", "status", "situacaoImovel"]);

  const debitosRaw = extractDebitos(registroPrincipal);
  const itens = debitosRaw.map(normalizeItem);

  const totalPrincipal = itens.reduce((acc, item) => acc + item.principal, 0);
  const totalAcessorios = itens.reduce((acc, item) => acc + (item.total - item.principal), 0);
  const totalGeral = itens.reduce((acc, item) => acc + item.total, 0);

  return {
    proprietario: proprietario ?? undefined,
    imovel: {
      inscricao: inscricao ?? undefined,
      endereco: [logradouro, bairro].filter(Boolean).join(" - ") || undefined,
      cci: cci ?? undefined,
      ccp: ccp ?? undefined,
      situacao: situacao ?? undefined
    },
    itens,
    totais: {
      principal: Number(totalPrincipal.toFixed(2)),
      acessorios: Number(totalAcessorios.toFixed(2)),
      total: Number(totalGeral.toFixed(2))
    }
  };
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

    const raw = parsed.data;
    const normalized = {
      inscricao: sanitizeDigits(raw.inscricao),
      cci: sanitizeDigits(raw.cci),
      ccp: sanitizeDigits(raw.ccp)
    };

    const params = new URLSearchParams();
    if (normalized.inscricao) params.set("inscricaoImobiliaria", normalized.inscricao);
    if (normalized.cci) params.set("cci", normalized.cci);
    if (normalized.ccp) params.set("ccp", normalized.ccp);

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

      const resultado = normalizeDebitos(payload);

      res.status(200).json({
        correlationId,
        resultado,
        original: payload
      });
    } catch (error) {
      sendProdataError(res, 502, (error as Error).message, correlationId);
    }
  }
);

