import type { VercelRequest, VercelResponse } from "@vercel/node";

const API_BASE = process.env.PRODATA_API_BASE ?? "https://araguaina.prodataweb.inf.br/sigintegracaorest";
const API_TOKEN = process.env.PRODATA_API_TOKEN;

function parseBody(req: VercelRequest) {
  const raw = req.body;
  if (typeof raw === "object" && raw !== null) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      console.warn("[simular-repactuacao] JSON parse error", error);
      return {};
    }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Método não suportado" });
  }

  const body = parseBody(req);
  const target = `${API_BASE.replace(/\/$/, "")}/arrecadacao/simulacaoRepactuacao`;

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {})
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? JSON.parse(text || "{}
") : text;

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ message: "Falha na simulação", details: payload, status: response.status });
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error("[simular-repactuacao]", error);
    return res.status(502).json({ message: "Erro ao contactar API Prodata" });
  }
}
