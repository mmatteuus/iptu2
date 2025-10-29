import { hasProdataCredentials } from "./_auth";
import { createHandler } from "./_lib/http";
import { prodataFetch } from "./_lib/prodataFetch";
import { sendProdataError } from "./_lib/errors";
import { sanitizeDigits } from "./_lib/sanitize";

const DEBITOS_PATH = process.env.PRODATA_API_DEBITOS_PATH ?? "/arrecadacao/debitos";

function extractQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
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

    const query = req.query as Record<string, string | string[] | undefined>;
    const inscricao = sanitizeDigits(
      extractQueryParam(query.inscricaoImobiliaria ?? query.inscricao)
    );
    const cci = sanitizeDigits(extractQueryParam(query.cci));
    const ccp = sanitizeDigits(extractQueryParam(query.ccp));

    if (!inscricao && !cci && !ccp) {
      res.status(400).json({ message: "Dados invalidos. Informe inscricao, CCI ou CCP.", correlationId });
      return;
    }

    const params = new URLSearchParams();
    if (inscricao) params.set("inscricaoImobiliaria", inscricao);
    if (cci) params.set("cci", cci);
    if (ccp) params.set("ccp", ccp);

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

      res.status(200).json(payload);
    } catch (error) {
      sendProdataError(res, 502, (error as Error).message, correlationId);
    }
  }
);
