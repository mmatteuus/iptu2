import { hasProdataCredentials } from "./_auth";
import { createHandler, readJsonBody } from "./_lib/http";
import { prodataFetch } from "./_lib/prodataFetch";
import { sendProdataError } from "./_lib/errors";

const EMITIR_PATH = process.env.PRODATA_API_EMITIR_PATH ?? "/arrecadacao/emitir";

function extractSimulacaoId(body: Record<string, unknown>) {
  const raw = body.simulacaoId ?? body.idSimulacao ?? body.id;
  if (typeof raw === "number") return raw.toString();
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

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
    const simulacaoId = extractSimulacaoId(body);

    if (!simulacaoId) {
      res.status(400).json({ message: "Dados invalidos. Informe o identificador da simulacao.", correlationId });
      return;
    }

    const payload = {
      confirmacao: body.confirmacao ?? true,
      ...body,
      simulacaoId
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

      if (!response.ok) {
        sendProdataError(res, response.status, parsed, correlationId);
        return;
      }

      res.status(200).json(parsed);
    } catch (error) {
      sendProdataError(res, 502, (error as Error).message, correlationId);
    }
  }
);

