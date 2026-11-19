"""
Gera TODAS as bases de origem do portal com dados 100% sinteticos (Quintaluz Cafes, rede de cafeterias ficticia).

As planilhas seguem exatamente o esquema (abas, colunas e tipos) que os scripts build_data.py de cada modulo leem,
entao nenhuma pagina precisa de alteracao de logica. Tudo e' derivado de uma semente fixa (SEED): rodar de novo
gera arquivos identicos.

Saidas (em raw-data/):
    base-raw-compras.xlsx        notas fiscais de compra, uma linha por item de nota (Jan-Ago/2026)
    complemento_fornecedores.xlsx  CNPJ, UF e PMP de cada fornecedor
    OTIF_base.xlsx               pedidos com prazo/completude de entrega (aba BASE)
    base-CMC.xlsx                vendas x compras por loja e mes (aba CMC)
    cmv-casas.xlsx               receita liquida x CMV por loja e mes (aba CMV_CASAS)
    base-KPIs.xlsx               inflacao interna, PMP, DIO, cotacoes, contratos e CMV (Jan/2025-Ago/2026)
    indices-mercado.json         IPCA por grupo e dolar (series sinteticas, usadas pela pagina de Commodities)

Coerencia entre as bases:
    - compras de alimentos/cafes/bebidas da base de CMC = soma das notas de cada loja e mes;
    - CMV por loja = custo das compras / receita; o CMV mensal dos KPIs vem da base de CMV;
    - pedidos do OTIF sao as proprias notas fiscais geradas (mesmo fornecedor, loja, data e valor);
    - a inflacao interna dos KPIs e' o indice de preco pago calculado sobre as notas;
    - o IPCA sintetico de cada familia de commodity acompanha o choque de preco usado nas notas.

Uso:
    python scripts/gerar_dados_sinteticos.py
"""
import json
import math
import zlib
import os
import sys
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

SEED = 20261030
RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SAIDA = os.path.join(RAIZ, 'raw-data')
sys.path.insert(0, os.path.join(RAIZ, 'shared_py'))
from catalogo_ficticio import CASAS, CENTRAL, FORNECEDOR_INTERCOMPANY  # noqa: E402

rng = np.random.default_rng(SEED)

MESES = [f'2026-{m:02d}' for m in range(1, 9)]
MESES_KPI = [f'2025-{m:02d}' for m in range(1, 13)] + MESES
# cafeteria vende mais no frio (maio a agosto) e menos nas ferias de verao, quando os escritorios esvaziam
SAZONALIDADE = {'01': 0.93, '02': 0.9, '03': 0.99, '04': 1.01, '05': 1.05, '06': 1.09, '07': 1.11, '08': 1.04}
PEDIDOS_POR_MES = 90          # pedidos (notas) por mes para uma loja de porte 1.0
ESCALA_QTD = 0.62           # porte de cafeteria: receita media de algumas centenas de milhares de reais por mes

# =====================================================================================================================
# Catalogo de itens de uma rede de cafeterias: GRUPO -> SUBGRUPO -> "NOME|UM|preco base". Itens genericos, sem marca.
# =====================================================================================================================
CATALOGO = {
    'CAFES': {
        'CAFES ESPECIAIS': """CAFE ESPECIAL BLEND ESPRESSO GRAOS|KG|118
            CAFE ESPECIAL BOURBON AMARELO GRAOS|KG|142
            CAFE ESPECIAL CATUAI VERMELHO GRAOS|KG|134
            CAFE ESPECIAL FERMENTADO MICROLOTE GRAOS|KG|210
            CAFE ESPECIAL DESCAFEINADO GRAOS|KG|128
            CAFE ESPECIAL PARA FILTRADOS GRAOS|KG|126
            CAFE ESPECIAL SAFRA SAZONAL GRAOS|KG|156
            CAFE COLD BREW CONCENTRADO|LITRO|46""",
        'CAFE VERDE': """CAFE VERDE ARABICA BICA CORRIDA|KG|39
            CAFE VERDE ARABICA FINO|KG|52
            CAFE VERDE ESPECIAL MICROLOTE|KG|78""",
        'CAFES TRADICIONAIS': """CAFE TORRADO BLEND TRADICIONAL GRAOS|KG|72
            CAFE MOIDO TRADICIONAL|KG|58
            CAFE SOLUVEL GRANULADO|KG|96
            CAPSULA DE CAFE ESPRESSO|UNID|2.2
            CAFE EM SACHE PARA COADOR|UNID|1.4""",
        'CHAS E INFUSOES': """CHA PRETO EM FOLHAS|KG|160
            CHA VERDE EM FOLHAS|KG|175
            MATCHA EM PO|KG|420
            CHAI LATTE EM PO|KG|88
            INFUSAO DE FRUTAS VERMELHAS|KG|130
            CHA DE CAMOMILA SACHE|UNID|0.45
            CHA DE HORTELA SACHE|UNID|0.45
            CHA MATE TOSTADO|KG|42""",
    },
    'LATICINIOS': {
        'LEITES': """LEITE INTEGRAL|LITRO|5.3
            LEITE DESNATADO|LITRO|5.4
            LEITE SEM LACTOSE|LITRO|6.6
            LEITE INTEGRAL BARISTA|LITRO|7.4
            LEITE CONDENSADO|KG|19
            LEITE EM PO INTEGRAL|KG|42""",
        'BEBIDAS VEGETAIS': """BEBIDA DE AVEIA BARISTA|LITRO|18
            BEBIDA DE AMENDOAS|LITRO|22
            BEBIDA DE COCO|LITRO|16
            BEBIDA DE SOJA|LITRO|9.5""",
        'QUEIJOS': """QUEIJO MUSSARELA FATIADO|KG|46
            QUEIJO PRATO FATIADO|KG|48
            QUEIJO MINAS FRESCAL|KG|38
            QUEIJO CANASTRA MEIA CURA|KG|96
            QUEIJO BRIE|KG|86
            CREAM CHEESE|KG|44
            REQUEIJAO CREMOSO|KG|29
            QUEIJO PARMESAO RALADO|KG|98""",
        'CREMES E MANTEIGAS': """MANTEIGA SEM SAL|KG|54
            MANTEIGA COM SAL|KG|52
            CREME DE LEITE FRESCO|LITRO|25
            CREME DE LEITE UHT|LITRO|17
            CREME CHANTILLY|LITRO|28
            IOGURTE NATURAL INTEGRAL|KG|15
            IOGURTE GREGO|KG|26""",
    },
    'PADARIA': {
        'PAES': """PAO DE QUEIJO CONGELADO|KG|27
            CROISSANT DE MANTEIGA CONGELADO|UNID|4.1
            PAO NA CHAPA FRANCES|KG|17
            PAO DE FORMA INTEGRAL|UNID|11
            PAO BRIOCHE|UNID|2.6
            CIABATTA|UNID|3.6
            BAGEL|UNID|3.9
            PAO DE FERMENTACAO NATURAL|UNID|19
            PAO DE MILHO|UNID|2.2""",
        'SALGADOS ASSADOS': """FOLHADO DE PRESUNTO E QUEIJO|UNID|5.8
            EMPADA DE FRANGO|UNID|5.2
            QUICHE DE ALHO PORO|UNID|11
            ESFIHA ABERTA DE QUEIJO|UNID|4.6
            CROISSANT RECHEADO PRESUNTO E QUEIJO|UNID|7.9""",
    },
    'CONFEITARIA': {
        'BOLOS E TORTAS': """BOLO DE CENOURA COM CHOCOLATE|UNID|42
            BOLO DE FUBA|UNID|34
            BOLO DE LARANJA|UNID|36
            TORTA DE LIMAO|UNID|68
            CHEESECAKE DE FRUTAS VERMELHAS|UNID|92
            TORTA HOLANDESA|UNID|88
            BOLO RED VELVET|UNID|96""",
        'DOCES E BISCOITOS': """COOKIE DE CHOCOLATE|UNID|4.3
            BROWNIE|UNID|6.6
            MUFFIN DE BLUEBERRY|UNID|6.2
            MACARON SORTIDO|UNID|5.5
            CANNOLI|UNID|7.2
            BISCOITO AMANTEIGADO|KG|58
            ALFAJOR|UNID|4.9
            CINNAMON ROLL|UNID|8.4""",
    },
    'MERCEARIA': {
        'FARINACEOS': """FARINHA DE TRIGO TIPO 1|KG|4.7
            FARINHA DE TRIGO PARA CONFEITARIA|KG|6.9
            FARINHA DE AMENDOAS|KG|98
            FUBA MIMOSO|KG|5.2
            POLVILHO AZEDO|KG|11
            AMIDO DE MILHO|KG|11
            FERMENTO BIOLOGICO SECO|KG|46""",
        'ACUCARES E ADOCANTES': """ACUCAR REFINADO|KG|4.9
            ACUCAR CRISTAL|KG|4.4
            ACUCAR DEMERARA|KG|9.8
            ACUCAR MASCAVO|KG|12
            ACUCAR DE CONFEITEIRO|KG|11
            ACUCAR SACHE 5G|UNID|0.07
            ADOCANTE SACHE|UNID|0.09
            MEL SILVESTRE|KG|44""",
        'CHOCOLATES E CACAU': """CHOCOLATE EM PO 50 CACAU|KG|64
            CACAU EM PO ALCALINO|KG|92
            CHOCOLATE MEIO AMARGO GOTAS|KG|72
            CHOCOLATE BRANCO GOTAS|KG|68
            NIBS DE CACAU|KG|110""",
        'XAROPES E CALDAS': """XAROPE DE BAUNILHA 700ML|UNID|48
            XAROPE DE CARAMELO 700ML|UNID|48
            XAROPE DE AVELA 700ML|UNID|52
            CALDA DE CHOCOLATE|KG|36
            CALDA DE CARAMELO SALGADO|KG|39
            DOCE DE LEITE|KG|24""",
        'GRAOS E SEMENTES': """GRANOLA SEM ACUCAR|KG|38
            AVEIA EM FLOCOS|KG|12
            CASTANHA DE CAJU|KG|86
            AMENDOAS LAMINADAS|KG|118
            CHIA|KG|34""",
        'GELEIAS E PASTAS': """GELEIA DE FRUTAS VERMELHAS|KG|38
            PASTA DE AMENDOIM|KG|36
            CREME DE AVELA|KG|62
            PASTA DE PISTACHE|KG|240
            AZEITE EXTRA VIRGEM|LITRO|48
            MAIONESE|KG|17""",
    },
    'FRIOS E PROTEINAS': {
        'FRIOS E EMBUTIDOS': """PRESUNTO COZIDO FATIADO|KG|42
            PEITO DE PERU DEFUMADO FATIADO|KG|68
            SALAME ITALIANO FATIADO|KG|96
            MORTADELA FATIADA|KG|32
            BACON EM CUBOS|KG|46
            PRESUNTO CRU FATIADO|KG|168""",
        'OVOS E AVES': """OVOS BRANCOS|UNID|0.78
            OVOS CAIPIRA|UNID|1.1
            PEITO DE FRANGO SEM OSSO|KG|20
            FRANGO DESFIADO TEMPERADO|KG|36
            SALMAO DEFUMADO FATIADO|KG|240""",
    },
    'HORTIFRUTI': {
        'FLV-FRUTAS': """BANANA PRATA|KG|6.4
            MORANGO|KG|25
            LARANJA PERA|KG|4.3
            LIMAO TAHITI|KG|6
            MAMAO FORMOSA|KG|6.9
            ABACAXI PEROLA|UNID|7.6
            FRUTAS VERMELHAS MIX|KG|48
            MANGA PALMER|KG|8.5
            ABACATE|KG|9.6
            MARACUJA AZEDO|KG|11""",
        'FLV-VERDURAS': """ALFACE AMERICANA|UNID|4.3
            RUCULA MACO|UNID|3.7
            MIX DE FOLHAS|KG|38
            MANJERICAO MACO|UNID|4.5
            HORTELA MACO|UNID|4""",
        'FLV-LEGUMES': """TOMATE ITALIANO|KG|7.6
            TOMATE CEREJA|KG|16
            CEBOLA ROXA|KG|6.5
            CENOURA|KG|5
            PEPINO JAPONES|KG|7.2""",
    },
    'CONGELADOS': {
        'SALGADOS CONGELADOS': """MINI PAO DE QUEIJO CONGELADO|KG|29
            COXINHA DE FRANGO CONGELADA|UNID|3.1
            CROQUETE DE CARNE CONGELADO|UNID|3.3
            WAFFLE CONGELADO|UNID|3.8""",
        'SORVETES E ACAI': """SORVETE DE CREME|LITRO|22
            GELATO DE PISTACHE|LITRO|58
            ACAI POLPA CONGELADA|KG|26""",
        'POLPAS': """POLPA DE MORANGO|KG|18
            POLPA DE MARACUJA|KG|19
            POLPA DE MANGA|KG|17""",
    },
    'BEBIDAS': {
        'SUCOS': """SUCO DE LARANJA INTEGRAL|LITRO|11
            SUCO DE UVA INTEGRAL|LITRO|14
            SUCO VERDE PRENSADO 300ML|UNID|9.8
            AGUA DE COCO|LITRO|9.9""",
        'AGUAS': """AGUA MINERAL SEM GAS 500ML|UNID|1.5
            AGUA MINERAL COM GAS 500ML|UNID|1.7
            AGUA MINERAL VIDRO 300ML|UNID|2.4""",
        'REFRIGERANTES': """REFRIGERANTE COLA LATA 350ML|UNID|3.7
            REFRIGERANTE ZERO LATA 350ML|UNID|3.7
            REFRIGERANTE GUARANA LATA 350ML|UNID|3.3
            TONICA LATA 350ML|UNID|4""",
        'CHAS GELADOS E KOMBUCHA': """CHA GELADO DE PESSEGO LATA|UNID|4.5
            KOMBUCHA GARRAFA 355ML|UNID|9.6
            ENERGETICO LATA 250ML|UNID|7.4""",
    },
    'PRODUCAO CENTRAL': {
        'INSUMOS DE PRODUCAO': """ETIQUETA DE VALIDADE|UNID|0.09
            SACO VALVULADO PARA CAFE 1KG|UNID|1.6""",
    },
    'REFEICAO FUNCIONARIOS': {
        'REFEICOES': """MARMITA REFEICAO FUNCIONARIO|UNID|17""",
    },
    'CPQ - PRODUCAO': {
        'TRANSFERENCIAS': """CAIXA TERMICA DE TRANSPORTE|UNID|38""",
    },
    # ---- grupos "nao produto" (excluidos das analises de compra de insumos, como no portal original) ----
    'DESCARTAVEIS': {
        'COPOS E TAMPAS': """COPO DE PAPEL 240ML|UNID|0.32
            COPO DE PAPEL 360ML|UNID|0.38
            COPO DE PAPEL 480ML|UNID|0.44
            TAMPA PARA COPO DE PAPEL|UNID|0.18
            COPO PET 500ML PARA GELADOS|UNID|0.36
            LUVA TERMICA PARA COPO|UNID|0.12
            PORTA COPOS DE PAPELAO 2 LUGARES|UNID|0.85
            MEXEDOR DE MADEIRA|UNID|0.03""",
        'EMBALAGENS': """SACO KRAFT PARA PAES|UNID|0.22
            CAIXA PARA BOLO|UNID|2.4
            EMBALAGEM DELIVERY KRAFT|UNID|1.3
            GUARDANAPO DE PAPEL|UNID|0.03
            CANUDO DE PAPEL|UNID|0.06
            FILTRO DE PAPEL PARA COADOR|UNID|0.09
            PAPEL FILME PVC|UNID|39""",
    },
    'CONSUMO': {
        'LIMPEZA': """PASTILHA DE LIMPEZA PARA MAQUINA DE ESPRESSO|UNID|2.9
            DETERGENTE PARA LIMPEZA DE LEITEIRA|LITRO|38
            DESCALCIFICANTE PARA MAQUINA|LITRO|52
            DETERGENTE NEUTRO|LITRO|6.5
            ALCOOL 70|LITRO|11
            PANO DE MICROFIBRA|UNID|4.9
            SACO DE LIXO 100L|UNID|0.86""",
    },
    'UTENSILIOS': {
        'BARISTA E SALAO': """JARRA LEITEIRA INOX 600ML|UNID|96
            TAMPER INOX|UNID|180
            XICARA DE PORCELANA PARA ESPRESSO|UNID|28
            XICARA DE PORCELANA PARA CAPPUCCINO|UNID|34
            BALANCA DE PRECISAO PARA BARISTA|UNID|260
            COADOR DE VIDRO|UNID|145""",
    },
    'MANUTENCAO': {
        'REPAROS': """MANUTENCAO PREVENTIVA MAQUINA DE ESPRESSO|UNID|980
            TROCA DE BORRACHAS DO GRUPO|UNID|420
            REFIL DE FILTRO DE AGUA|UNID|380
            REPARO DE MOEDOR|UNID|640
            MANUTENCAO DE VITRINE REFRIGERADA|UNID|1250
            REPARO ELETRICO|UNID|690
            LAMPADA LED|UNID|19""",
    },
    'MAQUINAS E EQUIPAMENTOS': {
        'EQUIPAMENTOS': """MOEDOR DE CAFE PROFISSIONAL|UNID|9800
            MAQUINA DE ESPRESSO PECA DE REPOSICAO|UNID|2400
            LIQUIDIFICADOR PROFISSIONAL|UNID|1950
            FORNO TURBO ELETRICO|UNID|6900
            SANDUICHEIRA PROFISSIONAL|UNID|1450""",
    },
    'SERVICOS': {
        'SERVICOS GERAIS': """DEDETIZACAO|UNID|980
            LAVANDERIA DE UNIFORMES|UNID|720
            ANALISE DE AGUA|UNID|340
            TREINAMENTO DE BARISTAS|UNID|1800
            COLETA DE BORRA DE CAFE PARA COMPOSTAGEM|UNID|260""",
    },
}

# Popularidade fixa dos itens de maior giro (os demais sorteiam uma lognormal com mediana 1)
ITENS_DE_GIRO = {
    'CAFE ESPECIAL BLEND ESPRESSO GRAOS': 9.0, 'CAFE TORRADO BLEND TRADICIONAL GRAOS': 4.0, 'CAFE VERDE ARABICA FINO': 6.0,
    'CAFE VERDE ARABICA BICA CORRIDA': 4.0, 'LEITE INTEGRAL BARISTA': 9.0, 'LEITE INTEGRAL': 6.0,
    'LEITE SEM LACTOSE': 2.5, 'BEBIDA DE AVEIA BARISTA': 5.0, 'MANTEIGA SEM SAL': 4.0, 'CREME DE LEITE FRESCO': 3.0,
    'QUEIJO MUSSARELA FATIADO': 3.0, 'PAO DE QUEIJO CONGELADO': 7.0, 'CROISSANT DE MANTEIGA CONGELADO': 6.0,
    'PAO NA CHAPA FRANCES': 4.0, 'BOLO DE CENOURA COM CHOCOLATE': 4.0, 'COOKIE DE CHOCOLATE': 4.0, 'BROWNIE': 3.0,
    'FARINHA DE TRIGO TIPO 1': 5.0, 'ACUCAR REFINADO': 4.0, 'ACUCAR SACHE 5G': 4.0, 'CHOCOLATE EM PO 50 CACAU': 3.0,
    'XAROPE DE CARAMELO 700ML': 2.5, 'COPO DE PAPEL 240ML': 6.0, 'COPO DE PAPEL 360ML': 6.0, 'TAMPA PARA COPO DE PAPEL': 7.0,
    'OVOS BRANCOS': 4.0, 'BANANA PRATA': 3.0, 'MORANGO': 3.0, 'SUCO DE LARANJA INTEGRAL': 4.0,
    'AGUA MINERAL SEM GAS 500ML': 4.0,
}

GRUPOS_NAO_PRODUTO = {'DESCARTAVEIS', 'CONSUMO', 'UTENSILIOS', 'MANUTENCAO', 'MAQUINAS E EQUIPAMENTOS', 'SERVICOS'}
GRUPO_GERENCIAL = {'BEBIDAS': 'BEBIDAS', 'CAFES': 'CAFES'}
# Itens produzidos pela central e faturados para as lojas (fornecedor intercompany, excluido das analises)
ITENS_CENTRAL = """PAO DE QUEIJO DA CASA CONGELADO|KG|21
    BOLO DA CASA INTEIRO|UNID|28
    COOKIE DA CASA|UNID|2.6
    MASSA DE CROISSANT DA CASA|KG|32""".split('\n')

# Familias de commodity (mesmas regras da pagina de Commodities): o choque mensal de preco de cada familia e' usado nas
# notas e, com ruido, no IPCA sintetico da familia — por isso o preco pago e o IPCA "andam juntos" de forma plausivel.
# Os codigos sao so chaves do arquivo sintetico indices-mercado.json.
FAMILIAS = {
    'cafe': (7392, 'Café moído'), 'leite_derivados': (7356, 'Leite e derivados'),
    'trigo': (7184, 'Farinhas, féculas e massas'), 'acucar': (7220, 'Açúcares e derivados'),
    'cacau': (7243, 'Chocolate e achocolatado'), 'frutas': (7214, 'Frutas'),
}
IPCA_GERAL, IPCA_ALIMENTACAO = 7169, 7170


def familia_do_item(nome, subgrupo, grupo, um):
    if subgrupo in ('CAFES ESPECIAIS', 'CAFES TRADICIONAIS', 'CAFE VERDE') and um == 'KG':
        return 'cafe'
    if subgrupo in ('LEITES', 'QUEIJOS', 'CREMES E MANTEIGAS'):
        return 'leite_derivados'
    if subgrupo == 'FARINACEOS' and nome.startswith('FARINHA DE TRIGO'):
        return 'trigo'
    if nome.startswith('ACUCAR') and um == 'KG':
        return 'acucar'
    if subgrupo == 'CHOCOLATES E CACAU':
        return 'cacau'
    if subgrupo == 'FLV-FRUTAS':
        return 'frutas'
    return None


# =====================================================================================================================
# Fornecedores: nomes inventados por silabas (seed), com especialidade e porte (concentracao de Pareto)
# =====================================================================================================================
ESPECIALIDADES = {
    # especialidade: (subgrupos atendidos, quantidade de fornecedores, prefixos de razao social)
    'torrefacao': (['CAFES ESPECIAIS', 'CAFES TRADICIONAIS'], 8, ['TORREFACAO', 'CAFES', 'TORREFADORA']),
    'cafe_verde': (['CAFE VERDE'], 4, ['COOPERATIVA DE CAFEICULTORES', 'FAZENDA', 'EXPORTADORA DE CAFE']),
    'chas': (['CHAS E INFUSOES'], 3, ['CHAS', 'IMPORTADORA DE CHAS']),
    'laticinios': (['LEITES', 'QUEIJOS', 'CREMES E MANTEIGAS'], 9, ['LATICINIOS', 'QUEIJARIA', 'DISTRIBUIDORA DE FRIOS']),
    'vegetais': (['BEBIDAS VEGETAIS'], 3, ['ALIMENTOS VEGETAIS', 'NATURAIS']),
    'padaria': (['PAES', 'SALGADOS ASSADOS'], 7, ['PANIFICADORA', 'PADARIA', 'FORNO']),
    'confeitaria': (['BOLOS E TORTAS', 'DOCES E BISCOITOS'], 7, ['CONFEITARIA', 'DOCERIA', 'PATISSERIE']),
    'mercearia': (['FARINACEOS', 'ACUCARES E ADOCANTES', 'CHOCOLATES E CACAU', 'XAROPES E CALDAS', 'GRAOS E SEMENTES',
                   'GELEIAS E PASTAS'], 14, ['ATACADISTA', 'DISTRIBUIDORA', 'COMERCIAL', 'EMPORIO']),
    'frios': (['FRIOS E EMBUTIDOS', 'OVOS E AVES'], 5, ['FRIOS', 'GRANJA', 'DISTRIBUIDORA DE FRIOS']),
    'flv': (['FLV-FRUTAS', 'FLV-VERDURAS', 'FLV-LEGUMES'], 7, ['HORTIFRUTI', 'FRUTAS', 'DISTRIBUIDORA DE HORTALICAS']),
    'congelados': (['SALGADOS CONGELADOS', 'SORVETES E ACAI', 'POLPAS'], 5, ['CONGELADOS', 'SORVETES', 'POLPAS']),
    'bebidas': (['SUCOS', 'AGUAS', 'REFRIGERANTES', 'CHAS GELADOS E KOMBUCHA'], 8, ['DISTRIBUIDORA DE BEBIDAS', 'BEBIDAS']),
    'producao': (['INSUMOS DE PRODUCAO', 'REFEICOES', 'TRANSFERENCIAS'], 3, ['SUPRIMENTOS', 'COZINHA INDUSTRIAL']),
    'descartaveis': (['COPOS E TAMPAS', 'EMBALAGENS'], 9, ['EMBALAGENS', 'DESCARTAVEIS']),
    'limpeza': (['LIMPEZA'], 5, ['PRODUTOS DE LIMPEZA', 'HIGIENE']),
    'utensilios': (['BARISTA E SALAO'], 5, ['UTILIDADES', 'ACESSORIOS PARA BARISTA']),
    'manutencao': (['REPAROS'], 12, ['MANUTENCAO', 'ASSISTENCIA TECNICA', 'REFRIGERACAO', 'INSTALACOES']),
    'equipamentos': (['EQUIPAMENTOS'], 6, ['MAQUINAS', 'EQUIPAMENTOS']),
    'servicos': (['SERVICOS GERAIS'], 12, ['SERVICOS', 'LAVANDERIA', 'CONTROLE DE PRAGAS', 'AMBIENTAL']),
}

# Fornecedores "ancora" com variacoes de grafia na base bruta — exercitam a padronizacao de nomes de
# shared_py/etl_common.py (_MAPA_EXATO e a regra por substring). Os nomes sao inventados.
ANCORAS = {
    'torrefacao': ('TORREFACAO BARILO S/A', ['TORREFACAO BARILO S A', 'TORREFACAO BARILO SA - FILIAL 2']),
    'mercearia': ('DISTRIBUIDORA VETAMON LTDA', ['DISTRIB. VETAMON LTDA', 'DISTRIBUIDORA VETAMON LTDA.']),
    'laticinios': ('LATICINIOS QUIRANA LTDA', ['LATICINIOS QUIRANA LTDA - MATRIZ']),
    'bebidas': ('BEBIDAS LUPULAR S/A', ['LUPULAR BEBIDAS DO SUDESTE LTDA', 'BEBIDAS LUPULAR S.A. FILIAL RJ']),
    'flv': ('HORTIFRUTI SARVEDO LTDA', ['Hortifruti Sarvedo Ltda']),
}

SILABAS_1 = ['BA', 'VE', 'QUI', 'SAR', 'TA', 'LU', 'MO', 'DE', 'RI', 'CA', 'NO', 'FE', 'GU', 'PA', 'SO', 'TE', 'VI', 'ZA', 'BRI', 'COR']
SILABAS_2 = ['RI', 'TA', 'RA', 'VE', 'LO', 'MAR', 'NE', 'SI', 'DA', 'TU', 'BE', 'LI', 'MO', 'GA', 'RE', 'DO', 'NA', 'VO']
SILABAS_3 = ['LO', 'MON', 'NA', 'DO', 'RAN', 'TEL', 'VAL', 'SEN', 'RIM', 'LAR', 'NOR', 'VEN', 'DIM', 'ZEL', 'TAR']
SUFIXOS = ['LTDA', 'LTDA', 'LTDA', 'S/A', 'EIRELI', 'ME', 'COMERCIO LTDA']


def palavra_inventada(usadas):
    while True:
        p = rng.choice(SILABAS_1) + rng.choice(SILABAS_2) + (rng.choice(SILABAS_3) if rng.random() < 0.7 else '')
        if p not in usadas and len(p) >= 5:
            usadas.add(p)
            return p


def cnpj_ficticio(raiz, filial=1):
    """CNPJ com digitos verificadores validos, raiz na faixa 90.000.000-99.999.999 (nao atribuida a empresas reais)."""
    base = [int(c) for c in f'{raiz:08d}{filial:04d}']
    for pesos in ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]):
        s = sum(d * p for d, p in zip(base, pesos))
        r = s % 11
        base.append(0 if r < 2 else 11 - r)
    d = ''.join(map(str, base))
    return f'{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}'


def montar_itens():
    itens = []
    cod = 10000
    for grupo, subs in CATALOGO.items():
        for sub, bloco in subs.items():
            for linha in bloco.split('\n'):
                nome, um, preco = [x.strip() for x in linha.strip().split('|')]
                cod += int(rng.integers(3, 40))
                itens.append({'nome': nome, 'um': um, 'preco': float(preco), 'grupo': grupo, 'subgrupo': sub,
                              'cod': cod, 'familia': familia_do_item(nome, sub, grupo, um)})
    for it in itens:
        it['popularidade'] = float(rng.lognormal(0, 1.15))
        # itens que movem uma cafeteria (espresso, leite, pao de queijo, copos) tem giro alto em qualquer fornecedor
        if it['nome'] in ITENS_DE_GIRO:
            it['popularidade'] = ITENS_DE_GIRO[it['nome']]
        # quantidade tipica por linha de nota: itens caros saem em quantidades menores
        it['q0'] = float(np.clip(380 / it['preco'], 1, 90))
        if it['grupo'] == 'DESCARTAVEIS':            # copos, tampas e sacos saem aos milhares
            it['q0'] = float(np.clip(700 / it['preco'], 1, 1800))
        if it['grupo'] in GRUPOS_NAO_PRODUTO and it['preco'] > 150:
            it['q0'] = 1.0
        # tendencia mensal de preco: alta, queda ou estavel
        sorteio = rng.random()
        if sorteio < 0.22:
            it['tendencia'] = float(rng.uniform(0.008, 0.04))
        elif sorteio < 0.37:
            it['tendencia'] = float(rng.uniform(-0.032, -0.006))
        else:
            it['tendencia'] = float(rng.uniform(-0.004, 0.006))
        # segunda unidade de medida (caixa/fardo) em parte dos itens
        it['alt'] = None
        if it['grupo'] not in GRUPOS_NAO_PRODUTO and rng.random() < 0.17:
            fator = {'KG': [5, 10, 12, 20], 'UNID': [6, 12, 24], 'LITRO': [6, 12]}[it['um']]
            it['alt'] = ('CX', int(rng.choice(fator)), float(rng.uniform(0.04, 0.2)))
    # itens de bebida vendidos "em caixa" com frequencia viram candidatos a registros suspeitos (preco de caixa em UNID)
    return itens


def montar_fornecedores(itens):
    usadas = set()
    fornecedores = []
    raiz = 90000000 + int(rng.integers(100000, 900000))
    for esp, (subs, n, prefixos) in ESPECIALIDADES.items():
        pesos = np.sort(rng.pareto(1.25, n) + 0.15)[::-1]
        for i in range(n):
            if i == 0 and esp in ANCORAS:
                nome, variantes = ANCORAS[esp]
                for v in [nome] + variantes:
                    usadas.add(v.split()[-2] if len(v.split()) > 2 else v)
            else:
                nome = f'{rng.choice(prefixos)} {palavra_inventada(usadas)} {rng.choice(SUFIXOS)}'
                variantes = []
            raiz += int(rng.integers(1500, 90000))
            fornecedores.append({'nome': nome, 'variantes': variantes, 'esp': esp, 'subs': subs,
                                 'peso': float(pesos[i] * (2.6 if i == 0 and esp in ANCORAS else 1.0)),
                                 'cnpj_raiz': raiz})
    # cauda longa: fornecedores pequenos e esporadicos (aparecem poucas vezes no periodo)
    for _ in range(26):
        esp = rng.choice(['mercearia', 'flv', 'descartaveis', 'manutencao', 'servicos', 'padaria', 'bebidas'])
        subs, _, prefixos = ESPECIALIDADES[esp]
        raiz += int(rng.integers(1500, 90000))
        fornecedores.append({'nome': f'{rng.choice(prefixos)} {palavra_inventada(usadas)} {rng.choice(SUFIXOS)}',
                             'variantes': [], 'esp': esp, 'subs': subs, 'peso': float(rng.uniform(0.01, 0.06)),
                             'cnpj_raiz': raiz})
    # itens atendidos por fornecedor e fator de preco de cada par fornecedor x item
    por_sub = {}
    for it in itens:
        por_sub.setdefault(it['subgrupo'], []).append(it)
    for f in fornecedores:
        cand = [it for s in f['subs'] for it in por_sub.get(s, [])]
        if f['esp'] in ('mercearia',):
            k = max(8, int(len(cand) * rng.uniform(0.35, 0.8)))
            cand = list(rng.choice(cand, size=min(k, len(cand)), replace=False))
        f['itens'] = cand
        f['fator_preco'] = {it['cod']: float(rng.uniform(0.93, 1.09)) for it in cand}
        # numeracao de NF: gap medio entre as notas emitidas para o grupo -> percentual de NF sequencial
        s = rng.random()
        if s < 0.06:
            f['gap_nf'] = float(rng.uniform(1.12, 1.3))      # critico
        elif s < 0.13:
            f['gap_nf'] = float(rng.uniform(1.5, 1.9))       # alto
        elif s < 0.25:
            f['gap_nf'] = float(rng.uniform(2.1, 3.1))       # atencao
        else:
            f['gap_nf'] = float(rng.lognormal(math.log(25), 1.1)) + 3.5   # normal
        f['nf_inicial'] = int(rng.integers(800, 480000))
        # confiabilidade de entrega (OTIF)
        ruim = rng.random() < 0.15
        f['p_prazo'] = float(rng.beta(4, 2.2) if ruim else rng.beta(14, 1.1))
        f['p_completo'] = float(rng.beta(6, 2.5) if ruim else rng.beta(20, 1.0))
        f['pmp'] = int(rng.choice([7, 14, 21, 28, 30, 35, 42, 45, 56, 60], p=[.06, .14, .16, .2, .14, .1, .08, .06, .03, .03]))
        f['uf'] = str(rng.choice(['SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'GO', 'BA', 'PE', 'ES', 'DF', 'CE'],
                                 p=[.46, .17, .1, .06, .05, .05, .03, .02, .02, .02, .01, .01]))
    return fornecedores


# Mix de compra por formato de loja (peso de cada especialidade nas notas da loja)
MIX = {
    'CAFETERIA': {'torrefacao': 16, 'cafe_verde': 0, 'chas': 2.5, 'laticinios': 16, 'vegetais': 3, 'padaria': 13,
                  'confeitaria': 12, 'mercearia': 11, 'frios': 3, 'flv': 4, 'congelados': 3, 'bebidas': 5,
                  'producao': 0.4, 'descartaveis': 7, 'limpeza': 2.5, 'utensilios': 1, 'manutencao': 1.8,
                  'equipamentos': 0.4, 'servicos': 1.2},
    'QUIOSQUE': {'torrefacao': 19, 'cafe_verde': 0, 'chas': 2, 'laticinios': 15, 'vegetais': 3.5, 'padaria': 9,
                 'confeitaria': 10, 'mercearia': 8, 'frios': 0.6, 'flv': 1, 'congelados': 2, 'bebidas': 8,
                 'producao': 0.3, 'descartaveis': 13, 'limpeza': 2, 'utensilios': 0.6, 'manutencao': 1.6,
                 'equipamentos': 0.3, 'servicos': 0.8},
    'BISTRO': {'torrefacao': 11, 'cafe_verde': 0, 'chas': 2, 'laticinios': 15, 'vegetais': 2.5, 'padaria': 12,
               'confeitaria': 9, 'mercearia': 12, 'frios': 9, 'flv': 10, 'congelados': 3, 'bebidas': 6,
               'producao': 0.5, 'descartaveis': 4, 'limpeza': 2.5, 'utensilios': 1, 'manutencao': 1.6,
               'equipamentos': 0.5, 'servicos': 1.4},
    'PRODUCAO CENTRAL': {'torrefacao': 1, 'cafe_verde': 22, 'chas': 0.2, 'laticinios': 18, 'vegetais': 0, 'padaria': 1,
                         'confeitaria': 1, 'mercearia': 30, 'frios': 6, 'flv': 6, 'congelados': 1, 'bebidas': 0.2,
                         'producao': 3, 'descartaveis': 4, 'limpeza': 3, 'utensilios': 1, 'manutencao': 2,
                         'equipamentos': 1.2, 'servicos': 1.8},
}
FATOR_REGIAO = {'SP': 1.0, 'RJ': 1.035, 'BR': 0.975}


def caminho_precos(itens):
    """Fator de preco por item e mes: tendencia propria + choque mensal da familia + sazonalidade do hortifruti."""
    choques = {fam: rng.normal(0.004, 0.018, len(MESES)) for fam in FAMILIAS}
    choques['cafe'] += np.linspace(0.045, -0.012, len(MESES))        # arabica em alta forte no 1o semestre, acomodando
    choques['cacau'] += np.linspace(0.03, -0.035, len(MESES))        # cacau devolvendo parte da alta historica
    choques['leite_derivados'] += np.array([-0.004, -0.004, 0.0, 0.006, 0.014, 0.022, 0.018, 0.006])  # entressafra
    choques['frutas'] += 0.05 * np.sin(np.linspace(0, 2.2 * math.pi, len(MESES)))
    choques['acucar'] -= 0.006
    for it in itens:
        fator = [1.0]
        fam_choque = choques.get(it['familia'])
        for t in range(1, len(MESES)):
            mu = it['tendencia'] * (0.4 if fam_choque is not None else 1.0)
            if fam_choque is not None:
                mu += fam_choque[t]
            if it['subgrupo'].startswith('FLV') and it['familia'] is None:
                mu += 0.03 * math.sin(t * 0.9 + it['preco'])
            fator.append(fator[-1] * (1 + mu + rng.normal(0, 0.008)))
        it['fator_mes'] = fator
    return choques


def gerar_notas(itens, fornecedores):
    casas = CASAS + [CENTRAL]
    por_esp = {}
    for f in fornecedores:
        por_esp.setdefault(f['esp'], []).append(f)
    destinatarios = {}
    raiz_grupo = 98765432
    for i, c in enumerate(casas):
        marca = ' '.join(c['fantasia'].split()[:2])
        destinatarios[c['fantasia']] = (f'{marca} COMERCIO DE ALIMENTOS LTDA' if c is not CENTRAL else FORNECEDOR_INTERCOMPANY,
                                        cnpj_ficticio(raiz_grupo, i + 1))
    fator_casa = {c['fantasia']: float(rng.uniform(0.97, 1.04)) * FATOR_REGIAO[c['regiao']] for c in casas}

    pedidos = []
    for mi, mes in enumerate(MESES):
        ano, mm = int(mes[:4]), int(mes[5:])
        dias = (datetime(ano + (mm == 12), mm % 12 + 1, 1) - datetime(ano, mm, 1)).days
        for c in casas:
            if c['abertura'] and mes < c['abertura']:
                continue
            ramp = 0.6 if c['abertura'] == mes else 1.0
            n = rng.poisson(PEDIDOS_POR_MES * c['porte'] * SAZONALIDADE[mes[5:]] * ramp)
            mix = MIX[c['vertical']]
            esps = [e for e in mix if mix[e] > 0]
            pesos = np.array([mix[e] for e in esps], dtype=float)
            pesos /= pesos.sum()
            for _ in range(n):
                esp = esps[rng.choice(len(esps), p=pesos)]
                forns = por_esp[esp]
                fp = np.array([f['peso'] for f in forns])
                f = forns[rng.choice(len(forns), p=fp / fp.sum())]
                if not f['itens']:
                    continue
                emissao = datetime(ano, mm, int(rng.integers(1, dias + 1)))
                k = min(len(f['itens']), 1 + rng.poisson(2.6 if esp not in ('manutencao', 'servicos', 'equipamentos') else 0.2))
                pop = np.array([it['popularidade'] for it in f['itens']])
                escolhidos = rng.choice(len(f['itens']), size=k, replace=False, p=pop / pop.sum())
                pedidos.append({'casa': c, 'forn': f, 'emissao': emissao, 'mi': mi,
                                'itens': [f['itens'][j] for j in escolhidos]})
    # intercompany: a central fatura producao propria (paes, bolos, massas) para as lojas (removido das analises pelo ETL)
    itens_central = []
    for linha in ITENS_CENTRAL:
        nome, um, preco = [x.strip() for x in linha.strip().split('|')]
        itens_central.append({'nome': nome, 'um': um, 'preco': float(preco), 'grupo': 'PRODUCAO CENTRAL',
                              'subgrupo': 'PRODUCAO PROPRIA', 'cod': 90000 + len(itens_central), 'familia': None,
                              'q0': 25.0, 'alt': None, 'fator_mes': [1.0 + 0.004 * t for t in range(len(MESES))]})
    forn_central = {'nome': FORNECEDOR_INTERCOMPANY, 'variantes': [], 'esp': 'intercompany', 'fator_preco': {},
                    'gap_nf': 1.0, 'nf_inicial': 1, 'cnpj_raiz': raiz_grupo, 'itens': itens_central,
                    'p_prazo': 1.0, 'p_completo': 1.0, 'pmp': 30, 'uf': 'SP'}
    for mi, mes in enumerate(MESES):
        for c in CASAS:
            if c['abertura'] and mes < c['abertura']:
                continue
            for _ in range(rng.poisson(6 * c['porte'])):
                pedidos.append({'casa': c, 'forn': forn_central, 'mi': mi, 'itens': itens_central[:int(rng.integers(1, 5))],
                                'emissao': datetime(int(mes[:4]), int(mes[5:]), int(rng.integers(1, 28)))})

    # numeracao das notas por fornecedor, em ordem de emissao
    pedidos.sort(key=lambda p: (p['emissao'], p['casa']['fantasia']))
    contador = {}
    for p in pedidos:
        f = p['forn']
        atual = contador.get(f['nome'], f['nf_inicial'])
        gap = rng.geometric(1 / f['gap_nf']) if f['gap_nf'] > 1 else 1
        contador[f['nome']] = atual + max(1, int(gap))
        p['nf'] = contador[f['nome']]
    # notas 100% consecutivas dariam "NF sequencial" acima de 100% (total de NFs / intervalo): abre um intervalo minimo
    por_forn = {}
    for p in pedidos:
        por_forn.setdefault(p['forn']['nome'], []).append(p)
    for lista in por_forn.values():
        nfs = sorted({p['nf'] for p in lista})
        if len(nfs) > 1 and nfs[-1] - nfs[0] < len(nfs) * 1.05:
            folga = int(len(nfs) * 1.05) - (nfs[-1] - nfs[0]) + 1
            for p in lista:
                if p['nf'] == nfs[-1]:
                    p['nf'] += folga

    linhas = []
    fim_base = datetime(2026, 8, 31)
    usuarios = {c['fantasia']: f"usr.{c['codigo'].lower().replace('-', '.') if c['codigo'] else 'cpq'}" for c in casas}
    for p in pedidos:
        c, f = p['casa'], p['forn']
        lanc = min(p['emissao'] + timedelta(days=int(rng.choice([0, 0, 1, 1, 2, 3, 5]))), fim_base)
        nome_forn = f['nome']
        if f['variantes'] and rng.random() < 0.3:
            nome_forn = str(rng.choice(f['variantes']))
        dest, cnpj_dest = destinatarios[c['fantasia']]
        for it in p['itens']:
            preco = (it['preco'] * it['fator_mes'][p['mi']] * f['fator_preco'].get(it['cod'], 1.0)
                     * fator_casa[c['fantasia']] * (1 + rng.normal(0, 0.03)))
            qtd = it['q0'] * ESCALA_QTD * c['porte'] ** 0.55 * rng.lognormal(0, 0.55)
            um, desc_forn = it['um'], it['nome']
            if it['um'] == 'KG':
                qtd = round(max(qtd, 0.3), 3)
                desc_forn = f"{it['nome']} {rng.choice(['KG', 'PCT 500G', 'PCT 1KG', 'A GRANEL'] if it['grupo'] in ('CAFES', 'FRIOS E PROTEINAS') else ['KG', 'PCT 1KG', 'SC 5KG', 'A GRANEL'])}"
            else:
                qtd = max(1, int(round(qtd)))
            # segunda unidade (caixa): preco e quantidade da caixa
            if it['alt'] and rng.random() < it['alt'][2]:
                um_alt, fator, _ = it['alt']
                um = um_alt
                qtd = max(1, int(round(qtd / fator)))
                preco = preco * fator
                desc_forn = f"{it['nome']} CX {fator}X1{'KG' if it['um'] == 'KG' else ('L' if it['um'] == 'LITRO' else 'UN')}"
            # registros suspeitos: caixa faturada como unidade (preco de caixa em UNID) ou erro de cadastro
            elif it['um'] == 'UNID' and it['grupo'] in ('BEBIDAS',) and rng.random() < 0.04:
                fator = int(rng.choice([6, 12, 24]))
                preco = preco * fator
                qtd = max(1, int(round(qtd / fator)))
                desc_forn = f"{it['nome']} CX C/{fator}"
            elif rng.random() < 0.004:
                preco = preco * float(rng.choice([4.5, 0.2]))
            if it['nome'] == 'CAFE ESPECIAL BLEND ESPRESSO GRAOS' and rng.random() < 0.35:
                nome_item = str(rng.choice(['CAFE BLEND ESPRESSO GRAOS', '(MP) CAFE ESPECIAL BLEND ESPRESSO GRAOS']))
            else:
                nome_item = it['nome']
            grupo = it['grupo']
            if grupo == 'MERCEARIA' and rng.random() < 0.2:
                grupo = 'MERCEARIA SECA'           # variante de cadastro, unificada pelo ETL
            if nome_item == 'CREME CHANTILLY':
                grupo = 'CONGELADOS'               # cadastro errado, reclassificado para LATICINIOS pelo ETL
            if rng.random() < 0.003:
                qtd = 0                            # complemento de preco (sem quantidade)
            v_total = round(preco * qtd, 2) if qtd else round(preco * rng.uniform(1, 6), 2)
            imposto = round(v_total * rng.choice([0.0, 0.07, 0.12, 0.18], p=[.35, .25, .2, .2]), 2)
            contabil = round(v_total * (1 + rng.choice([0, 0, 0.01, 0.025])), 2)
            uf_forn = f['uf']
            cfop = ('1102' if uf_forn == ('SP' if c['regiao'] == 'SP' else 'RJ') else '2102')
            if grupo in GRUPOS_NAO_PRODUTO:
                cfop = cfop[0] + '556'
            linhas.append({
                'CASAS': c['fantasia'],
                'SEGMENTO': c['vertical'],
                'RAZÃO DESTINATARIO': dest,
                'CNPJ DESTINATARIO': cnpj_dest,
                'D. EMISSAO': p['emissao'],
                'DATA LANCAMENTO': lanc,
                'USUARIO SOLICITANTE': usuarios[c['fantasia']],
                'N. NOTA': p['nf'],
                'RAZAO FORNECEDOR': nome_forn,
                'Itens do Fornecedor': f"F{zlib.crc32(f['nome'].encode()) % 9000 + 1000}-{it['cod']}",
                'COD ITEM': it['cod'],
                'DESCRICAO ITEM': nome_item,
                'DESCRICAO ITEM FORNECEDOR': desc_forn,
                'UM': um,
                'GRUPO GERENCIAL': 'NAO PRODUTO' if grupo in GRUPOS_NAO_PRODUTO else GRUPO_GERENCIAL.get(grupo, 'ALIMENTOS'),
                'GRANDE GRUPO': 'OPERACIONAL' if grupo in GRUPOS_NAO_PRODUTO else 'INSUMOS',
                'GRUPO': grupo,
                'SUBGRUPO': it['subgrupo'],
                'SUBGRUPO RESUMIDO': it['subgrupo'].split()[0].replace('FLV-', ''),
                'QDE. COMPRADA': qtd,
                'V. UNITARIO NF': round(preco, 4),
                'V. UNITARIO CORRIGIDO': round(contabil / qtd, 4) if qtd else None,
                'V. TOTAL NF': v_total,
                'V. IMPOSTO': imposto,
                'V. CONTABIL NF': contabil,
                'V. TOTAL (CMV)': round(contabil - imposto * 0.5, 2),
                'CFOP': cfop,
                'CFOP RESUMIDO': 'USO E CONSUMO' if grupo in GRUPOS_NAO_PRODUTO else 'COMPRA PARA COMERCIALIZACAO',
            })
    return pd.DataFrame(linhas), pedidos


def gerar_complemento(fornecedores):
    linhas = []
    for f in fornecedores:
        if rng.random() < 0.07:
            continue                                  # fornecedor sem cadastro complementar
        partes = f['nome'].split()
        fantasia = partes[-2] if len(partes) > 2 else partes[0]
        pmp = f['pmp'] if rng.random() > 0.08 else None
        linhas.append({'CNPJCPF do Fornecedor': cnpj_ficticio(f['cnpj_raiz'], 1), 'Nome ou Razao Social': f['nome'],
                       'Nome de Fantasia': fantasia, 'Estado(UF)': f['uf'], 'PMP': pmp})
        if rng.random() < 0.12:                       # filial: mesma UF (ou outra, deixando a UF "nao informada")
            uf2 = f['uf'] if rng.random() < 0.6 else str(rng.choice(['MG', 'PR', 'RJ', 'SC']))
            linhas.append({'CNPJCPF do Fornecedor': cnpj_ficticio(f['cnpj_raiz'], 2), 'Nome ou Razao Social': f['nome'],
                           'Nome de Fantasia': fantasia, 'Estado(UF)': uf2,
                           'PMP': (f['pmp'] + int(rng.choice([-7, 0, 7]))) if pmp else None})
    return pd.DataFrame(linhas)


DEMANDA_POR_ESP = {'torrefacao': 'CAFES', 'cafe_verde': 'CAFES', 'chas': 'CAFES', 'laticinios': 'LATICINIOS',
                   'vegetais': 'LATICINIOS', 'padaria': 'PADARIA E CONFEITARIA', 'confeitaria': 'PADARIA E CONFEITARIA',
                   'mercearia': 'MERCEARIA', 'frios': 'FRIOS E HORTIFRUTI', 'flv': 'FRIOS E HORTIFRUTI',
                   'congelados': 'CONGELADOS', 'bebidas': 'BEBIDAS', 'descartaveis': 'DESCARTAVEIS', 'limpeza': 'MATERIAIS'}
COMPRADOR_POR_DEMANDA = {'CAFES': ['ANA PAULA', 'BRUNO COSTA'], 'LATICINIOS': ['CARLA MENDES'],
                         'PADARIA E CONFEITARIA': ['ELISA RAMOS', 'DIEGO'], 'MERCEARIA': ['DIEGO', 'ELISA RAMOS'],
                         'FRIOS E HORTIFRUTI': ['CARLA MENDES'], 'CONGELADOS': ['BRUNO COSTA'], 'BEBIDAS': ['GABRIEL'],
                         'DESCARTAVEIS': ['GABRIEL'], 'MATERIAIS': ['COMPRAS APOIO'], 'CPQ': ['COMPRAS CPQ']}
SITUACOES_INCOMPLETAS = ['Entrega Parcial (Produtos Faltantes)', 'Entrega com Divergência de Quantidade',
                         'Entrega com Produto Avariado']
MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']


def gerar_otif(pedidos, notas):
    valor_nf = notas.groupby(['RAZAO FORNECEDOR', 'N. NOTA'])['V. CONTABIL NF'].sum()
    linhas = []
    for p in pedidos:
        f = p['forn']
        demanda = 'CPQ' if p['casa'] is CENTRAL else DEMANDA_POR_ESP.get(f['esp'])
        if demanda is None or rng.random() > 0.55:
            continue
        melhora = 0.012 * p['mi']                      # o time melhora o OTIF ao longo do ano
        no_prazo = rng.random() < min(0.995, f['p_prazo'] + melhora)
        completo = rng.random() < min(0.998, f['p_completo'] + melhora / 2)
        data_ped = p['emissao'] - timedelta(days=int(rng.integers(1, 6)))
        previsao = data_ped + timedelta(days=int(rng.choice([1, 2, 2, 3, 5])))
        atraso = 0 if no_prazo else int(rng.choice([1, 1, 1, 2, 2, 3, 4, 6]))
        if no_prazo and rng.random() < 0.3:
            atraso = -int(rng.integers(1, 3))
        entrega = previsao + timedelta(days=atraso)
        prazo, status = ('OK' if atraso <= 0 else 'NOK'), ('OK' if completo else 'NOK')
        situacao = 'Entrega Concluída (Todos os Produtos)' if completo else str(rng.choice(SITUACOES_INCOMPLETAS, p=[.6, .3, .1]))
        valor = valor_nf.get((f['nome'], p['nf']))
        if valor is None:
            valor = float(sum(it['preco'] * it['q0'] for it in p['itens']))
        mes = data_ped.month
        linhas.append({
            'Demanda': demanda, 'KEY': f"{p['nf']}-{f['cnpj_raiz'] % 10000}", 'Ano': data_ped.year,
            'Mês': MESES_ABREV[mes - 1], 'MêsAno_pedido': f'{MESES_ABREV[mes - 1]}/{data_ped.year}',
            'Semestre': f'{1 if mes <= 6 else 2}º Semestre', 'Atraso (Dias)': atraso, 'STATUS': status, 'PRAZO': prazo,
            'OTIF': 'OK' if (prazo == 'OK' and status == 'OK') else 'NOK', 'Pedido': int(700000 + len(linhas) * 3 + rng.integers(0, 3)),
            'Comprador': str(rng.choice(COMPRADOR_POR_DEMANDA[demanda])),
            'Empresa': ' '.join(p['casa']['fantasia'].split()[:2]), 'Fornecedor': f['nome'],
            'Data Pedido': data_ped, 'PrevisãodeEntrega': previsao, 'Data Entrega': entrega,
            'Situação Entrega': situacao, 'Vol. Preço Custo': round(float(valor), 2),
            'Status Entrega': 'Entregue' if completo else 'Entregue com pendência', 'Casa': p['casa']['fantasia'],
        })
    df = pd.DataFrame(linhas)
    df = df[df['Ano'] == 2026].reset_index(drop=True)    # pedidos feitos no fim de dez/2025 ficam de fora
    return df


def gerar_cmc_cmv(notas):
    n = notas.copy()
    n['MES'] = pd.to_datetime(n['DATA LANCAMENTO']).dt.strftime('%Y-%m')
    n['CAT'] = np.select([n['GRUPO'] == 'CAFES', n['GRUPO'] == 'BEBIDAS', n['GRUPO'].isin(GRUPOS_NAO_PRODUTO)],
                         ['cafes', 'bebidas', 'outros'], 'alimentos')
    inter = n['RAZAO FORNECEDOR'] == FORNECEDOR_INTERCOMPANY
    compras = n[~inter].groupby(['CASAS', 'MES', 'CAT'])['V. CONTABIL NF'].sum()
    producao = n[inter].groupby(['CASAS', 'MES'])['V. CONTABIL NF'].sum()
    meta_casa = {c['fantasia']: float(rng.normal(0.34, 0.024)) for c in CASAS}   # CMC de alimentos (inclui leites)
    cmc_linhas, cmv_linhas = [], []
    for mes in MESES:
        for c in CASAS:
            if not c['codigo'] or (c['abertura'] and mes < c['abertura']):
                continue
            g = lambda cat: float(compras.get((c['fantasia'], mes, cat), 0.0))  # noqa: E731
            comp_alim, comp_caf, comp_beb = g('alimentos'), g('cafes'), g('bebidas')
            prod = float(producao.get((c['fantasia'], mes), 0.0))
            alvo = meta_casa[c['fantasia']] + rng.normal(-0.002 * MESES.index(mes), 0.012)
            vendas_alim = (comp_alim + prod) / max(alvo, 0.2) * 1.03
            ref_func = vendas_alim * float(rng.uniform(0.02, 0.04))
            vendas_caf = comp_caf / float(rng.uniform(0.11, 0.17)) if comp_caf else 0.0   # cafe tem a maior margem
            vendas_beb = comp_beb / float(rng.uniform(0.3, 0.4)) if comp_beb else 0.0
            custo_alim = comp_alim + prod - ref_func
            pct = lambda a, b: round(a / b, 4) if b else None  # noqa: E731
            cmc_linhas.append({
                'CASA': c['codigo'], 'EQUIVALENTE': c['fantasia'], 'SEGMENTO': c['vertical'], 'REGIÃO': c['regiao'],
                'mês': datetime(int(mes[:4]), int(mes[5:]), 1),
                'VENDAS ALIMENTOS (+)': round(vendas_alim, 2), 'COMPRAS ALIMENTOS (-)': round(comp_alim, 2),
                'PRODUÇÃO CENTRAL (-)': round(prod, 2), 'REF. FUNCIONARIO (V.MÉDIO) (+)': round(ref_func, 2),
                '% CMC ALIMENTOS': pct(custo_alim, vendas_alim),
                'COMPRAS CAFES (-)': round(comp_caf, 2), 'VENDAS CAFES (+)': round(vendas_caf, 2),
                '% CMC CAFES': pct(comp_caf, vendas_caf),
                'COMPRAS BEBIDAS (-)': round(comp_beb, 2), 'VENDAS BEBIDAS (+)': round(vendas_beb, 2),
                '% CMC BEBIDAS': pct(comp_beb, vendas_beb),
                '% CMC Geral': pct(custo_alim + comp_caf + comp_beb, vendas_alim + vendas_caf + vendas_beb),
            })
            receita = (vendas_alim + vendas_caf + vendas_beb) * float(rng.uniform(0.9, 0.93))
            cmv = (custo_alim + comp_caf + comp_beb) * float(rng.uniform(0.96, 1.03))
            cmv_linhas.append({'CASAS': c['codigo'], 'VERTICAL': c['vertical'], 'REGIÃO': c['regiao'],
                               'MÊS': datetime(int(mes[:4]), int(mes[5:]), 1), 'RECEITA LIQUIDA ': round(receita, 2),
                               'CMV': round(-cmv, 2), 'CMV %': round(cmv / receita, 4)})
        tot = [r for r in cmv_linhas if r['MÊS'] == datetime(int(mes[:4]), int(mes[5:]), 1)]
        rec, cmv = sum(r['RECEITA LIQUIDA '] for r in tot), -sum(r['CMV'] for r in tot)
        cmv_linhas.append({'CASAS': 'TOTAL GERAL', 'VERTICAL': None, 'REGIÃO': None,
                           'MÊS': datetime(int(mes[:4]), int(mes[5:]), 1), 'RECEITA LIQUIDA ': round(rec, 2),
                           'CMV': round(-cmv, 2), 'CMV %': round(cmv / rec, 4)})
    return pd.DataFrame(cmc_linhas), pd.DataFrame(cmv_linhas)


def inflacao_interna(notas):
    """Indice de preco pago (Laspeyres encadeado) sobre itens na unidade principal — a 'inflacao interna' dos KPIs."""
    n = notas[(notas['QDE. COMPRADA'] > 0) & ~notas['GRUPO'].isin(GRUPOS_NAO_PRODUTO)
              & (notas['RAZAO FORNECEDOR'] != FORNECEDOR_INTERCOMPANY)].copy()
    n['MES'] = pd.to_datetime(n['DATA LANCAMENTO']).dt.strftime('%Y-%m')
    um_principal = n.groupby(['DESCRICAO ITEM', 'UM'])['V. CONTABIL NF'].sum().reset_index() \
        .sort_values('V. CONTABIL NF').drop_duplicates('DESCRICAO ITEM', keep='last').set_index('DESCRICAO ITEM')['UM']
    n = n[n['UM'] == n['DESCRICAO ITEM'].map(um_principal)]
    g = n.groupby(['DESCRICAO ITEM', 'MES']).agg(v=('V. CONTABIL NF', 'sum'), q=('QDE. COMPRADA', 'sum'))
    p = (g['v'] / g['q']).unstack('MES')
    v = g['v'].unstack('MES')
    out = {MESES[0]: None}
    for a, b in zip(MESES, MESES[1:]):
        ok = p[a].notna() & p[b].notna()
        r = (p.loc[ok, b] / p.loc[ok, a]).clip(1 / 3, 3)
        out[b] = float((r * v.loc[ok, a]).sum() / v.loc[ok, a].sum() - 1)
    return out


def gerar_kpis(cmv_df, notas, fornecedores):
    tot = cmv_df[cmv_df['CASAS'] == 'TOTAL GERAL'].copy()
    tot['MES'] = tot['MÊS'].dt.strftime('%Y-%m')
    cmv_2026 = dict(zip(tot['MES'], tot['CMV %']))
    infl = inflacao_interna(notas)
    linhas = []
    for i, mes in enumerate(MESES_KPI):
        mm = mes[5:]
        if mes.startswith('2025'):
            base26 = cmv_2026.get('2026-' + mm)
            cmv = (base26 + float(rng.uniform(0.004, 0.019))) if base26 else float(rng.normal(0.29, 0.006))
            if mm == '05':
                cmv = base26 - 0.003 if base26 else cmv     # um mes em que 2025 foi melhor (contraste no grafico)
            inflacao = float(rng.normal(0.0055, 0.0025))
            pmp = 24 + i * 0.35 + float(rng.normal(0, 0.8))
            dio = 21 - i * 0.25 + float(rng.normal(0, 0.7))
        else:
            cmv = cmv_2026[mes]
            inflacao = infl[mes] if infl[mes] is not None else float(rng.normal(0.006, 0.002))
            pmp = 28.5 + (i - 12) * 0.45 + float(rng.normal(0, 0.6))
            dio = 17.5 - (i - 12) * 0.3 + float(rng.normal(0, 0.5))
        linhas.append({'MÊS': datetime(int(mes[:4]), int(mm), 1), 'INFLAÇÃO': round(inflacao, 5),
                       'PMP': round(pmp, 1), 'DIO': round(dio, 1), 'COTAÇÃO': int(rng.integers(34, 72)),
                       'CONTRATOS': int(rng.integers(6, 19)), 'CMV': round(cmv, 4)})
    return pd.DataFrame(linhas)


def gerar_indices_mercado(choques):
    ipca = {}
    for fam, (cid, nome) in FAMILIAS.items():
        serie = choques[fam] * 100 * 0.75 + rng.normal(0, 0.45, len(MESES))
        ipca[str(cid)] = {'nome': nome, 'var_mensal': [round(float(x), 2) for x in serie]}
    ipca[str(IPCA_GERAL)] = {'nome': 'Índice geral', 'var_mensal': [round(float(x), 2) for x in rng.normal(0.36, 0.17, len(MESES))]}
    ipca[str(IPCA_ALIMENTACAO)] = {'nome': 'Alimentação e bebidas',
                                   'var_mensal': [round(float(x), 2) for x in rng.normal(0.42, 0.33, len(MESES))]}
    ptax = 5.42 + np.cumsum(rng.normal(-0.01, 0.07, len(MESES)))
    dias = [21, 19, 22, 20, 20, 21, 23, 21]
    return {
        'aviso': 'Series SINTETICAS geradas por scripts/gerar_dados_sinteticos.py — nao sao dados oficiais.',
        'ipca': ipca,
        'ptax': {'serie': 'Dólar comercial (venda) — série sintética', 'media_mensal': [round(float(x), 4) for x in ptax],
                 'dias_no_mes': dias, 'ultimo': {'data': '2026-08-31', 'valor': round(float(ptax[-1] + 0.03), 4)}},
    }


def salvar_excel(df, caminho, aba):
    with pd.ExcelWriter(caminho, engine='openpyxl') as xw:
        df.to_excel(xw, sheet_name=aba, index=False)
        props = xw.book.properties
        props.creator = props.lastModifiedBy = 'gerar_dados_sinteticos.py'
        props.title = 'Dados sinteticos — Quintaluz Cafes (ficticio)'
        props.created = props.modified = datetime(2026, 9, 1)


def main():
    os.makedirs(SAIDA, exist_ok=True)
    itens = montar_itens()
    fornecedores = montar_fornecedores(itens)
    choques = caminho_precos(itens)
    notas, pedidos = gerar_notas(itens, fornecedores)
    complemento = gerar_complemento(fornecedores)
    otif = gerar_otif(pedidos, notas)
    cmc, cmv = gerar_cmc_cmv(notas)
    kpis = gerar_kpis(cmv, notas, fornecedores)
    indices = gerar_indices_mercado(choques)

    salvar_excel(notas, os.path.join(SAIDA, 'base-raw-compras.xlsx'), 'JAN-AGO26')
    salvar_excel(complemento, os.path.join(SAIDA, 'complemento_fornecedores.xlsx'), 'complemento-fornecedor')
    salvar_excel(otif, os.path.join(SAIDA, 'OTIF_base.xlsx'), 'BASE')
    salvar_excel(cmc, os.path.join(SAIDA, 'base-CMC.xlsx'), 'CMC')
    salvar_excel(cmv, os.path.join(SAIDA, 'cmv-casas.xlsx'), 'CMV_CASAS')
    salvar_excel(kpis, os.path.join(SAIDA, 'base-KPIs.xlsx'), 'KPIs')
    with open(os.path.join(SAIDA, 'indices-mercado.json'), 'w', encoding='utf-8') as fh:
        json.dump(indices, fh, ensure_ascii=False, indent=1)

    print(f'Semente: {SEED}')
    print(f'Notas fiscais: {len(notas):,} linhas | {notas["N. NOTA"].nunique():,} numeros de NF | '
          f'{notas["RAZAO FORNECEDOR"].nunique()} grafias de fornecedor | {notas["DESCRICAO ITEM"].nunique()} itens | '
          f'R$ {notas["V. CONTABIL NF"].sum():,.2f}')
    print(f'Complemento: {len(complemento)} linhas | OTIF: {len(otif):,} pedidos | CMC: {len(cmc)} | CMV: {len(cmv)} | KPIs: {len(kpis)}')
    print(f'Arquivos gravados em {SAIDA}')


if __name__ == '__main__':
    main()
