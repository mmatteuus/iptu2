import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Parcela } from "../services/prodata";
import { formatCurrency, formatDate } from "../utils/format";

type ExportButtonsProps = {
  parcelas: Parcela[];
  limit?: number;
};

const headers = ["Parcela", "Vencimento", "Valor", "Juros", "Multa", "Correcao", "Expediente", "Saldo"];
const numberToCsv = (value?: number) => (value ?? 0).toFixed(2);
const getParcelaTotal = (parcela: Parcela) =>
  parcela.valorSaldoDevedor ??
  parcela.valorDivida + parcela.valorJuros + parcela.valorMulta + parcela.valorCorrecao + parcela.valorExpediente;

const ExportButtons = ({ parcelas, limit = 48 }: ExportButtonsProps) => {
  const hasData = parcelas.length > 0;
  const rows = parcelas.slice(0, limit);

  const handleCsv = () => {
    if (!hasData) return;
    const csvRows = rows.map((p) => [
      p.parcela,
      formatDate(p.vencimento),
      numberToCsv(p.valorDivida),
      numberToCsv(p.valorJuros),
      numberToCsv(p.valorMulta),
      numberToCsv(p.valorCorrecao),
      numberToCsv(p.valorExpediente),
      numberToCsv(getParcelaTotal(p))
    ]);
    const csvContent = [headers, ...csvRows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "simulacao_iptu.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handlePdf = () => {
    if (!hasData) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text("Simulacao de parcelamento IPTU", 14, 14);
    autoTable(doc, {
      head: [headers],
      body: rows.map((p) => [
        p.parcela,
        formatDate(p.vencimento),
        formatCurrency(p.valorDivida),
        formatCurrency(p.valorJuros),
        formatCurrency(p.valorMulta),
        formatCurrency(p.valorCorrecao),
        formatCurrency(p.valorExpediente),
        formatCurrency(getParcelaTotal(p))
      ]),
      styles: { fontSize: 9 }
    });
    doc.save("simulacao_iptu.pdf");
  };

  return (
    <div className="d-flex gap-2">
      <button type="button" className="btn btn-outline-secondary" onClick={handleCsv} disabled={!hasData}>
        Exportar CSV
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={handlePdf} disabled={!hasData}>
        Exportar PDF
      </button>
    </div>
  );
};

export default ExportButtons;