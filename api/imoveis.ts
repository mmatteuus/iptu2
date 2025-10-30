import { z } from "zod";
import { hasProdataCredentials } from "./_auth";
import { createHandler } from "./_lib/http";
import { prodataFetch } from "./_lib/prodataFetch";
import { sendProdataError, sendValidationError } from "./_lib/errors";
import { ensureArray, pickFirstValue, sanitizeDigits, sanitizeString } from "./_lib/sanitize";

const IMOVEIS_PATH = process.env.PRODATA_API_IMOVEIS_PATH ?? "/cadastro/imoveis";

const QuerySchema = z
  .object({
    cpf: z.string().trim().optional(),
    cnpj: z.string().trim().optional()
  })
  .refine(
    (value) =>
      (value.cpf && !value.cnpj) || (!value.cpf && value.cnpj),
    { message: "Informe apenas CPF ou CNPJ." }
  );

type ImovelResumo = {
  inscricao?: string;
  cci?: string;
  ccp?: string;
  endereco?: string;
  situacao?: string;
};

function normalizeQuery(data: z.infer<typeof QuerySchema>) {
  const cpf = sanitizeDigits(data.cpf);
  const cnpj = sanitizeDigits(data.cnpj);

  return {
    cpf: cpf && cpf.length === 11 ? cpf : undefined,
    cnpj: cnpj && cnpj.length === 14 ? cnpj : undefined
  };
}

function normalizeImoveis(payload: unknown): ImovelResumo[] {
  const entries = ensureArray(payload);

  return entries
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const record = item as Record<string, unknown>;
      const logradouro = pickFirstValue(record, ["endereco", "logradouro", "descricaoEndereco"]);
      const bairro = pickFirstValue(record, ["bairro", "setor"]);

      return {
        inscricao: pickFirstValue(record, ["inscricao", "inscricaoImobiliaria", "inscricaoMunicipal"]),
        cci: pickFirstValue(record, ["cci", "codigoCci", "numeroCci"]),
        ccp: pickFirstValue(record, ["ccp", "codigoCcp", "numeroCcp"]),
        endereco: [logradouro, bairro].filter(Boolean).join(" - ") || undefined,
        situacao: pickFirstValue(record, ["situacao", "status", "situacaoImovel"])
      };
    })
    .filter((item) => item.inscricao || item.cci || item.ccp);
}

export default createHandler(
  {
    route: "imoveis",
    methods: ["GET"]
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

    if (!query.cpf && !query.cnpj) {
      sendValidationError(res, { message: "Informe um CPF (11 digitos) ou CNPJ (14 digitos)." }, correlationId);
      return;
    }

    const params = new URLSearchParams();
    if (query.cpf) params.set("cpf", query.cpf);
    if (query.cnpj) params.set("cnpj", query.cnpj);

    try {
      const response = await prodataFetch(`${IMOVEIS_PATH}?${params.toString()}`, { method: "GET", correlationId });
      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const payload = isJson && text ? JSON.parse(text) : isJson ? {} : text;

      if (!response.ok) {
        sendProdataError(res, response.status, payload, correlationId);
        return;
      }

      const itens = normalizeImoveis(payload);

      res.status(200).json({
        correlationId,
        imoveis: itens,
        original: payload
      });
    } catch (error) {
      sendProdataError(res, 502, (error as Error).message, correlationId);
    }
  }
);

