import type { ImovelPesquisa } from "../services/sig";
import { formatCpfCnpj } from "../utils/format";

type SearchResultsProps = {
  results: ImovelPesquisa[];
  onSelect: (imovel: ImovelPesquisa) => void;
};

const SearchResults = ({ results, onSelect }: SearchResultsProps) => {
  if (!results.length) {
    return (
      <p className="text-muted" role="status" aria-live="polite">
        Nenhum imovel localizado.
      </p>
    );
  }

  return (
    <div className="table-responsive" aria-live="polite">
      <table className="table table-hover align-middle">
        <thead className="table-light">
          <tr>
            <th scope="col">Proprietario</th>
            <th scope="col">CPF ou CNPJ</th>
            <th scope="col">CCI</th>
            <th scope="col">CCP</th>
            <th scope="col">Inscricao</th>
            <th scope="col">Endereco</th>
            <th scope="col">Origem</th>
            <th scope="col" className="text-end">
              Acoes
            </th>
          </tr>
        </thead>
        <tbody>
          {results.map((item, index) => {
            const key = item.cci ?? item.ccp ?? item.cgc ?? item.inscricao ?? `imovel-${index}`;
            const documento = item.cgc ? formatCpfCnpj(item.cgc) : "-";
            const endereco = [item.logradouro, item.bairro].filter(Boolean).join(" - ") || "-";
            const origem =
              item.origem === "api" ? "API" : item.origem === "sig" ? "SIG" : item.origem === "manual" ? "Manual" : "-";

            return (
              <tr key={key}>
                <td>{item.nome ?? "-"}</td>
                <td>{documento}</td>
                <td>{item.cci ?? "-"}</td>
                <td>{item.ccp ?? "-"}</td>
                <td>{item.inscricao ?? "-"}</td>
                <td>{endereco}</td>
                <td>{origem}</td>
                <td className="text-end">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onSelect(item)}>
                    Usar na simulacao
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SearchResults;
