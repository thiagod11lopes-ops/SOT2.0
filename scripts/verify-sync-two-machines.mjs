import assert from "node:assert/strict";

function applyUpdateWithExpectedVersion(record, patch, expectedBaseVersion, updatedBy) {
  if (record.version !== expectedBaseVersion) {
    const err = new Error(
      `Conflito de versão: esperado ${expectedBaseVersion}, remoto ${record.version}.`,
    );
    err.code = "version-conflict";
    throw err;
  }
  return {
    ...record,
    ...patch,
    version: record.version + 1,
    updatedAt: Date.now(),
    updatedBy,
  };
}

function run() {
  const base = {
    id: "dep-1",
    version: 1,
    updatedAt: Date.now() - 1000,
    updatedBy: "machine-a",
    setor: "S1",
    objetivoSaida: "Objetivo inicial",
  };

  // Duas máquinas leem a mesma base (v1).
  const viewA = { ...base };
  const viewB = { ...base };

  // Máquina A salva primeiro: deve subir para v2.
  const afterA = applyUpdateWithExpectedVersion(
    base,
    { objetivoSaida: "Atualizado por A" },
    viewA.version,
    "machine-a",
  );
  assert.equal(afterA.version, 2);
  assert.equal(afterA.objetivoSaida, "Atualizado por A");

  // Máquina B tenta salvar usando base antiga (v1): deve falhar por conflito.
  let conflict = false;
  try {
    applyUpdateWithExpectedVersion(
      afterA,
      { setor: "S2" },
      viewB.version,
      "machine-b",
    );
  } catch (e) {
    conflict = e instanceof Error && e.message.includes("Conflito de versão");
  }
  assert.equal(conflict, true, "Esperava conflito ao salvar com versão antiga.");

  console.log("OK: cenário 2 máquinas validado (A salva, B conflita com base antiga).");
}

run();
