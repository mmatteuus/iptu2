import { useEffect } from "react";
import { useForm } from "react-hook-form";

export type SimulationFormValues = {
  tipoDevedor: "I" | "P";
  devedor: string;
  vencimento: string;
  tipoEntrada: "PERCENTUAL" | "VALOR";
  percentualValorEntrada?: number;
  valorParcelas?: number;
  duams?: string;
};

type SimulationFormProps = {
  defaultValues?: Partial<SimulationFormValues>;
  onSubmit: (values: SimulationFormValues) => void;
  loading?: boolean;
  onClear?: () => void;
};

const today = new Date().toISOString().split("T")[0];

const SimulationForm = ({ defaultValues, onSubmit, loading = false, onClear }: SimulationFormProps) => {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors }
  } = useForm<SimulationFormValues>({
    defaultValues: {
      tipoDevedor: "I",
      devedor: "",
      vencimento: today,
      tipoEntrada: "PERCENTUAL",
      ...defaultValues
    }
  });

  const tipoEntrada = watch("tipoEntrada");
  const tipoDevedor = watch("tipoDevedor");

  useEffect(() => {
    if (defaultValues) {
      reset({
        tipoDevedor: defaultValues.tipoDevedor ?? "I",
        devedor: defaultValues.devedor ?? "",
        vencimento: defaultValues.vencimento ?? today,
        tipoEntrada: defaultValues.tipoEntrada ?? "PERCENTUAL",
        percentualValorEntrada: defaultValues.percentualValorEntrada,
        valorParcelas: defaultValues.valorParcelas,
        duams: defaultValues.duams
      });
    }
  }, [defaultValues, reset]);

  return (
    <form className="row g-3" onSubmit={handleSubmit(onSubmit)}>
      <div className="col-12 col-md-3">
        <label className="form-label" htmlFor="tipoDevedor">
          Tipo devedor
        </label>
        <select id="tipoDevedor" className="form-select" {...register("tipoDevedor")} aria-describedby="tipoDevedorHint">
          <option value="I">Imovel (CCI)</option>
          <option value="P">Pessoa (CCP)</option>
        </select>
        <div id="tipoDevedorHint" className="form-text">
          Escolha de acordo com o documento do carne.
        </div>
      </div>

      <div className="col-12 col-md-3">
        <label className="form-label" htmlFor="devedor">
          {tipoDevedor === "I" ? "CCI do imovel" : "CCP do contribuinte"}
        </label>
        <input
          id="devedor"
          type="number"
          inputMode="numeric"
          className={`form-control${errors.devedor ? " is-invalid" : ""}`}
          {...register("devedor", { required: "Informe o numero" })}
          aria-describedby="devedorHint"
        />
        <div id="devedorHint" className="form-text">
          O codigo esta no carne do IPTU.
        </div>
        {errors.devedor ? <div className="invalid-feedback">{errors.devedor.message}</div> : null}
      </div>

      <div className="col-12 col-md-3">
        <label className="form-label" htmlFor="vencimento">
          Vencimento desejado
        </label>
        <input id="vencimento" type="date" className="form-control" {...register("vencimento", { required: "Informe a data" })} />
      </div>

      <div className="col-12 col-md-3">
        <label className="form-label" htmlFor="tipoEntrada">
          Tipo da entrada
        </label>
        <select id="tipoEntrada" className="form-select" {...register("tipoEntrada")} aria-describedby="tipoEntradaHint">
          <option value="PERCENTUAL">Percentual (%)</option>
          <option value="VALOR">Valor por parcela (R$)</option>
        </select>
        <div id="tipoEntradaHint" className="form-text">
          Escolha como deseja definir o valor inicial.
        </div>
      </div>

      {tipoEntrada === "PERCENTUAL" ? (
        <div className="col-12 col-md-3">
          <label className="form-label" htmlFor="percentualValorEntrada">
            Percentual da entrada
          </label>
          <input
            id="percentualValorEntrada"
            type="number"
            step="0.01"
            min="0"
            max="100"
            className={`form-control${errors.percentualValorEntrada ? " is-invalid" : ""}`}
            {...register("percentualValorEntrada", {
              required: "Informe o percentual",
              min: { value: 0, message: "O minimo e 0%" },
              max: { value: 100, message: "O maximo e 100%" }
            })}
          />
          {errors.percentualValorEntrada ? (
            <div className="invalid-feedback">{errors.percentualValorEntrada.message}</div>
          ) : (
            <div className="form-text">Digite um valor entre 0 e 100.</div>
          )}
        </div>
      ) : (
        <div className="col-12 col-md-3">
          <label className="form-label" htmlFor="valorParcelas">
            Valor por parcela (R$)
          </label>
          <input
            id="valorParcelas"
            type="number"
            step="0.01"
            min="0.01"
            className={`form-control${errors.valorParcelas ? " is-invalid" : ""}`}
            {...register("valorParcelas", {
              required: "Informe o valor",
              min: { value: 0.01, message: "Informe valor maior que zero" }
            })}
          />
          {errors.valorParcelas ? (
            <div className="invalid-feedback">{errors.valorParcelas.message}</div>
          ) : (
            <div className="form-text">Valor bruto sugerido para cada parcela.</div>
          )}
        </div>
      )}

      <div className="col-12 col-md-6">
        <label className="form-label" htmlFor="duams">
          DUAM(s) (opcional)
        </label>
        <input id="duams" type="text" className="form-control" placeholder="123, 456" {...register("duams")} />
        <div className="form-text">Separe multiplos numeros com virgula.</div>
      </div>

      <div className="col-12 d-flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Simulando..." : "Simular parcelamento"}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => {
            reset({
              tipoDevedor: "I",
              devedor: "",
              vencimento: today,
              tipoEntrada: "PERCENTUAL",
              percentualValorEntrada: undefined,
              valorParcelas: undefined,
              duams: ""
            });
            onClear?.();
          }}
        >
          Limpar
        </button>
      </div>
    </form>
  );
};

export default SimulationForm;
