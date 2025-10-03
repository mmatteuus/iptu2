import type { Parcela } from "../services/prodata";
import { formatCurrency, formatDate } from "../utils/format";

type InstallmentsTableProps = {
  parcelas: Parcela[];
};

const InstallmentsTable = ({ parcelas }: InstallmentsTableProps) => {
  if (!parcelas.length) {
    return null;
  }

  const limit = 48;
  const limitedParcelas = parcelas.slice(0, limit);
  const total = limitedParcelas.reduce(
    (acc, item) =>
      acc +
      item.valorDivida +
      item.valorJuros +
      item.valorMulta +
      item.valorCorrecao +
      item.valorExpediente,
    0
  );
  const excedente = parcelas.length > limit ? parcelas.length - limit : 0;

  return (
    <section aria-label="Resultado da simulacao" className="mt-4">
      <div className="table-responsive">
        <table className="table table-striped table-bordered align-middle">
          <thead className="table-light">
            <tr>
              <th scope="col">Parcela</th>
              <th scope="col">Vencimento</th>
              <th scope="col">Valor</th>
              <th scope="col">Juros</th>
              <th scope="col">Multa</th>
              <th scope="col">Correcao</th>
              <th scope="col">Expediente</th>
              <th scope="col">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {limitedParcelas.map((parcela) => {
              const valorTotal =
                parcela.valorDivida +
                parcela.valorJuros +
                parcela.valorMulta +
                parcela.valorCorrecao +
                parcela.valorExpediente;
              return (
                <tr key={parcela.parcela}>
                  <td>{parcela.parcela}</td>
                  <td>{formatDate(parcela.vencimento)}</td>
                  <td>{formatCurrency(parcela.valorDivida)}</td>
                  <td>{formatCurrency(parcela.valorJuros)}</td>
                  <td>{formatCurrency(parcela.valorMulta)}</td>
                  <td>{formatCurrency(parcela.valorCorrecao)}</td>
                  <td>{formatCurrency(parcela.valorExpediente)}</td>
                  <td>{formatCurrency(parcela.valorSaldoDevedor ?? valorTotal)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="table-light">
            <tr>
              <th scope="row" colSpan={2}>
                Total ({limitedParcelas.length} parcelas)
              </th>
              <td colSpan={6}>{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {excedente > 0 ? (
        <div className="alert alert-warning mt-3" role="status" aria-live="polite">
          Existem {excedente} parcelas adicionais na resposta. Ajuste os parametros ou procure a Fazenda para uma analise detalhada.
        </div>
      ) : null}
    </section>
  );
};

export default InstallmentsTable;
