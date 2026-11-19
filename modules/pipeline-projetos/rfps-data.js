// Dados da aba "Planejamento de RFPs" (pagina Pipeline) — versao de DEMONSTRACAO, com categorias e valores ficticios.
// Para atualizar: habilite a edicao no Pipeline, ajuste a aba e clique em "Exportar para publicacao"; salve o arquivo
// baixado aqui, substituindo este.
const RFPS_DATA = {
  "titulo": "Rodadas de concorrência por categoria",
  "janela": {
    "inicio": "2025-10",
    "meses": 16
  },
  "atualizado_em": "2026-10-20",
  "registros": [
    {
      "id": "rfp-hortifruti-bares",
      "categoria": "Hortifrúti Bares",
      "resultado": {
        "mes": "2025-11",
        "valor_k": 86
      },
      "marcos": [
        {
          "mes": "2026-02",
          "status": "concluido",
          "etapa": 2
        },
        {
          "mes": "2026-05",
          "status": "concluido",
          "etapa": 2
        },
        {
          "mes": "2026-09",
          "status": "em_andamento",
          "etapa": 2
        },
        {
          "mes": "2026-12",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-hortifruti-restaurantes",
      "categoria": "Hortifrúti Restaurantes",
      "resultado": {
        "mes": "2025-12",
        "valor_k": 142
      },
      "marcos": [
        {
          "mes": "2026-03",
          "status": "concluido",
          "etapa": 2
        },
        {
          "mes": "2026-07",
          "status": "atrasado",
          "etapa": 2
        },
        {
          "mes": "2026-11",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-bebidas-nao-alcoolicas",
      "categoria": "Bebidas não alcoólicas",
      "resultado": {
        "mes": "2025-10",
        "valor_k": 118
      },
      "marcos": [
        {
          "mes": "2026-04",
          "status": "concluido",
          "etapa": 2
        },
        {
          "mes": "2026-08",
          "status": "concluido",
          "etapa": 3
        },
        {
          "mes": "2026-12",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-cervejas",
      "categoria": "Cervejas e chopp",
      "resultado": null,
      "marcos": [
        {
          "mes": "2026-01",
          "status": "concluido",
          "etapa": 1
        },
        {
          "mes": "2026-06",
          "status": "em_andamento",
          "etapa": 2
        },
        {
          "mes": "2026-10",
          "status": "nao_iniciado",
          "etapa": null
        },
        {
          "mes": "2027-01",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-bovinos",
      "categoria": "Cortes bovinos",
      "resultado": {
        "mes": "2025-11",
        "valor_k": 205
      },
      "marcos": [
        {
          "mes": "2026-03",
          "status": "concluido",
          "etapa": 3
        },
        {
          "mes": "2026-08",
          "status": "em_andamento",
          "etapa": 3
        },
        {
          "mes": "2026-11",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-aves",
      "categoria": "Aves e ovos",
      "resultado": null,
      "marcos": [
        {
          "mes": "2026-02",
          "status": "concluido",
          "etapa": 2
        },
        {
          "mes": "2026-06",
          "status": "atrasado",
          "etapa": 2
        },
        {
          "mes": "2026-12",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-pescados",
      "categoria": "Pescados",
      "resultado": {
        "mes": "2026-01",
        "valor_k": 64
      },
      "marcos": [
        {
          "mes": "2026-05",
          "status": "concluido",
          "etapa": 1
        },
        {
          "mes": "2026-09",
          "status": "em_andamento",
          "etapa": 2
        },
        {
          "mes": "2027-01",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-laticinios",
      "categoria": "Laticínios",
      "resultado": {
        "mes": "2025-12",
        "valor_k": 97
      },
      "marcos": [
        {
          "mes": "2026-04",
          "status": "concluido",
          "etapa": 2
        },
        {
          "mes": "2026-08",
          "status": "concluido",
          "etapa": 3
        },
        {
          "mes": "2026-12",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-mercearia",
      "categoria": "Mercearia seca",
      "resultado": null,
      "marcos": [
        {
          "mes": "2026-07",
          "status": "concluido",
          "etapa": 1
        },
        {
          "mes": "2026-10",
          "status": "nao_iniciado",
          "etapa": 2
        },
        {
          "mes": "2027-01",
          "status": "planejado",
          "etapa": null
        }
      ]
    },
    {
      "id": "rfp-embalagens",
      "categoria": "Embalagens de delivery",
      "resultado": null,
      "marcos": [
        {
          "mes": "2026-09",
          "status": "em_andamento",
          "etapa": 2
        },
        {
          "mes": "2026-11",
          "status": "planejado",
          "etapa": null
        },
        {
          "mes": "2027-01",
          "status": "planejado",
          "etapa": null
        }
      ]
    }
  ]
};
