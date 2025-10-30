import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import searchIcon from "../assets/icons/search.svg";
import { useAppContext } from "../context/AppContext";
import type { DebitoImovel, DebitoResumo, DebitosParams } from "../services/prodata";
import { consultarDebitos } from "../services/prodata";
import { formatCurrency, formatDate, formatCpfCnpj } from "../utils/format";

type FormState = {
  cpfCnpj: string;
  inscricao: string;
  cci: string;
  ccp: string;
};

type SelecoesState = Record<number, string[]>;

const initialForm: FormState = {
  cpfCnpj: "",
  inscricao: "",
  cci: "",
  ccp: ""
};

function normalizeFormToParams(form: FormState): DebitosParams {
  const params: DebitosParams = {};
  const digits = form.cpfCnpj.replace(/\D/g, "");
  if (digits.length === 11) params.cpf = digits;
  if (digits.length >= 14) params.cnpj = digits;
  if (form.inscricao.trim()) params.inscricao = form.inscricao.trim();
  if (form.cci.trim()) params.cci = form.cci.trim();
  if (form.ccp.trim()) params.ccp = form.ccp.trim();
  return params;
}

function hasAnyParam(params: DebitosParams) {
  return Boolean(params.cpf || params.cnpj || params.inscricao || params.cci || params.ccp);
}

function buildIdentificacao(imovel: DebitoImovel) {
  return {
    inscricaoImobiliaria: imovel.inscricao,
    cci: imovel.cci,
    ccp: imovel.ccp
  };
}

function getValorDebito(item: DebitoResumo) {
  return item.valorAtualizado ?? item.valorPrincipal ?? 0;
}

const PesquisaPage = () => {
  const navigate = useNavigate();
  const { setIdentificacao, setDebitosSelecionados, setLastDocumento, lastDocumento } = useAppContext();
  const [form, setForm] = useState<FormState>({
    ...initialForm,
    cpfCnpj: lastDocumento ?? ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [resultados, setResultados] = useState<DebitoImovel[]>([]);
  const [selecoes, setSelecoes] = useState<SelecoesState>({});
  const [imovelIndex, setImovelIndex] = useState(0);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setInfo(undefined);
    setLoading(true);
    setResultados([]);
    setSelecoes({});
    setImovelIndex(0);

    const params = normalizeFormToParams(form);

    if (!hasAnyParam(params)) {
      setError("Informe ao menos um identificador (CPF/CNPJ, Inscricao, CCI ou CCP).");
      setLoading(false);
      return;
    }

    try {
      const response = await consultarDebitos(params);
      if (!response.resultados.length) {
        setInfo("Nenhum debito localizado para os dados informados.");
        return;
      }

      setResultados(response.resultados);
      if (params.cpf || params.cnpj) {
        setLastDocumento(params.cpf ?? params.cnpj);
      }
    } catch (err) {
      const errorWithStatus = err as Error & { status?: number };
      const status = errorWithStatus?.status;
      if (status === 422 || status === 400) {
        setError("Dados invalidos. Revise os campos e tente novamente.");
      } else if (status === 404) {
        setInfo("Nenhum debito localizado.");
      } else if (status === 429) {
        setError("Muitas consultas em sequencia. Aguarde e tente novamente.");
      } else if (status === 503) {
        setError("Servico indisponivel. Configure as credenciais ou tente mais tarde.");
      } else {
        setError(errorWithStatus?.message ?? "Erro ao consultar debitos.");
      }
    } finally {
      setLoading(false);
    }
  };

  const currentImovel = resultados[imovelIndex];
  const selecionadosAtuais = useMemo(() => new Set(selecoes[imovelIndex] ?? []), [selecoes, imovelIndex]);

  const toggleDebito = (id: string) => {
    setSelecoes((current) => {
      const atual = new Set(current[imovelIndex] ?? []);
      if (atual.has(id)) {
        atual.delete(id);
      } else {
        atual.add(id);
      }
      return { ...current, [imovelIndex]: Array.from(atual) };
    });
  };

  const handleIrParaSimulacao = () => {
    if (!currentImovel) return;
    const selecionadosIds = new Set(selecoes[imovelIndex] ?? []);
    const itensSelecionados = currentImovel.debitos.filter((item) => selecionadosIds.has(item.id));

    if (!itensSelecionados.length) {
      setError("Selecione ao menos um debito para prosseguir.");
      return;
    }

    setIdentificacao(buildIdentificacao(currentImovel));
    setDebitosSelecionados(
      itensSelecionados.map((item) => ({
        ...item,
        valorAtualizado: getValorDebito(item)
      }))
    );

    if (currentImovel.documento) {
      setLastDocumento(currentImovel.documento);
    }

    navigate("/simulacao");
  };

  return (
    <main className="container py-4">
      <header className="mb-4">
        <div className="d-flex align-items-center gap-3">
          <img src={searchIcon} alt="" width={48} height={48} aria-hidden="true" />
          <div>
            <h1 className="h3 mb-1">Consulta de debitos do imovel</h1>
            <p className="mb-0 text-muted">
              Informe CPF/CNPJ ou identificacao do imovel para listar debitos e seguir para a simulacao.
            </p>
          </div>
        </div>
      </header>

      <section className="card shadow-sm mb-4">
        <div className="card-body">
          <form className="row g-3" onSubmit={handleSearch}>
            <div className="col-12 col-md-6">
              <label htmlFor="cpfCnpj" className="form-label">
                CPF ou CNPJ
              </label>
              <input
                id="cpfCnpj"
                name="cpfCnpj"
                className="form-control"
                value={form.cpfCnpj}
                onChange={handleInputChange}
                placeholder="Somente numeros"
                inputMode="numeric"
              />
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="inscricao" className="form-label">
                Inscricao imobiliaria
              </label>
              <input id="inscricao" name="inscricao" className="form-control" value={form.inscricao} onChange={handleInputChange} />
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="cci" className="form-label">
                CCI (imovel)
              </label>
              <input id="cci" name="cci" className="form-control" value={form.cci} onChange={handleInputChange} />
            </div>
            <div className="col-12 col-md-6">
              <label htmlFor="ccp" className="form-label">
                CCP (contribuinte)
              </label>
              <input id="ccp" name="ccp" className="form-control" value={form.ccp} onChange={handleInputChange} />
            </div>
            <div className="col-12 d-flex gap-2 align-items-end">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Consultando..." : "Buscar debitos"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setForm(initialForm);
                  setResultados([]);
                  setSelecoes({});
                  setImovelIndex(0);
                  setError(undefined);
                  setInfo(undefined);
                }}
              >
                Limpar
              </button>
            </div>
          </form>
          {error ? (
            <div className="alert alert-danger mt-3" role="alert" aria-live="assertive">
              {error}
            </div>
          ) : null}
          {info ? (
            <div className="alert alert-info mt-3" role="status" aria-live="polite">
              {info}
            </div>
          ) : null}
        </div>
      </section>

      {resultados.length ? (
        <section className="card">
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <h2 className="h5 mb-0">Selecione os debitos para parcelamento</h2>
              {resultados.length > 1 ? (
                <div className="d-flex align-items-center gap-2">
                  <label htmlFor="imovelIndex" className="form-label mb-0">
                    Imovel
                  </label>
                  <select
                    id="imovelIndex"
                    className="form-select form-select-sm"
                    value={imovelIndex}
                    onChange={(event) => setImovelIndex(Number(event.target.value))}
                  >
                    {resultados.map((item, idx) => (
                      <option key={`imovel-${idx}`} value={idx}>
                        {item.inscricao ?? item.cci ?? item.ccp ?? `Imovel ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            {currentImovel ? (
              <>
                <div className="mb-3">
                  <p className="mb-1">
                    <strong>Proprietario:</strong> {currentImovel.proprietario ?? "Nao informado"}
                  </p>
                  <p className="mb-1">
                    <strong>Documento:</strong> {currentImovel.documento ? formatCpfCnpj(currentImovel.documento) : "-"}
                  </p>
                  <p className="mb-1">
                    <strong>Endereco:</strong> {currentImovel.endereco ?? "-"}
                  </p>
                  <p className="mb-0">
                    <strong>Identificacao:</strong>{" "}
                    {[
                      currentImovel.inscricao ? `Inscricao ${currentImovel.inscricao}` : null,
                      currentImovel.cci ? `CCI ${currentImovel.cci}` : null,
                      currentImovel.ccp ? `CCP ${currentImovel.ccp}` : null
                    ]
                      .filter(Boolean)
                      .join(" | ") || "-"}
                  </p>
                </div>

                {currentImovel.debitos.length ? (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Selecionar</th>
                          <th>Descricao</th>
                          <th>Situacao</th>
                          <th>Vencimento</th>
                          <th className="text-end">Valor atualizado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentImovel.debitos.map((debito) => {
                          const checked = selecionadosAtuais.has(debito.id);
                          const valor = getValorDebito(debito);
                          return (
                            <tr key={debito.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  className="form-check-input"
                                  checked={checked}
                                  onChange={() => toggleDebito(debito.id)}
                                  aria-label={`Selecionar debito ${debito.descricao ?? debito.id}`}
                                />
                              </td>
                              <td>{debito.descricao ?? debito.id}</td>
                              <td>{debito.situacao ?? "-"}</td>
                              <td>{debito.vencimento ? formatDate(debito.vencimento) : "-"}</td>
                              <td className="text-end">{formatCurrency(valor)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-muted">Nenhum debito listado para este imovel.</p>
                )}

                <div className="d-flex flex-wrap justify-content-between align-items-center mt-3">
                  <p className="mb-0">
                    <strong>Selecionados:</strong> {selecionadosAtuais.size} / {currentImovel.debitos.length} |{" "}
                    <strong>Total estimado:</strong>{" "}
                    {formatCurrency(
                      currentImovel.debitos
                        .filter((item) => selecionadosAtuais.has(item.id))
                        .reduce((acc, item) => acc + getValorDebito(item), 0)
                    )}
                  </p>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleIrParaSimulacao}
                    disabled={!selecionadosAtuais.size}
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
