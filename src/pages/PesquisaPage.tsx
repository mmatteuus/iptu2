import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import searchIcon from "../assets/icons/search.svg";
import { useAppContext } from "../context/AppContext";
import { buscarDebitos, buscarImoveisPorDocumento, type DebitoItem, type ImovelResumo } from "../services/prodata";
import { formatCurrency, formatDate } from "../utils/format";

type FormState = {
  documento: string;
};

const initialForm: FormState = {
  documento: ""
};

function buildIdentificacao(imovel?: ImovelResumo) {
  if (!imovel) return undefined;
  return {
    inscricaoImobiliaria: imovel.inscricao,
    cci: imovel.cci,
    ccp: imovel.ccp
  };
}

function resolveIdentificador(imovel?: ImovelResumo) {
  if (!imovel) return undefined;
  if (imovel.inscricao) return { inscricao: imovel.inscricao };
  if (imovel.cci) return { cci: imovel.cci };
  if (imovel.ccp) return { ccp: imovel.ccp };
  return undefined;
}

const PesquisaPage = () => {
  const navigate = useNavigate();
  const {
    imoveis,
    setImoveis,
    imovelSelecionado,
    setImovelSelecionado,
    debitosDetalhe,
    setDebitosDetalhe,
    setIdentificacao,
    debitosSelecionados,
    setDebitosSelecionados,
    lastDocumento,
    setLastDocumento
  } = useAppContext();

  const [form, setForm] = useState<FormState>({ documento: lastDocumento ?? "" });
  const [loadingImoveis, setLoadingImoveis] = useState(false);
  const [erroImoveis, setErroImoveis] = useState<string | undefined>();
  const [infoImoveis, setInfoImoveis] = useState<string | undefined>();
  const [loadingDebitos, setLoadingDebitos] = useState(false);
  const [erroDebitos, setErroDebitos] = useState<string | undefined>();

  const selectedIds = useMemo(() => new Set(debitosSelecionados.map((item) => item.id)), [debitosSelecionados]);

  const handleDocumentoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setForm({ documento: value });
  };

  const handleBuscarImoveis = async (event: FormEvent) => {
    event.preventDefault();
    setErroImoveis(undefined);
    setInfoImoveis(undefined);
    setImoveis([]);
    setImovelSelecionado(undefined);
    setDebitosDetalhe(undefined);
    setDebitosSelecionados([]);

    const digits = form.documento.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      setErroImoveis("Informe um CPF (11 digitos) ou CNPJ (14 digitos).");
      return;
    }

    setLoadingImoveis(true);
    try {
      const resultado = await buscarImoveisPorDocumento(digits);
      setImoveis(resultado);
      if (!resultado.length) {
        setInfoImoveis("Nenhum imovel localizado para o documento informado.");
      } else {
        setLastDocumento(digits);
      }
    } catch (error) {
      const err = error as Error & { status?: number };
      if (err.status === 422 || err.status === 400) {
        setErroImoveis("Documento invalido. Revise os digitos e tente novamente.");
      } else if (err.status === 404) {
        setInfoImoveis("Nenhum imovel localizado.");
      } else if (err.status === 503) {
        setErroImoveis("Servico indisponivel. Configure credenciais do backend ou tente mais tarde.");
      } else if (err.status === 429) {
        setErroImoveis("Muitas consultas em sequencia. Aguarde e tente novamente.");
      } else {
        setErroImoveis(err.message ?? "Falha ao consultar imoveis.");
      }
    } finally {
      setLoadingImoveis(false);
    }
  };

  const handleSelecionarImovel = async (imovel: ImovelResumo) => {
    setImovelSelecionado(imovel);
    setIdentificacao(buildIdentificacao(imovel));
    setDebitosSelecionados([]);
    setDebitosDetalhe(undefined);
    setErroDebitos(undefined);

    const identificador = resolveIdentificador(imovel);
    if (!identificador) {
      setErroDebitos("Imovel sem identificadores (inscricao/CCI/CCP). Consulte a TI municipal.");
      return;
    }

    setLoadingDebitos(true);
    try {
      const detalhe = await buscarDebitos(identificador);
      setDebitosDetalhe(detalhe);
    } catch (error) {
      const err = error as Error & { status?: number };
      if (err.status === 422 || err.status === 400) {
        setErroDebitos("Identificador invalido. Revise os dados do imovel.");
      } else if (err.status === 404) {
        setErroDebitos("Nenhum debito registrado para este imovel.");
      } else if (err.status === 503) {
        setErroDebitos("Servico indisponivel. Verifique credenciais backend.");
      } else if (err.status === 429) {
        setErroDebitos("Muitas consultas de debitos em sequencia. Aguarde e tente novamente.");
      } else {
        setErroDebitos(err.message ?? "Falha ao consultar debitos.");
      }
    } finally {
      setLoadingDebitos(false);
    }
  };

  const handleToggleDebito = (debito: DebitoItem) => {
    setDebitosSelecionados((current) => {
      const exists = current.some((item) => item.id === debito.id);
      if (exists) {
        return current.filter((item) => item.id !== debito.id);
      }
      return [...current, debito];
    });
  };

  const handleIrParaSimulacao = () => {
    navigate("/simulacao");
  };

  const debitosDisponiveis = debitosDetalhe?.itens ?? [];
  const totalSelecionado = debitosSelecionados.reduce((acc, item) => acc + (item.total ?? 0), 0);

  return (
    <main className="container py-4">
      <header className="mb-4">
        <div className="d-flex align-items-center gap-3">
          <img src={searchIcon} alt="" width={48} height={48} aria-hidden="true" />
          <div>
            <h1 className="h3 mb-1">Consulta de debitos do imovel</h1>
            <p className="mb-0 text-muted">
              Informe CPF ou CNPJ do contribuinte para localizar os imoveis e selecionar os debitos a parcelar.
            </p>
          </div>
        </div>
      </header>

      <section className="card shadow-sm mb-4">
        <div className="card-body">
          <form className="row g-3" onSubmit={handleBuscarImoveis}>
            <div className="col-12 col-md-6">
              <label htmlFor="documento" className="form-label">
                CPF ou CNPJ
              </label>
              <input
                id="documento"
                name="documento"
                className="form-control"
                value={form.documento}
                onChange={handleDocumentoChange}
                placeholder="Somente numeros"
                inputMode="numeric"
              />
            </div>
            <div className="col-12 col-md-6 d-flex align-items-end gap-2">
              <button type="submit" className="btn btn-primary" disabled={loadingImoveis}>
                {loadingImoveis ? "Buscando..." : "Buscar imoveis"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setForm(initialForm);
                  setImoveis([]);
                  setImovelSelecionado(undefined);
                  setDebitosDetalhe(undefined);
                  setDebitosSelecionados([]);
                  setErroImoveis(undefined);
                  setInfoImoveis(undefined);
                }}
              >
                Limpar
              </button>
            </div>
          </form>
          {erroImoveis ? (
            <div className="alert alert-danger mt-3" role="alert" aria-live="assertive">
              {erroImoveis}
            </div>
          ) : null}
          {infoImoveis ? (
            <div className="alert alert-info mt-3" role="status" aria-live="polite">
              {infoImoveis}
            </div>
          ) : null}
        </div>
      </section>

      {imoveis.length ? (
        <section className="card mb-4">
          <div className="card-body">
            <h2 className="h5">Imoveis encontrados</h2>
            <div className="list-group">
              {imoveis.map((item, index) => {
                const ativo = imovelSelecionado && imovelSelecionado === item;
                return (
                  <button
                    key={`${item.inscricao ?? item.cci ?? item.ccp ?? index}`}
                    type="button"
                    className={`list-group-item list-group-item-action${ativo ? " active" : ""}`}
                    onClick={() => handleSelecionarImovel(item)}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h3 className="h6 mb-1">Inscricao: {item.inscricao ?? "-"}</h3>
                        <p className="mb-0 small">
                          CCI {item.cci ?? "-"} | CCP {item.ccp ?? "-"}
                          {item.situacao ? ` | Situacao: ${item.situacao}` : ""}
                        </p>
                        <p className="mb-0 small text-muted">{item.endereco ?? "Endereco nao informado"}</p>
                      </div>
                      <span className="badge bg-secondary">Selecionar</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {imovelSelecionado ? (
        <section className="card mb-4">
          <div className="card-body">
            <h2 className="h5 mb-3">Debitos do imovel selecionado</h2>
            <p className="mb-1">
              <strong>Inscricao:</strong> {imovelSelecionado.inscricao ?? "-"}
            </p>
            <p className="mb-1">
              <strong>Endereco:</strong> {imovelSelecionado.endereco ?? "-"}
            </p>
            <p className="mb-1">
              <strong>Situacao:</strong> {imovelSelecionado.situacao ?? "-"}
            </p>
            {erroDebitos ? (
              <div className="alert alert-danger mt-3" role="alert">
                {erroDebitos}
              </div>
            ) : null}
            {loadingDebitos ? <p className="text-muted">Carregando debitos...</p> : null}
            {!loadingDebitos && debitosDetalhe ? (
              <>
                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Selecionar</th>
                        <th>Origem</th>
                        <th>Exercicio</th>
                        <th>Vencimento</th>
                        <th className="text-end">Principal</th>
                        <th className="text-end">Multa</th>
                        <th className="text-end">Juros</th>
                        <th className="text-end">Outros</th>
                        <th className="text-end">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debitosDisponiveis.map((debito) => {
                        const marcado = selectedIds.has(debito.id);
                        return (
                          <tr key={debito.id}>
                            <td>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={marcado}
                                onChange={() => handleToggleDebito(debito)}
                                aria-label={`Selecionar debito ${debito.origem ?? debito.id}`}
                              />
                            </td>
                            <td>{debito.origem ?? "-"}</td>
                            <td>{debito.exercicio ?? "-"}</td>
                            <td>{debito.vencimento ? formatDate(debito.vencimento) : "-"}</td>
                            <td className="text-end">{formatCurrency(debito.principal ?? 0)}</td>
                            <td className="text-end">{formatCurrency(debito.multa ?? 0)}</td>
                            <td className="text-end">{formatCurrency(debito.juros ?? 0)}</td>
                            <td className="text-end">{formatCurrency(debito.outros ?? 0)}</td>
                            <td className="text-end">{formatCurrency(debito.total ?? 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="d-flex flex-wrap justify-content-between align-items-center mt-3">
                  <p className="mb-0">
                    <strong>Selecionados:</strong> {debitosSelecionados.length} / {debitosDisponiveis.length} |{' '}
                    <strong>Total estimado:</strong> {formatCurrency(totalSelecionado)}
                  </p>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleIrParaSimulacao}
                    disabled={!debitosSelecionados.length}
                  >
                    Ir para simulacao
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
};

export default PesquisaPage;

