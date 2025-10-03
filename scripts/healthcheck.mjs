import process from "node:process";

const baseUrl = process.env.HEALTHCHECK_BASE_URL ?? "http://127.0.0.1:3000";

async function safeFetch(path, init) {
  try {
    const response = await fetch(`${baseUrl}${path}`, init);
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json() : await response.text();
    return { response, payload };
  } catch (error) {
    return { error };
  }
}

async function main() {
  console.log(`[healthcheck] Base URL: ${baseUrl}`);

  const simResult = await safeFetch("/api/simular-repactuacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipoDevedor: "I", devedor: 0, vencimento: "1900-01-01", tipoEntrada: "PERCENTUAL" })
  });

  if (simResult.error) {
    console.error("[healthcheck] erro na simulação:", simResult.error);
    process.exitCode = 1;
  } else if (simResult.response.status === 200) {
    console.log("[healthcheck] simulação OK");
  } else {
    console.error("[healthcheck] simulação falhou", simResult.payload);
    process.exitCode = 1;
  }

  const searchResult = await safeFetch("/api/pesquisar-imoveis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpfCNPJ: "00000000000" })
  });

  if (searchResult.error) {
    console.warn("[healthcheck] pesquisa indisponível:", searchResult.error);
  } else if (searchResult.response.status === 501) {
    console.log("[healthcheck] pesquisa aguardando credenciais");
  } else if (searchResult.response.status === 200) {
    console.log("[healthcheck] pesquisa habilitada");
  } else {
    console.warn("[healthcheck] pesquisa retornou status", searchResult.response.status, searchResult.payload);
  }
}

main();
