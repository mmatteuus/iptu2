import type { VercelResponse } from "@vercel/node";

const ERROR_MESSAGES: Record<number, string> = {
  400: "Dados invalidos. Revise os campos.",
  401: "Sessao expirada. Tente novamente.",
  404: "Registro nao encontrado.",
  409: "Conflito: titulo ja emitido.",
  422: "Dados invalidos. Revise os campos."
};

const DEFAULT_MESSAGE = "Servico indisponivel. Tente novamente em alguns minutos.";

export function sendProdataError(res: VercelResponse, status: number, details: unknown, correlationId: string) {
  const message = ERROR_MESSAGES[status] ?? DEFAULT_MESSAGE;
  const httpStatus = status >= 400 && status < 600 ? status : 502;

  res.status(httpStatus).json({
    message,
    details,
    status,
    correlationId
  });
}

