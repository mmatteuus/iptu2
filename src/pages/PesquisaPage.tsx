import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import searchIcon from "../assets/icons/search.svg";
import DocInput from "../components/DocInput";
import SearchResults from "../components/SearchResults";
import { useAppContext } from "../context/AppContext";
import type { ImovelPesquisa } from "../services/sig";
import { pesquisarImoveisPorDocumento } from "../services/sig";

const PesquisaPage = () => {
  const navigate = useNavigate();
  const { setSelectedImovel, setPrefillDevedor, lastDocumento, setLastDocumento } = useAppContext();
  const [documento, setDocumento] = useState(lastDocumento ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [docError, setDocError] = useState<string | undefined>();
  const [infoMessage, setInfoMessage] = useState<string | undefined>();
  const [results, setResults] = useState<ImovelPesquisa[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [fallbackForm, setFallbackForm] = useState({ cci: "", ccp: "", inscricao: "", duams: "" });

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setDocError(undefined);
    setInfoMessage(undefined);
    setHasSearched(true);
    setFallbackMode(false);
    setResults([]);
    const digits = documento.replace(/\D/g, "");
    if (digits.length < 11) {
      setDocError("Informe um CPF ou CNPJ com pelo menos 11 digitos.");
      return;
    }

    setLoading(true);
    try {
      const response = await pesquisarImoveisPorDocumento(digits);
      setLastDocumento(digits);
      setResults(response);
      if (!response.length) {
        setInfoMessage("Nenhum imovel foi retornado para o documento informado.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao consultar";
      if (message.includes("desabilitada")) {
        setFallbackMode(true);
        setInfoMessage(message);
      } else if (message.includes("401") || message.includes("403")) {
        setError("Servico exige credenciais oficiais. Fale com a Fazenda Municipal.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (imovel: ImovelPesquisa) => {
    setSelectedImovel(imovel);
    setPrefillDevedor({ tipo: "I", codigo: Number(imovel.cci) });
    navigate("/simulacao");
  };

  const handleFallbackSubmit = () => {
    const cci = fallbackForm.cci.trim();
    const ccp = fallbackForm.ccp.trim();
    if (!cci && !ccp) {
      setError("Informe CCI ou CCP para continuar.");
      return;
    }
    const tipo = cci ? "I" : "P";
    const codigo = Number(tipo === "I" ? cci : ccp);
    if (!Number.isFinite(codigo) || codigo <= 0) {
      setError("Informe um codigo numerico valido.");
      return;
    }
    setSelectedImovel({
      nome: "Selecionado manualmente",
      cgc: 0,
      cci: Number(cci) || 0,
      ccp: Number(ccp) || 0,
      inscricao: fallbackForm.inscricao || undefined,
      logradouro: undefined,
      bairro: undefined
    });
    setPrefillDevedor({ tipo, codigo, duams: fallbackForm.duams || undefined });
    navigate("/simulacao");
  };

  return (
    <main className="container py-4">
      <header className="mb-4">
        <div className="d-flex align-items-center gap-3">
          <img src={searchIcon} alt="" width={48} height={48} aria-hidden="true" />
          <div>
            <h1 className="h3 mb-1">Consulta de debitos do imovel</h1>
            <p className="mb-0 text-muted">Utilize o CPF ou CNPJ do titular para localizar imoveis vinculados no SIG.</p>
          </div>
        </div>
      </header>

      <section className="card shadow-sm mb-4">
        <div className="card-body">
          <form className="row g-3" onSubmit={handleSearch} aria-describedby="pesquisaHint">
            <div className="col-12 col-md-6">
              <DocInput
                label="CPF ou CNPJ"
                value={documento}
                onChange={setDocumento}
                descriptionId="pesquisaHint"
                error={docError}
              />
            </div>
            <div className="col-12 col-md-6 d-flex align-items-end">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Pesquisando..." : "Pesquisar"}
              </button>
            </div>
            <div id="pesquisaHint" className="form-text">
              As credenciais oficiais sao fornecidas pela Prefeitura de Araguaina.
            </div>
          </form>
          {error ? (
            <div className="alert alert-danger mt-3" role="alert" aria-live="assertive">
              {error}
            </div>
          ) : null}
          {infoMessage ? (
            <div className="alert alert-info mt-3" role="status" aria-live="polite">
              {infoMessage}
            </div>
          ) : null}
        </div>
      </section>

      {fallbackMode ? (
        <section className="card border-warning mb-4" aria-label="Busca alternativa">
          <div className="card-body">
            <h2 className="h5">Sem credenciais para CPF ou CNPJ</h2>
            <p className="text-muted">Informe CCI ou CCP e siga para a simulacao.</p>
            <div className="row g-3">
              <div className="col-12 col-md-3">
                <label htmlFor="cci" className="form-label">
                  CCI (imovel)
                </label>
                <input
                  id="cci"
                  type="number"
                  inputMode="numeric"
                  className="form-control"
                  value={fallbackForm.cci}
                  onChange={(event) => setFallbackForm((current) => ({ ...current, cci: event.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label htmlFor="ccp" className="form-label">
                  CCP (contribuinte)
                </label>
                <input
                  id="ccp"
                  type="number"
                  inputMode="numeric"
                  className="form-control"
                  value={fallbackForm.ccp}
                  onChange={(event) => setFallbackForm((current) => ({ ...current, ccp: event.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label htmlFor="inscricao" className="form-label">
                  Inscricao (opcional)
                </label>
                <input
                  id="inscricao"
                  type="text"
                  className="form-control"
                  value={fallbackForm.inscricao}
                  onChange={(event) => setFallbackForm((current) => ({ ...current, inscricao: event.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label htmlFor="duams" className="form-label">
                  DUAM(s) (opcional)
                </label>
                <input
                  id="duams"
                  type="text"
                  className="form-control"
                  placeholder="123, 456"
                  value={fallbackForm.duams}
                  onChange={(event) => setFallbackForm((current) => ({ ...current, duams: event.target.value }))}
                />
              </div>
            </div>
            <div className="mt-3 d-flex gap-2">
              <button type="button" className="btn btn-outline-primary" onClick={handleFallbackSubmit}>
                Continuar para simulacao
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="card">
          <div className="card-body">
            <h2 className="h5">Imoveis encontrados</h2>
            <SearchResults results={results} onSelect={handleSelect} />
          </div>
        </section>
      ) : hasSearched && !loading && !fallbackMode && !error && !infoMessage ? (
        <p className="text-muted" role="status" aria-live="polite">
          Nenhum imovel localizado.
        </p>
      ) : null}
    </main>
  );
};

export default PesquisaPage;
