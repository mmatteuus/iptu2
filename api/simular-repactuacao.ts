import { hasProdataCredentials } from "./_auth";
import { createHandler, readJsonBody } from "./_lib/http";
import { sendProdataError } from "./_lib/errors";
import { prodataFetch } from "./_lib/prodataFetch";
import { logInfo } from "./_lib/logger";

const PRIMARY_PATH = process.env.PRODATA_API_SIMULACAO_PATH ?? "/arrecadacao/simulacao";
const FALLBACK_PATH = process.env.PRODATA_API_SIMULACAO_FALLBACK_PATH ?? "/arrecadacao/simulacaoRepactuacao";

function shouldFallback() {
  if (process.env.PRODATA_API_SIMULACAO_PATH) return false;
  return PRIMARY_PATH !== FALLBACK_PATH;
}

async function requestSimulacao(body: unknown, correlationId: string) {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    correlationId
  } as const;

  let response = await prodataFetch(PRIMARY_PATH, init);
  if (response.status === 404 && shouldFallback()) {
    logInfo("[simulacao] tentativa fallback", { correlationId, path: FALLBACK_PATH });
    response = await prodataFetch(FALLBACK_PATH, init);
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson && text ? JSON.parse(text) : isJson ? {} : text;

  return { response, payload };
}

export default createHandler(
  {
    route: "simular-repactuacao",
    methods: ["POST"],
    critical: true
  },
  async ({ req, res, correlationId }) => {
    if (!hasProdataCredentials()) {
      res.status(200).json({
        modo: "mock",
        message: "Simulacao em modo mock. Configure PRODATA_USER/PRODATA_PASSWORD para habilitar chamadas reais.",
        correlationId
      });
      return;
    }

    const body = await readJsonBody(req);

    try {
      const { response, payload } = await requestSimulacao(body, correlationId);
      if (!response.ok) {
        sendProdataError(res, response.status, payload, correlationId);
        return;
      }

      res.status(200).json(payload);
    } catch (error) {
      sendProdataError(res, 502, (error as Error).message, correlationId);
    }
  }
);

