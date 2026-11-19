"""
Catalogo FICTICIO do Grupo Quintaluz Gastronomia — casas, verticais e regioes.

Unica fonte das casas usadas pelo gerador de dados sinteticos
(scripts/gerar_dados_sinteticos.py) e pelo cruzamento casa -> codigo
(shared_py/casa_geo_map.py). Nenhum nome aqui corresponde a uma empresa real:
marcas, bairros e cidades foram inventados para a demonstracao.

Campos de cada casa:
    fantasia  - nome por extenso, como aparece na base de notas fiscais (coluna CASAS)
    codigo    - codigo curto usado nas bases de CMC e CMV
    vertical  - RESTAURANTE, BAR ou CAFETERIA (coluna VERTICAL da base de CMV)
    regiao    - SP, RJ ou BR (BR = outras cidades)
    porte     - peso relativo de compras/vendas (1.0 = casa media)
    abertura  - primeiro mes com movimento ('AAAA-MM'); None = desde o inicio da base
"""

CASAS = [
    # Trattoria Quintaluz — cozinha italiana
    {'fantasia': 'TRATTORIA QUINTALUZ VILA SERENA', 'codigo': 'TQ-VSERENA', 'vertical': 'RESTAURANTE', 'regiao': 'SP', 'porte': 1.6, 'abertura': None},
    {'fantasia': 'TRATTORIA QUINTALUZ JARDIM NORTE', 'codigo': 'TQ-JNORTE', 'vertical': 'RESTAURANTE', 'regiao': 'SP', 'porte': 1.3, 'abertura': None},
    {'fantasia': 'TRATTORIA QUINTALUZ ORLA', 'codigo': 'TQ-ORLA', 'vertical': 'RESTAURANTE', 'regiao': 'RJ', 'porte': 1.4, 'abertura': None},
    {'fantasia': 'TRATTORIA QUINTALUZ SERRA ALTA', 'codigo': 'TQ-SALTA', 'vertical': 'RESTAURANTE', 'regiao': 'BR', 'porte': 0.9, 'abertura': None},
    {'fantasia': 'TRATTORIA QUINTALUZ VALE AZUL', 'codigo': 'TQ-VAZUL', 'vertical': 'RESTAURANTE', 'regiao': 'BR', 'porte': 0.8, 'abertura': '2026-06'},
    # Brasa Quintal — parrilla
    {'fantasia': 'BRASA QUINTAL ALTO DA COLINA', 'codigo': 'BQ-COLINA', 'vertical': 'RESTAURANTE', 'regiao': 'SP', 'porte': 1.8, 'abertura': None},
    {'fantasia': 'BRASA QUINTAL SHOPPING AURORA', 'codigo': 'BQ-AURORA', 'vertical': 'RESTAURANTE', 'regiao': 'SP', 'porte': 1.2, 'abertura': None},
    {'fantasia': 'BRASA QUINTAL MIRANTE', 'codigo': 'BQ-MIRANTE', 'vertical': 'RESTAURANTE', 'regiao': 'RJ', 'porte': 1.3, 'abertura': None},
    {'fantasia': 'BRASA QUINTAL PORTO CLARO', 'codigo': 'BQ-PCLARO', 'vertical': 'RESTAURANTE', 'regiao': 'BR', 'porte': 1.0, 'abertura': None},
    # Mare Quintaluz — frutos do mar
    {'fantasia': 'MARE QUINTALUZ LAGOA AZUL', 'codigo': 'MQ-LAGOA', 'vertical': 'RESTAURANTE', 'regiao': 'RJ', 'porte': 1.5, 'abertura': None},
    {'fantasia': 'MARE QUINTALUZ PARQUE DAS AGUAS', 'codigo': 'MQ-PAGUAS', 'vertical': 'RESTAURANTE', 'regiao': 'SP', 'porte': 1.1, 'abertura': None},
    {'fantasia': 'MARE QUINTALUZ LAGOA BELA', 'codigo': 'MQ-LBELA', 'vertical': 'RESTAURANTE', 'regiao': 'BR', 'porte': 0.8, 'abertura': None},
    # Boteco Quintal — bares
    {'fantasia': 'BOTECO QUINTAL VILA SERENA', 'codigo': 'BT-VSERENA', 'vertical': 'BAR', 'regiao': 'SP', 'porte': 1.0, 'abertura': None},
    {'fantasia': 'BOTECO QUINTAL JARDIM NORTE', 'codigo': 'BT-JNORTE', 'vertical': 'BAR', 'regiao': 'SP', 'porte': 0.9, 'abertura': None},
    {'fantasia': 'BOTECO QUINTAL ESTACAO SUL', 'codigo': 'BT-ESUL', 'vertical': 'BAR', 'regiao': 'SP', 'porte': 0.7, 'abertura': None},
    {'fantasia': 'BOTECO QUINTAL ORLA', 'codigo': 'BT-ORLA', 'vertical': 'BAR', 'regiao': 'RJ', 'porte': 1.0, 'abertura': None},
    {'fantasia': 'BOTECO QUINTAL SHOPPING ATLANTICO', 'codigo': 'BT-ATLANT', 'vertical': 'BAR', 'regiao': 'RJ', 'porte': 0.8, 'abertura': None},
    {'fantasia': 'BOTECO QUINTAL SERRA ALTA', 'codigo': 'BT-SALTA', 'vertical': 'BAR', 'regiao': 'BR', 'porte': 0.7, 'abertura': None},
    {'fantasia': 'BOTECO QUINTAL PORTO CLARO', 'codigo': 'BT-PCLARO', 'vertical': 'BAR', 'regiao': 'BR', 'porte': 0.6, 'abertura': None},
    # Cafe Quintal — cafeterias
    {'fantasia': 'CAFE QUINTAL VILA SERENA', 'codigo': 'CQ-VSERENA', 'vertical': 'CAFETERIA', 'regiao': 'SP', 'porte': 0.5, 'abertura': None},
    {'fantasia': 'CAFE QUINTAL SHOPPING AURORA', 'codigo': 'CQ-AURORA', 'vertical': 'CAFETERIA', 'regiao': 'SP', 'porte': 0.45, 'abertura': None},
    {'fantasia': 'CAFE QUINTAL MIRANTE', 'codigo': 'CQ-MIRANTE', 'vertical': 'CAFETERIA', 'regiao': 'RJ', 'porte': 0.45, 'abertura': None},
    {'fantasia': 'CAFE QUINTAL LAGOA BELA', 'codigo': 'CQ-LBELA', 'vertical': 'CAFETERIA', 'regiao': 'BR', 'porte': 0.35, 'abertura': None},
    # Quiosque sazonal: existe na base de notas, mas nao tem codigo nas bases de CMC/CMV (exemplo de casa sem cruzamento)
    {'fantasia': 'CAFE QUINTAL QUIOSQUE PRAIA', 'codigo': None, 'vertical': 'CAFETERIA', 'regiao': 'RJ', 'porte': 0.2, 'abertura': None},
]

# Central de producao: compra insumos e abastece as casas. Aparece so' na base de notas
# (segmento PRODUCAO CENTRAL); nao tem venda propria, por isso fica fora de CMC/CMV.
CENTRAL = {'fantasia': 'CPQ CENTRAL DE PRODUCAO QUINTALUZ', 'codigo': None, 'vertical': 'PRODUCAO CENTRAL',
           'regiao': 'SP', 'porte': 2.6, 'abertura': None}

# Empresa ficticia "intercompany": a central fatura para as casas. Removida de todas as analises em
# shared_py/etl_common.py (FORNECEDORES_EXCLUIDOS), como uma transacao interna do proprio grupo.
FORNECEDOR_INTERCOMPANY = 'QUINTALUZ CENTRAL DE PRODUCAO LTDA'

NOME_GRUPO = 'Grupo Quintaluz Gastronomia'
