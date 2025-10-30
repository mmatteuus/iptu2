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

  const simResult = await safeFetch("/api/simulacao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identificacao: { inscricaoImobiliaria: "000000000000" },
      itensSelecionados: [{ id: "healthcheck", valor: 0 }],
      opcoes: { parcelas: 1, vencimento: "1900-01-01" }
    })
  });

  if (simResult.error) {
    console.error("[healthcheck] erro na simulacao:", simResult.error);
    process.exitCode = 1;
  } else if (!simResult.response) {
    console.error("[healthcheck] simulacao sem resposta");
    process.exitCode = 1;
  } else if (simResult.response.status >= 500) {
    console.error("[healthcheck] simulacao falhou", simResult.payload);
    process.exitCode = 1;
  } else if (simResult.response.status === 200) {
    if (simResult.payload && typeof simResult.payload === "object" && simResult.payload.modo === "mock") {
      console.log("[healthcheck] simulacao em modo mock (credenciais Prodata ausentes)");
    } else {
      console.log("[healthcheck] simulacao OK");
    }
  } else {
    console.warn(
      `[healthcheck] simulacao respondeu ${simResult.response.status}, considere revisar credenciais/dados`,
      simResult.payload
    );
  }

  const searchResult = await safeFetch("/api/debitos?inscricao=000000000000", {
    method: "GET"
  });

  if (searchResult.error) {
    console.warn("[healthcheck] pesquisa indisponivel:", searchResult.error);
  } else if (searchResult.response.status === 501) {
    console.log("[healthcheck] debitos aguardando credenciais SIG");
  } else if (searchResult.response.status === 503) {
    console.log("[healthcheck] debitos aguardando credenciais Prodata");
  } else if (searchResult.response.status === 200) {
    console.log("[healthcheck] debitos habilitados");
  } else if (searchResult.response.status === 422 || searchResult.response.status === 400) {
    console.log("[healthcheck] debitos responderam com validacao (esperado sem dados reais)");
  } else {
    console.warn("[healthcheck] debitos retornaram status", searchResult.response.status, searchResult.payload);
  }
}

main();
