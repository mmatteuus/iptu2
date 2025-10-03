export type SimulacaoReq = {
  tipoDevedor: "I" | "P";
  devedor: number;
  vencimento: string;
  tipoEntrada: "PERCENTUAL" | "VALOR";
  percentualValorEntrada?: number;
  valorParcelas?: number;
  duams?: string;
  tipoSimulacao?: string;
  tipoPesquisa?: number;
  dataInicial?: string;
  dataFinal?: string;
};

export type Parcela = {
  parcela: number;
  vencimento: string;
  valorDivida: number;
  valorJuros: number;
  valorMulta: number;
  valorCorrecao: number;
  valorExpediente: number;
  valorSaldoDevedor: number;
};

export async function simular(payload: SimulacaoReq): Promise<Parcela[]> {
  const res = await fetch("/api/simular-repactuacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Falha na simulação (${res.status}): ${JSON.stringify(json)}`);
  return json as Parcela[];
}
