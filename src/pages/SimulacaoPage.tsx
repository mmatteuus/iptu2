import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import parcelamentoIcon from "../assets/icons/parcelamento.svg";
import ExportButtons from "../components/ExportButtons";
import InstallmentsTable from "../components/InstallmentsTable";
import { useAppContext } from "../context/AppContext";
import type { DebitoItem, EmissaoResult, SimulacaoPayload, SimulacaoResult } from "../services/prodata";
import { emitirSimulacao, simular } from "../services/prodata";
import { formatCurrency, formatDate } from "../utils/format";
import { calculateTotalSimulado, PARCELAS_LIMIT } from "../utils/installments";

const today = new Date().toISOString().split("T")[0];

function getValorDebito(item: DebitoItem) {
  return item.total ?? item.principal ?? 0;
}

const SimulacaoPage = () => {
  const navigate = useNavigate();
  const { identificacao, setIdentificacao, debitosDetalhe, debitosSelecionados, setDebitosSelecionados } = useAppContext();
  const [parcelas, setParcelas] = useState<SimulacaoResult["parcelas"]>([]);
  const [parcelasQtd, setParcelasQtd] = useState<number>(debitosSelecionados.length ? Math.min(10, debitosSelecionados.length) : 3);
  const [vencimento, setVencimento] = useState<string>(today);
  const [simulacao, setSimulacao] = useState<SimulacaoResult | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [emitindo, setEmitindo] = useState(false);
  const [emissao, setEmissao] = useState<EmissaoResult | undefined>();
  const [emissaoErro, setEmissaoErro] = useState<string | undefined>();

  const [identificacaoForm, setIdentificacaoForm] = useState({
    inscricaoImobiliaria: identificacao?.inscricaoImobiliaria ?? "",
    cci: identificacao?.cci ?? "",
    ccp: identificacao?.ccp ?? ""
  });

  useEffect(() => {
    setIdentificacaoForm({
      inscricaoImobiliaria: identificacao?.inscricaoImobiliaria ?? "",
      cci: identificacao?.cci ?? "",
      ccp: identificacao?.ccp ?? ""
    });
  }, [identificacao?.inscricaoImobiliaria, identificacao?.cci, identificacao?.ccp]);

  useEffect(() => {
    if (!debitosSelecionados.length) {
      setParcelasQtd(1);
    }
  }, [debitosSelecionados.length]);

  const totalSelecionado = useMemo(
    () => debitosSelecionados.reduce((acc, item) => acc + getValorDebito(item), 0),
    [debitosSelecionados]
  );

  const totalSimulado = useMemo(() => calculateTotalSimulado(parcelas), [parcelas]);

  const handleToggleDebito = (id: string) => {
    setDebitosSelecionados((current) => current.filter((item) => item.id !== id));
  };

  const handleSimular = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setInfo(undefined);
    setEmissao(undefined);
    setEmissaoErro(undefined);

    const identificacaoPayload = {
      inscricaoImobiliaria: identificacaoForm.inscricaoImobiliaria.trim() || undefined,
      cci: identificacaoForm.cci.trim() || undefined,
      ccp: identificacaoForm.ccp.trim() || undefined
    };

    if (!debitosSelecionados.length) {
      setError("Selecione ao menos um debito na etapa anterior.");
      return;
    }

    if (!identificacaoPayload.inscricaoImobiliaria && !identificacaoPayload.cci && !identificacaoPayload.ccp) {
      setError("Informe inscricao, CCI ou CCP para continuar.");
      return;
    }

    const itensSelecionados = debitosSelecionados.map((item) => ({\n      id: item.id\n    }));

    const payload: SimulacaoPayload = {
      identificacao: identificacaoPayload,
      itensSelecionados,
      opcoes: { parcelas: parcelasQtd, vencimento }
    };

    setLoading(true);
    try {
      const resultado = await simular(payload);
      setSimulacao(resultado);
      setParcelas(resultado.parcelas);
      setIdentificacao(identificacaoPayload);

      if (resultado.isMock) {
        setInfo(resultado.message ?? "Simulacao em modo demonstracao. Configure credenciais para emissao real.");
        return;
      }

      if (resultado.message) {
        setInfo(resultado.message);
      }

      if (!resultado.parcelas.length) {
        setError("Nenhuma opcao de parcelamento retornada. Ajuste os dados e tente novamente.");
      }
    } catch (err) {
      const errorWithStatus = err as Error & { status?: number };
      const status = errorWithStatus?.status;
      if (status === 401) {
        setError("Sessao expirada. Tente novamente.");
      } else if (status === 422 || status === 400) {
        setError("Dados invalidos. Revise os campos e tente novamente.");
      } else if (status === 404) {
        setError("Registro nao encontrado para os dados informados.");
      } else if (status === 429) {
        setError("Muitas simulacoes em sequencia. Aguarde e tente novamente.");
      } else if (status && status >= 500) {
        setError("Servico indisponivel. Tente novamente em alguns minutos.");
      } else {
        setError(errorWithStatus?.message ?? "Falha na simulacao.");
      }
      setParcelas([]);
      setSimulacao(undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleEmitir = async () => {
    if (!simulacao) {
      setEmissaoErro("Realize a simulacao antes de emitir.");
      return;
    }

    if (!simulacao.simulacaoId) {
      setEmissaoErro("Identificador da simulacao nao retornado pela API.");
      return;
    }

    setEmitindo(true);
    setEmissaoErro(undefined);

    try {
      const resultado = await emitirSimulacao({ simulacaoId: simulacao.simulacaoId, confirmacao: true });
      setEmissao(resultado);
    } catch (err) {
      const errorWithStatus = err as Error & { status?: number };
      const status = errorWithStatus?.status;
      if (status === 409) {
        setEmissaoErro("Titulo ja emitido anteriormente. Utilize a segunda via.");
      } else if (status === 422 || status === 400) {
        setEmissaoErro("Dados invalidos. Refaca a simulacao.");
      } else if (status === 401) {
        setEmissaoErro("Sessao expirada. Refaca a simulacao para renovar o token.");
      } else if (status === 503) {
        setEmissaoErro("Servico indisponivel no momento. Tente novamente mais tarde.");
      } else {
        setEmissaoErro(errorWithStatus?.message ?? "Falha ao emitir titulo.");
      }
    } finally {
      setEmitindo(false);
    }
  };

  return (
    <main className="container py-4">
      <header className="mb-4">
        <div className="d-flex align-items-center gap-3">
          <img src={parcelamentoIcon} alt="" width={48} height={48} aria-hidden="true" />
          <div>
            <h1 className="h3 mb-1">Simulacao de parcelamento</h1>
            <p className="mb-0 text-muted">
              Revise os debitos selecionados, escolha a quantidade de parcelas e confirme para gerar o DUAM oficial.
            </p>
          </div>
        </div>
      </header>

      {!debitosSelecionados.length ? (
        <div className="alert alert-warning" role="alert">
          Nenhum debito selecionado. Volte para a etapa de consulta e marque ao menos um item.
          <button type="button" className="btn btn-link p-0 ms-2" onClick={() => navigate("/pesquisa")}>
            Voltar para consulta
          </button>
        </div>
      ) : null}

      {debitosSelecionados.length ? (
        <section className="card shadow-sm mb-4">
          <div className="card-body">
            <h2 className="h6">Debitos selecionados</h2>
            {debitosDetalhe ? (
              <div className="mb-3">
                {proprietario ? (
                  <p className="mb-1">
                    <strong>Proprietario:</strong> {proprietario}
                  </p>
                ) : null}
                <p className="mb-1">
                  <strong>Inscricao:</strong> {imovelInfo?.inscricao ?? "-"} | CCI {imovelInfo?.cci ?? "-"} | CCP{" "}
                  {imovelInfo?.ccp ?? "-"}
                </p>
                <p className="mb-1">
                  <strong>Endereco:</strong> {imovelInfo?.endereco ?? "-"}
                </p>
                <p className="mb-1">
                  <strong>Situacao:</strong> {imovelInfo?.situacao ?? "-"}
                </p>
                {totaisDebitos ? (
                  <p className="mb-0">
                    <strong>Totais:</strong>{" "}
                    Principal {formatCurrency(totaisDebitos.principal ?? 0)} | Acessorios{" "}
                    {formatCurrency(totaisDebitos.acessorios ?? 0)} | Total {formatCurrency(totaisDebitos.total ?? 0)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="table-responsive">
              <table className="table table-striped align-middle">
                <thead>
                  <tr>
                    <th>Descricao</th>
                    <th>Situacao</th>
                    <th>Vencimento</th>
                    <th className="text-end">Valor atualizado</th>
                    <th className="text-end">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {debitosSelecionados.map((item) => (
                    <tr key={item.id}>
                      <td>{item.descricao ?? item.id}</td>
                      <td>{item.situacao ?? "-"}</td>
                      <td>{item.vencimento ? formatDate(item.vencimento) : "-"}</td>
                      <td className="text-end">{formatCurrency(getValorDebito(item))}</td>
                      <td className="text-end">
                        <button type="button" className="btn btn-link text-danger p-0" onClick={() => handleToggleDebito(item.id)}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mb-0">
              <strong>Total selecionado:</strong> {formatCurrency(totalSelecionado)}
            </p>
          </div>
        </section>
      ) : null}

      <section className="card shadow-sm mb-4">
        <div className="card-body">
          <form className="row g-3" onSubmit={handleSimular}>
            <div className="col-12 col-md-4">
              <label htmlFor="inscricaoImobiliaria" className="form-label">
                Inscricao imobiliaria
              </label>
              <input
                id="inscricaoImobiliaria"
                className="form-control"
                value={identificacaoForm.inscricaoImobiliaria}
                onChange={(event) => setIdentificacaoForm((current) => ({ ...current, inscricaoImobiliaria: event.target.value }))}
              />
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="cci" className="form-label">
                CCI
              </label>
              <input
                id="cci"
                className="form-control"
                value={identificacaoForm.cci}
                onChange={(event) => setIdentificacaoForm((current) => ({ ...current, cci: event.target.value }))}
              />
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="ccp" className="form-label">
                CCP
              </label>
              <input
                id="ccp"
                className="form-control"
                value={identificacaoForm.ccp}
                onChange={(event) => setIdentificacaoForm((current) => ({ ...current, ccp: event.target.value }))}
              />
            </div>

            <div className="col-12 col-md-4">
              <label htmlFor="parcelasQtd" className="form-label">
                Parcelas (1 a 10)
              </label>
              <input
                id="parcelasQtd"
                type="number"
                min={1}
                max={10}
                className="form-control"
                value={parcelasQtd}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  if (!Number.isNaN(value)) {
                    setParcelasQtd(Math.min(10, Math.max(1, value)));
                  }
                }}
              />
            </div>
            <div className="col-12 col-md-4">
              <label htmlFor="vencimento" className="form-label">
                Vencimento desejado
              </label>
              <input id="vencimento" type="date" className="form-control" value={vencimento} onChange={(event) => setVencimento(event.target.value)} />
            </div>
            <div className="col-12 d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={loading || !debitosSelecionados.length}>
                {loading ? "Simulando..." : "Simular parcelamento"}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setParcelas([]);
                  setSimulacao(undefined);
                  setInfo(undefined);
                  setEmissao(undefined);
                  setEmissaoErro(undefined);
                }}
              >
                Limpar resultados
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

      {parcelas.length ? (
        <section className="mt-4">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
            <h2 className="h5 mb-0">Opcoes de parcelamento</h2>
            <ExportButtons parcelas={parcelas} />
          </div>
          <InstallmentsTable parcelas={parcelas} />
          <p className="mt-3 fw-semibold">Total estimado (ate {PARCELAS_LIMIT} parcelas): {formatCurrency(totalSimulado)}</p>

          {simulacao && !simulacao.isMock ? (
            <div className="card mt-4">
              <div className="card-body">
                <h3 className="h6">Emitir DUAM oficial</h3>
                <p className="text-muted mb-3">
                  Confirme para gerar o titulo com desconto vigente e oriente o contribuinte a pagar ate o vencimento.
                </p>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-success" onClick={handleEmitir} disabled={emitindo}>
                    {emitindo ? "Emitindo..." : "Aceitar simulacao"}
                  </button>
                </div>

                {emissaoErro ? (
                  <div className="alert alert-danger mt-3" role="alert">
                    {emissaoErro}
                  </div>
                ) : null}

                {emissao ? (
                  <div className="alert alert-success mt-3" role="status" aria-live="polite">
                    <h4 className="h6 mb-2">Titulo emitido com sucesso</h4>
                    <dl className="row mb-0">
                      {emissao.numeroTitulo ? (
                        <div className="col-12 col-md-6">
                          <dt className="small text-uppercase text-muted">Numero do titulo</dt>
                          <dd className="mb-2">{emissao.numeroTitulo}</dd>
                        </div>
                      ) : null}
                      {emissao.vencimento ? (
                        <div className="col-12 col-md-6">
                          <dt className="small text-uppercase text-muted">Vencimento</dt>
                          <dd className="mb-2">{formatDate(emissao.vencimento)}</dd>
                        </div>
                      ) : null}
                      {emissao.valorTotal ? (
                        <div className="col-12 col-md-6">
                          <dt className="small text-uppercase text-muted">Valor total</dt>
                          <dd className="mb-2">{formatCurrency(emissao.valorTotal)}</dd>
                        </div>
                      ) : null}
                      {emissao.linhaDigitavel ? (
                        <div className="col-12">
                          <dt className="small text-uppercase text-muted">Linha digitavel</dt>
                          <dd className="mb-2 font-monospace">{emissao.linhaDigitavel}</dd>
                        </div>
                      ) : null}
                      {emissao.codigoBarras ? (
                        <div className="col-12">
                          <dt className="small text-uppercase text-muted">Codigo de barras</dt>
                          <dd className="mb-2 font-monospace">{emissao.codigoBarras}</dd>
                        </div>
                      ) : null}
                      {emissao.urlBoleto ? (
                        <div className="col-12">
                          <dt className="small text-uppercase text-muted">Boleto</dt>
                          <dd className="mb-0">
                            <a href={emissao.urlBoleto} target="_blank" rel="noreferrer">
                              Abrir boleto
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
};

export default SimulacaoPage;





