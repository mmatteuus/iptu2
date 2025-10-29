import { useMemo, useState } from "react";
import parcelamentoIcon from "../assets/icons/parcelamento.svg";
import ExportButtons from "../components/ExportButtons";
import InstallmentsTable from "../components/InstallmentsTable";
import SimulationForm, { type SimulationFormValues } from "../components/SimulationForm";
import { useAppContext } from "../context/AppContext";
import type { EmissaoResult, Parcela, SimulacaoReq, SimulacaoResult } from "../services/prodata";
import { emitirSimulacao, simular } from "../services/prodata";
import { formatCurrency, formatDate } from "../utils/format";
import { calculateTotalSimulado, PARCELAS_LIMIT } from "../utils/installments";

const SimulacaoPage = () => {
  const { selectedImovel, prefillDevedor, setPrefillDevedor } = useAppContext();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [simulacao, setSimulacao] = useState<SimulacaoResult | undefined>();
  const [emitindo, setEmitindo] = useState(false);
  const [emissao, setEmissao] = useState<EmissaoResult | undefined>();
  const [emissaoErro, setEmissaoErro] = useState<string | undefined>();

  const defaultValues: Partial<SimulationFormValues> = useMemo(() => {
    if (!prefillDevedor) {
      return selectedImovel
        ? {
            tipoDevedor: "I",
            devedor: String(selectedImovel.cci ?? "")
          }
        : {};
    }
    return {
      tipoDevedor: prefillDevedor.tipo,
      devedor: String(prefillDevedor.codigo),
      duams: prefillDevedor.duams
    };
  }, [prefillDevedor, selectedImovel]);

  const totalSimulado = useMemo(() => calculateTotalSimulado(parcelas), [parcelas]);

  const handleSubmit = async (values: SimulationFormValues) => {
    setLoading(true);
    setError(undefined);
    setInfo(undefined);
    setEmissao(undefined);
    setEmissaoErro(undefined);
    setPrefillDevedor({ tipo: values.tipoDevedor, codigo: Number(values.devedor), duams: values.duams });

    const payload: SimulacaoReq = {
      tipoDevedor: values.tipoDevedor,
      devedor: Number(values.devedor),
      vencimento: values.vencimento,
      tipoEntrada: values.tipoEntrada,
      tipoSimulacao: "PADRAO",
      tipoPesquisa: 0,
      dataInicial: "1900-01-01",
      dataFinal: "1900-01-01",
      ...(values.duams ? { duams: values.duams } : {})
    };

    if (values.tipoEntrada === "PERCENTUAL") {
      payload.percentualValorEntrada = Number(values.percentualValorEntrada ?? 0);
    } else {
      payload.valorParcelas = Number(values.valorParcelas ?? 0);
    }

    try {
      const response = await simular(payload);
      setSimulacao(response);
      setParcelas(response.parcelas);

      if (response.isMock) {
        setInfo(response.message ?? "Simulacao em modo demonstracao. Configure credenciais para emissao real.");
        return;
      }

      if (response.message) {
        setInfo(response.message);
      }

      if (!response.parcelas.length) {
        setError("Nenhuma parcela retornada para os parametros informados.");
      }
    } catch (err) {
      const errorWithStatus = err as Error & { status?: number };
      const status = errorWithStatus?.status;
      if (status === 401) {
        setError("Sessao expirada. Tente simular novamente.");
      } else if (status === 422 || status === 400) {
        setError("Dados invalidos. Revise os campos do formulario.");
      } else if (status === 404) {
        setError("Registro nao encontrado para os dados informados.");
      } else if (status === 429) {
        setError("Muitas simulacoes em sequencia. Aguarde um minuto e tente novamente.");
      } else if (status && status >= 500) {
        setError("Servico indisponivel. Tente novamente em alguns minutos.");
      } else {
        const message = err instanceof Error ? err.message : "Falha na simulacao";
        setError(message);
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
      setEmissaoErro("Identificador da simulacao nao retornado pela API. Nao e possivel emitir automaticamente.");
      return;
    }

    setEmitindo(true);
    setEmissaoErro(undefined);
    try {
      const payload = {
        simulacaoId: simulacao.simulacaoId,
        confirmacao: true
      };

      const result = await emitirSimulacao(payload);
      setEmissao(result);
    } catch (err) {
      const errorWithStatus = err as Error & { status?: number };
      const status = errorWithStatus?.status;
      if (status === 409) {
        setEmissaoErro("Titulo ja emitido anteriormente. Verifique o historico antes de gerar novamente.");
      } else if (status === 422 || status === 400) {
        setEmissaoErro("Dados invalidos. Revise a simulacao ou preencha novamente.");
      } else if (status === 401) {
        setEmissaoErro("Sessao expirada. Refaça a simulacao para renovar o token.");
      } else if (status === 503) {
        setEmissaoErro("Servico indisponivel no momento. Tente novamente em alguns minutos.");
      } else {
        const message = err instanceof Error ? err.message : "Falha ao emitir titulo.";
        setEmissaoErro(message);
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
            <p className="mb-0 text-muted">Utilize o retorno da pesquisa ou informe os dados manualmente para simular ate 48 parcelas.</p>
          </div>
        </div>
      </header>

      {selectedImovel ? (
        <section className="alert alert-secondary" role="status" aria-live="polite">
          <strong>Imovel selecionado:</strong> {selectedImovel.nome ?? "-"} | CCI {selectedImovel.cci ?? "-"} | CCP{" "}
          {selectedImovel.ccp ?? "-"}
          {selectedImovel.inscricao ? ` | Inscricao ${selectedImovel.inscricao}` : ""}
        </section>
      ) : null}

      <section className="card shadow-sm">
        <div className="card-body">
          <SimulationForm
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            loading={loading}
            onClear={() => {
              setParcelas([]);
              setSimulacao(undefined);
              setInfo(undefined);
              setEmissao(undefined);
              setEmissaoErro(undefined);
            }}
          />
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
            <h2 className="h5 mb-0">Parcelas simuladas</h2>
            <ExportButtons parcelas={parcelas} />
          </div>
          <InstallmentsTable parcelas={parcelas} />
          <p className="mt-3 fw-semibold">Total simulado (ate {PARCELAS_LIMIT} parcelas): {formatCurrency(totalSimulado)}</p>

          {simulacao && !simulacao.isMock ? (
            <div className="card mt-4">
              <div className="card-body">
                <h3 className="h6">Emitir titulo oficial</h3>
                <p className="text-muted mb-3">
                  Confirme a simulacao para gerar o DUAM/guia com vencimento e valores oficiais.
                </p>
                <div className="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleEmitir}
                    disabled={emitindo || !simulacao.simulacaoId}
                  >
                    {emitindo ? "Emitindo..." : "Aceitar simulacao e emitir"}
                  </button>
                  {!simulacao.simulacaoId ? (
                    <span className="text-danger small">
                      API nao forneceu identificador da simulacao. Entre em contato com o suporte.
                    </span>
                  ) : null}
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
