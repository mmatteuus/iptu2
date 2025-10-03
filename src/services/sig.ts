export type ImovelPesquisa = {
  nome: string;
  cgc: number;
  cci: number;
  ccp: number;
  inscricao?: string;
  logradouro?: string;
  bairro?: string;
};

export async function pesquisarImoveisPorDocumento(cpfCNPJ: string): Promise<ImovelPesquisa[]> {
  const doc = cpfCNPJ.replace(/\D/g, "");
  const res = await fetch("/api/pesquisar-imoveis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpfCNPJ: doc })
  });
  if (res.status === 501) throw new Error("Pesquisa por CPF/CNPJ desabilitada (sem credenciais). Use CCI/CCP/DUAM.");
  if (!res.ok) throw new Error(`Falha na pesquisa (${res.status})`);
  return (await res.json()) as ImovelPesquisa[];
}
