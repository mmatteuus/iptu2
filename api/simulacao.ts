import { z } from "zod";
import { hasProdataCredentials } from "./_auth";
import { createHandler, readJsonBody } from "./_lib/http";
import { sendProdataError, sendValidationError } from "./_lib/errors";
import { prodataFetch } from "./_lib/prodataFetch";
import { logInfo } from "./_lib/logger";

const PRIMARY_PATH = process.env.PRODATA_API_SIMULACAO_PATH ?? "/arrecadacao/simulacao";
const FALLBACK_PATH = process.env.PRODATA_API_SIMULACAO_FALLBACK_PATH ?? "/arrecadacao/simulacaoRepactuacao";

const ItemSchema = z.object({
  id: z.string().min(1, "Identificador do debito obrigatorio."),
  valor: z
    .number({
      invalid_type_error: "Valor deve ser numerico."
    })
    .positive("Valor deve ser positivo.")
    .optional()
});

const IdentificacaoSchema = z
  .object({
    inscricaoImobiliaria: z.string().trim().min(1).optional(),
    cci: z.string().trim().min(1).optional(),
    ccp: z.string().trim().min(1).optional()
  })
  .refine((value) => Object.values(value).some(Boolean), {
    message: "Informe inscricaoImobiliaria, cci ou ccp."
  });

const BodySchema = z.object({
  identificacao: IdentificacaoSchema,
  itensSelecionados: z.array(ItemSchema).min(1, "Selecione ao menos um debito."),
  opcoes: z.object({
    parcelas: z
      .number({
        required_error: "Informe a quantidade de parcelas."
      })
      .int("Parcelas deve ser numero inteiro.")
      .min(1, "Minimo de 1 parcela.")
      .max(10, "Maximo de 10 parcelas."),
    vencimento: z
      .string({
        required_error: "Informe a data de vencimento."
      })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data invalido. Use YYYY-MM-DD.")
  })
});

function shouldFallback() {
  if (process.env.PRODATA_API_SIMULACAO_PATH) return false;
  return PRIMARY_PATH !== FALLBACK_PATH;
}

export default createHandler(
  {
    route: "simulacao",
    methods: ["POST"],
    critical: true
  },
  async ({ req, res, correlationId }) => {
    if (!hasProdataCredentials()) {
      res.status(200).json({
        correlationId,
        modo: "mock",
        message: "Simulacao em modo demonstracao. Configure PRODATA_USER/PRODATA_PASSWORD para chamadas reais."
      });
      return;
    }

    const body = await readJsonBody(req);
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      sendValidationError(res, parsed.error.flatten(), correlationId);
      return;
    }

    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      correlationId
    } as const;

    try {
      let response = await prodataFetch(PRIMARY_PATH, init);
      if (response.status === 404 && shouldFallback()) {
        logInfo("[simulacao] rota principal ausente, tentando fallback", { correlationId, path: FALLBACK_PATH });
        response = await prodataFetch(FALLBACK_PATH, init);
      }

      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const payload = isJson && text ? JSON.parse(text) : isJson ? {} : text;

      if (!response.ok) {
        sendProdataError(res, response.status, payload, correlationId);
        return;
      }

      res.status(200).json({
        correlationId,
        resultado: payload
      });
    } catch (error) {
      sendProdataError(res, 502, (error as Error).message, correlationId);
    }
  }
);

