import { useMemo, useState } from "react";
import parcelamentoIcon from "../assets/icons/parcelamento.svg";
import ExportButtons from "../components/ExportButtons";
import InstallmentsTable from "../components/InstallmentsTable";
import SimulationForm, { type SimulationFormValues } from "../components/SimulationForm";
import { useAppContext } from "../context/AppContext";
import type { Parcela, SimulacaoReq } from "../services/prodata";
import { simular } from "../services/prodata";
import { formatCurrency } from "../utils/format";
import { calculateTotalSimulado, PARCELAS_LIMIT } from "../utils/installments";

const SimulacaoPage = () => {
  const { selectedImovel, prefillDevedor, setPrefillDevedor } = useAppContext();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

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
      setParcelas(response);
      if (!response.length) {
        setError("Nenhuma parcela retornada para os parametros informados.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha na simulacao";
      setError(message);
      setParcelas([]);
    } finally {
      setLoading(false);
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
          <strong>Imovel selecionado:</strong> {selectedImovel.nome} | CCI {selectedImovel.cci} | CCP {selectedImovel.ccp}
          {selectedImovel.inscricao ? ` | Inscricao ${selectedImovel.inscricao}` : ""}
        </section>
      ) : null}

      <section className="card shadow-sm">
        <div className="card-body">
          <SimulationForm defaultValues={defaultValues} onSubmit={handleSubmit} loading={loading} onClear={() => setParcelas([])} />
          {error ? (
            <div className="alert alert-danger mt-3" role="alert" aria-live="assertive">
              {error}
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
        </section>
      ) : null}
    </main>
  );
};

export default SimulacaoPage;