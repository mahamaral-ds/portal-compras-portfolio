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
      "id": "rfp-cafe-especial",
      "categoria": "Café especial em grãos",
      "resultado": {
        "mes": "2025-11",
        "valor_k": 214
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
      "id": "rfp-leites",
      "categoria": "Leites e bebidas vegetais",
      "resultado": {
        "mes": "2025-12",
        "valor_k": 168
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
      "id": "rfp-bebidas-frias",
      "categoria": "Sucos, águas e bebidas frias",
      "resultado": {
        "mes": "2025-10",
        "valor_k": 54
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
      "id": "rfp-copos-tampas",
      "categoria": "Copos, tampas e descartáveis",
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
      "id": "rfp-paes-congelados",
      "categoria": "Pães e salgados congelados",
      "resultado": {
        "mes": "2025-11",
        "valor_k": 96
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
      "id": "rfp-confeitaria",
      "categoria": "Bolos e confeitaria de vitrine",
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
      "id": "rfp-frios",
      "categoria": "Frios e queijos fatiados",
      "resultado": {
        "mes": "2026-01",
        "valor_k": 38
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
      "id": "rfp-chocolates-xaropes",
      "categoria": "Chocolates, cacau e xaropes",
      "resultado": {
        "mes": "2025-12",
        "valor_k": 61
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
      "categoria": "Mercearia (açúcares, farinhas e grãos)",
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
      "id": "rfp-manutencao-maquinas",
      "categoria": "Manutenção de máquinas de espresso",
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
