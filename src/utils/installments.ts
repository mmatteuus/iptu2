import type { Parcela } from "../services/prodata";

export const PARCELAS_LIMIT = 48;

export const calculateParcelaTotal = (parcela: Parcela) =>
  parcela.valorSaldoDevedor ??
  parcela.valorDivida + parcela.valorJuros + parcela.valorMulta + parcela.valorCorrecao + parcela.valorExpediente;

export const calculateTotalSimulado = (parcelas: Parcela[]) =>
  parcelas.slice(0, PARCELAS_LIMIT).reduce((acc, item) => acc + calculateParcelaTotal(item), 0);