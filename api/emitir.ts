import { z } from "zod";
import { hasProdataCredentials } from "./_auth";
import { createHandler, readJsonBody } from "./_lib/http";
import { prodataFetch } from "./_lib/prodataFetch";
import { sendProdataError, sendValidationError } from "./_lib/errors";

const EMITIR_PATH = process.env.PRODATA_API_EMITIR_PATH ?? "/arrecadacao/emitir";

const BodySchema = z
  .object({
    simulacaoId: z.union([z.string(), z.number()]),
    confirmacao: z.boolean().optional()
  })
  .passthrough();

export default createHandler(
  {
    route: "emitir",
    methods: ["POST"],
    critical: true
  },
  async ({ req, res, correlationId }) => {
    if (!hasProdataCredentials()) {
      res.status(503).json({ message: "Emissao indisponivel: configure PRODATA_USER/PRODATA_PASSWORD.", correlationId });
      return;
    }

    const body = await readJsonBody<Record<string, unknown>>(req);

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.flatten(), correlationId);
      return;
    }

    const simulacaoId = parsed.data.simulacaoId.toString().trim();
    if (!simulacaoId) {
      sendValidationError(res, { message: "Identificador da simulacao obrigatorio." }, correlationId);
      return;
    }

    const payload = {
      ...parsed.data,
      simulacaoId,
      confirmacao: parsed.data.confirmacao ?? true
    };

    try {
      const response = await prodataFetch(EMITIR_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        correlationId
      });

      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const parsed = isJson && text ? JSON.parse(text) : isJson ? {} : text;

      if (response.status === 409) {
        res.status(409).json({
          message: "Conflito: titulo ja emitido.",
          details: parsed,
          status: 409,
          correlationId
        });
        return;
      }

      if (!response.ok) {
        sendProdataError(res, response.status, parsed, correlationId);
        return;
      }

      res.status(201).json({
        correlationId,
        resultado: parsed
      });
    } catch (error) {
      sendProdataError(res, 502, (error as Error).message, correlationId);
    }
  }
);
