export type ImovelPesquisa = {
  nome?: string;
  cgc?: string;
  cci?: string;
  ccp?: string;
  inscricao?: string;
  logradouro?: string;
  bairro?: string;
  origem?: "api" | "sig" | "manual";
};

export type PesquisaParams = {
  cpfCNPJ?: string;
  inscricao?: string;
  cci?: string;
  ccp?: string;
};

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

async function handleResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      (typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as Record<string, unknown>).message)
        : undefined) ?? `Falha na pesquisa (${response.status})`;
    const error = new Error(message);
    (error as Error & { status?: number; details?: unknown }).status = response.status;
    (error as Error & { status?: number; details?: unknown }).details = payload;
    throw error;
  }

  return payload;
}

export async function pesquisarImoveis(params: PesquisaParams): Promise<ImovelPesquisa[]> {
  const response = await fetch("/api/pesquisar-imoveis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });

  const payload = await handleResponse(response);
  if (!Array.isArray(payload)) return [];
  return payload as ImovelPesquisa[];
}

export async function pesquisarImoveisPorDocumento(cpfCNPJ: string): Promise<ImovelPesquisa[]> {
  const doc = sanitizeDigits(cpfCNPJ);
  return pesquisarImoveis({ cpfCNPJ: doc });
}
