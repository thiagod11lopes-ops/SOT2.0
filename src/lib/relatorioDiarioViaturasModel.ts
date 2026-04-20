export const RDV_STATUS_OPTIONS = [
  "Operando",
  "Inoperante",
  "Destacada",
  "Reserva",
  "Manutencao",
] as const;

export type RdvStatus = (typeof RDV_STATUS_OPTIONS)[number];

export type RdvRowAmb = {
  id: string;
  tipo: string;
  placa: string;
  ano: string;
  situacao: RdvStatus;
  vidaUtil: string;
  especificacao: string;
  observacao: string;
  /** Viatura na oficina (coluna OFICINA na planilha / PDF). */
  naOficina: boolean;
};

export type RdvRowAdm = {
  id: string;
  tipo: string;
  placa: string;
  ano: string;
  situacao: RdvStatus;
  vidaUtil: string;
  observacao: string;
  /** Viatura na oficina (coluna OFICINA na planilha / PDF). */
  naOficina: boolean;
};

export function newRdvId(): string {
  return crypto.randomUUID();
}

type AmbSeed = {
  id?: string;
  tipo: string;
  placa: string;
  ano: number | string;
  situacao: RdvStatus;
  vidaUtil: number | string;
  especificacao: string;
  observacao: string;
  naOficina?: boolean;
};

function amb(partial: AmbSeed): RdvRowAmb {
  return {
    id: partial.id ?? newRdvId(),
    tipo: partial.tipo,
    placa: partial.placa,
    ano: String(partial.ano ?? ""),
    situacao: partial.situacao,
    vidaUtil: String(partial.vidaUtil ?? ""),
    especificacao: partial.especificacao,
    observacao: partial.observacao,
    naOficina: partial.naOficina === true,
  };
}

type AdmSeed = {
  id?: string;
  tipo: string;
  placa: string;
  ano: number | string;
  situacao: RdvStatus;
  vidaUtil: number | string;
  observacao: string;
  naOficina?: boolean;
};

function adm(partial: AdmSeed): RdvRowAdm {
  return {
    id: partial.id ?? newRdvId(),
    tipo: partial.tipo,
    placa: partial.placa,
    ano: String(partial.ano ?? ""),
    situacao: partial.situacao,
    vidaUtil: String(partial.vidaUtil ?? ""),
    observacao: partial.observacao,
    naOficina: partial.naOficina === true,
  };
}

/** Dados iniciais alinhados ao HTML legado `RelatorioDiarioViaturas.html`. */
export function createInitialRdvRows(): { amb: RdvRowAmb[]; adm: RdvRowAdm[] } {
  const ambRows: RdvRowAmb[] = [
    amb({
      tipo: "DUCATO",
      placa: "KPH-9E52",
      ano: 2012,
      situacao: "Operando",
      vidaUtil: 2020,
      especificacao: "UTI MÓVEL",
      observacao: "Maca.",
    }),
    amb({
      tipo: "DUCATO",
      placa: "KPH-9E53",
      ano: 2012,
      situacao: "Operando",
      vidaUtil: 2020,
      especificacao: "UTI NEO",
      observacao: "Vazamento no Exaustor",
    }),
    amb({
      tipo: "DUCATO",
      placa: "KPH-9E54",
      ano: 2012,
      situacao: "Destacada",
      vidaUtil: 2020,
      especificacao: "USB",
      observacao: "DST NOV/25 (IJSM)/Maca Inop.",
    }),
    amb({
      tipo: "SPRINTER",
      placa: "KVZ-8O89",
      ano: 2012,
      situacao: "Inoperante",
      vidaUtil: 2020,
      especificacao: "USB",
      observacao: "Inversor RUIM",
    }),
    amb({
      tipo: "SPRINTER",
      placa: "KVZ-8O91",
      ano: 2012,
      situacao: "Inoperante",
      vidaUtil: 2020,
      especificacao: "USB",
      observacao: "Fumacando",
    }),
    amb({
      tipo: "SPRINTER",
      placa: "KPK-4H03",
      ano: 2012,
      situacao: "Destacada",
      vidaUtil: 2020,
      especificacao: "UTI MÓVEL",
      observacao: "DST ESM/Sem estepe.",
    }),
    amb({
      tipo: "SPRINTER",
      placa: "RIV-9I01",
      ano: 2021,
      situacao: "Operando",
      vidaUtil: 2029,
      especificacao: "UTI MÓVEL",
      observacao: "Sem restrição.",
    }),
    amb({
      tipo: "SPRINTER",
      placa: "RKK-9I27",
      ano: 2021,
      situacao: "Operando",
      vidaUtil: 2029,
      especificacao: "UTI MÓVEL",
      observacao: "Sensor de frenagem avariado.",
    }),
    amb({
      tipo: "MASTER",
      placa: "TTD-1A38",
      ano: 2024,
      situacao: "Operando",
      vidaUtil: 2032,
      especificacao: "UTI MÓVEL",
      observacao: "Sem restrição.",
    }),
    amb({
      tipo: "MASTER",
      placa: "TTP-2G26",
      ano: 2025,
      situacao: "Operando",
      vidaUtil: 2033,
      especificacao: "USB",
      observacao: "Sem restrição.",
    }),
  ];

  const admRows: RdvRowAdm[] = [
    adm({
      tipo: "CLIO",
      placa: "KRQ-0G70",
      ano: 2007,
      situacao: "Operando",
      vidaUtil: 2014,
      observacao: "Ar Condicionado ruim.",
    }),
    adm({
      tipo: "DUCATO",
      placa: "LPE-2A05",
      ano: 2008,
      situacao: "Operando",
      vidaUtil: 2015,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "DUCATO",
      placa: "LPE-4G44",
      ano: 2008,
      situacao: "Destacada",
      vidaUtil: 2015,
      observacao: "Emprestada a ESM até dia 29/10/25. Sem restrição.",
    }),
    adm({
      tipo: "DUCATO",
      placa: "KZV-6G41",
      ano: 2006,
      situacao: "Operando",
      vidaUtil: 2013,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "CAMINHÃO",
      placa: "LKL-8D08",
      ano: 2007,
      situacao: "Operando",
      vidaUtil: 2019,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "CAMINHÃO",
      placa: "KVZ-7A70",
      ano: 2012,
      situacao: "Operando",
      vidaUtil: 2024,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "HONDA CIVIC",
      placa: "KZT-1560",
      ano: 2005,
      situacao: "Operando",
      vidaUtil: 2013,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "SANTANA",
      placa: "LNC-1A94",
      ano: 2000,
      situacao: "Inoperante",
      vidaUtil: 2008,
      observacao: "Processo de LVAO.",
    }),
    adm({
      tipo: "DOBLÓ",
      placa: "NVT-8G55",
      ano: 2011,
      situacao: "Operando",
      vidaUtil: 2018,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "DOBLÓ",
      placa: "KPG-9A79",
      ano: 2012,
      situacao: "Operando",
      vidaUtil: 2019,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "DOBLÓ",
      placa: "LQS-1F32",
      ano: 2012,
      situacao: "Inoperante",
      vidaUtil: 2019,
      observacao: "Oficina",
    }),
    adm({
      tipo: "COROLLA",
      placa: "LTI-2281",
      ano: 2017,
      situacao: "Operando",
      vidaUtil: 2024,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "FORD KA",
      placa: "RJN-4I27",
      ano: 2020,
      situacao: "Operando",
      vidaUtil: 2027,
      observacao: "Sem restrição.",
    }),
    adm({
      tipo: "PEUGEOT 408",
      placa: "LSE-3253",
      ano: 2016,
      situacao: "Operando",
      vidaUtil: 2023,
      observacao: "Sem restrição.",
    }),
  ];

  return { amb: ambRows, adm: admRows };
}

export function weekdayPtBrFromIsoDate(iso: string): string {
  if (!iso.trim()) return "";
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return "";
  const date = new Date(y, m - 1, d);
  const dias = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  return dias[date.getDay()] ?? "";
}

type Count3 = { Operando: number; Inoperante: number; Destacada: number };

export function countResumoSituacao(rows: { situacao: RdvStatus }[]): Count3 {
  const out: Count3 = { Operando: 0, Inoperante: 0, Destacada: 0 };
  for (const r of rows) {
    if (r.situacao === "Operando") out.Operando += 1;
    else if (r.situacao === "Inoperante") out.Inoperante += 1;
    else if (r.situacao === "Destacada") out.Destacada += 1;
  }
  return out;
}

export function emptyAmbRow(): RdvRowAmb {
  return {
    id: newRdvId(),
    tipo: "",
    placa: "",
    ano: "",
    situacao: "Operando",
    vidaUtil: "",
    especificacao: "",
    observacao: "",
    naOficina: false,
  };
}

export function emptyAdmRow(): RdvRowAdm {
  return {
    id: newRdvId(),
    tipo: "",
    placa: "",
    ano: "",
    situacao: "Operando",
    vidaUtil: "",
    observacao: "",
    naOficina: false,
  };
}
