"""
Catalogo FICTICIO da Quintaluz Cafes — rede de cafeterias: lojas, formatos e regioes.

Unica fonte das lojas usadas pelo gerador de dados sinteticos
(scripts/gerar_dados_sinteticos.py) e pelo cruzamento loja -> codigo
(shared_py/casa_geo_map.py). Nenhum nome aqui corresponde a uma empresa real:
marcas, bairros, shoppings e cidades foram inventados para a demonstracao.

No codigo dos modulos a unidade de venda continua se chamando "casa" (nome das colunas das bases); nas paginas ela
aparece como "loja".

Formatos (coluna VERTICAL da base de CMV / SEGMENTO da base de notas):
    CAFETERIA - loja de rua completa: espresso, metodos filtrados, padaria e confeitaria
    QUIOSQUE  - ponto compacto em shopping, estacao ou aeroporto: cafe para levar e itens prontos
    BISTRO    - cafeteria com cozinha: brunch, sanduiches e pratos leves alem do cafe

Campos de cada loja:
    fantasia  - nome por extenso, como aparece na base de notas fiscais (coluna CASAS)
    codigo    - codigo curto usado nas bases de CMC e CMV
    vertical  - CAFETERIA, QUIOSQUE ou BISTRO
    regiao    - SP, RJ ou BR (BR = outras cidades)
    porte     - peso relativo de compras/vendas (1.0 = loja media)
    abertura  - primeiro mes com movimento ('AAAA-MM'); None = desde o inicio da base
"""

CASAS = [
    # Quintaluz Cafe — cafeterias de rua
    {'fantasia': 'QUINTALUZ CAFE VILA SERENA', 'codigo': 'QC-VSERENA', 'vertical': 'CAFETERIA', 'regiao': 'SP', 'porte': 1.4, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE JARDIM NORTE', 'codigo': 'QC-JNORTE', 'vertical': 'CAFETERIA', 'regiao': 'SP', 'porte': 1.2, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE ALTO DA COLINA', 'codigo': 'QC-COLINA', 'vertical': 'CAFETERIA', 'regiao': 'SP', 'porte': 1.1, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE ESTACAO SUL', 'codigo': 'QC-ESUL', 'vertical': 'CAFETERIA', 'regiao': 'SP', 'porte': 0.9, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE ORLA', 'codigo': 'QC-ORLA', 'vertical': 'CAFETERIA', 'regiao': 'RJ', 'porte': 1.2, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE MIRANTE', 'codigo': 'QC-MIRANTE', 'vertical': 'CAFETERIA', 'regiao': 'RJ', 'porte': 1.0, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE LAGOA AZUL', 'codigo': 'QC-LAGOA', 'vertical': 'CAFETERIA', 'regiao': 'RJ', 'porte': 0.9, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE SERRA ALTA', 'codigo': 'QC-SALTA', 'vertical': 'CAFETERIA', 'regiao': 'BR', 'porte': 0.9, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE PORTO CLARO', 'codigo': 'QC-PCLARO', 'vertical': 'CAFETERIA', 'regiao': 'BR', 'porte': 0.8, 'abertura': None},
    {'fantasia': 'QUINTALUZ CAFE VALE AZUL', 'codigo': 'QC-VAZUL', 'vertical': 'CAFETERIA', 'regiao': 'BR', 'porte': 0.7, 'abertura': '2026-06'},
    # Quintaluz Bistro — cafeterias com cozinha (brunch e pratos leves)
    {'fantasia': 'QUINTALUZ BISTRO PARQUE DAS AGUAS', 'codigo': 'QB-PAGUAS', 'vertical': 'BISTRO', 'regiao': 'SP', 'porte': 1.8, 'abertura': None},
    {'fantasia': 'QUINTALUZ BISTRO JARDIM NORTE', 'codigo': 'QB-JNORTE', 'vertical': 'BISTRO', 'regiao': 'SP', 'porte': 1.5, 'abertura': None},
    {'fantasia': 'QUINTALUZ BISTRO LAGOA BELA', 'codigo': 'QB-LBELA', 'vertical': 'BISTRO', 'regiao': 'RJ', 'porte': 1.6, 'abertura': None},
    {'fantasia': 'QUINTALUZ BISTRO ORLA', 'codigo': 'QB-ORLA', 'vertical': 'BISTRO', 'regiao': 'RJ', 'porte': 1.3, 'abertura': None},
    {'fantasia': 'QUINTALUZ BISTRO SERRA ALTA', 'codigo': 'QB-SALTA', 'vertical': 'BISTRO', 'regiao': 'BR', 'porte': 1.1, 'abertura': None},
    # Quintaluz Expresso — quiosques (cafe para levar)
    {'fantasia': 'QUINTALUZ EXPRESSO SHOPPING AURORA', 'codigo': 'QE-AURORA', 'vertical': 'QUIOSQUE', 'regiao': 'SP', 'porte': 0.55, 'abertura': None},
    {'fantasia': 'QUINTALUZ EXPRESSO CENTRO EMPRESARIAL', 'codigo': 'QE-CEMPR', 'vertical': 'QUIOSQUE', 'regiao': 'SP', 'porte': 0.5, 'abertura': None},
    {'fantasia': 'QUINTALUZ EXPRESSO TERMINAL NORTE', 'codigo': 'QE-TNORTE', 'vertical': 'QUIOSQUE', 'regiao': 'SP', 'porte': 0.6, 'abertura': None},
    {'fantasia': 'QUINTALUZ EXPRESSO SHOPPING ATLANTICO', 'codigo': 'QE-ATLANT', 'vertical': 'QUIOSQUE', 'regiao': 'RJ', 'porte': 0.5, 'abertura': None},
    {'fantasia': 'QUINTALUZ EXPRESSO ESTACAO MARITIMA', 'codigo': 'QE-EMARIT', 'vertical': 'QUIOSQUE', 'regiao': 'RJ', 'porte': 0.45, 'abertura': None},
    {'fantasia': 'QUINTALUZ EXPRESSO SHOPPING MIRANTE', 'codigo': 'QE-SMIRANTE', 'vertical': 'QUIOSQUE', 'regiao': 'BR', 'porte': 0.4, 'abertura': None},
    {'fantasia': 'QUINTALUZ EXPRESSO PORTO CLARO', 'codigo': 'QE-PCLARO', 'vertical': 'QUIOSQUE', 'regiao': 'BR', 'porte': 0.35, 'abertura': None},
    # Quiosque sazonal: existe na base de notas, mas nao tem codigo nas bases de CMC/CMV (exemplo de loja sem cruzamento)
    {'fantasia': 'QUINTALUZ EXPRESSO QUIOSQUE PRAIA', 'codigo': None, 'vertical': 'QUIOSQUE', 'regiao': 'RJ', 'porte': 0.2, 'abertura': None},
]

# Central de producao: torra parte do cafe, assa paes e confeitaria e abastece as lojas. Aparece so' na base de notas
# (segmento PRODUCAO CENTRAL); nao tem venda propria, por isso fica fora de CMC/CMV.
CENTRAL = {'fantasia': 'CPQ CENTRAL DE PRODUCAO QUINTALUZ', 'codigo': None, 'vertical': 'PRODUCAO CENTRAL',
           'regiao': 'SP', 'porte': 2.4, 'abertura': None}

# Empresa ficticia "intercompany": a central fatura para as lojas. Removida de todas as analises em
# shared_py/etl_common.py (FORNECEDORES_EXCLUIDOS), como uma transacao interna do proprio grupo.
FORNECEDOR_INTERCOMPANY = 'QUINTALUZ CENTRAL DE PRODUCAO LTDA'

NOME_GRUPO = 'Quintaluz Cafés'
