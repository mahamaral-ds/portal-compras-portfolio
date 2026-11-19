"""
Gera TODAS as bases de origem do portal com dados 100% sinteticos (Grupo Quintaluz Gastronomia, empresa ficticia).

As planilhas seguem exatamente o esquema (abas, colunas e tipos) que os scripts build_data.py de cada modulo leem,
entao nenhuma pagina precisa de alteracao de logica. Tudo e' derivado de uma semente fixa (SEED): rodar de novo
gera arquivos identicos.

Saidas (em raw-data/):
    base-raw-compras.xlsx        notas fiscais de compra, uma linha por item de nota (Jan-Ago/2026)
    complemento_fornecedores.xlsx  CNPJ, UF e PMP de cada fornecedor
    OTIF_base.xlsx               pedidos com prazo/completude de entrega (aba BASE)
    base-CMC.xlsx                vendas x compras por casa e mes (aba CMC)
    cmv-casas.xlsx               receita liquida x CMV por casa e mes (aba CMV_CASAS)
    base-KPIs.xlsx               inflacao interna, PMP, DIO, cotacoes, contratos e CMV (Jan/2025-Ago/2026)
    indices-mercado.json         IPCA por grupo e dolar (series sinteticas, usadas pela pagina de Commodities)

Coerencia entre as bases:
    - compras de alimentos/vinhos/bebidas da base de CMC = soma das notas de cada casa e mes;
    - CMV por casa = custo das compras / receita; o CMV mensal dos KPIs vem da base de CMV;
    - pedidos do OTIF sao as proprias notas fiscais geradas (mesmo fornecedor, casa, data e valor);
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
SAZONALIDADE = {'01': 1.06, '02': 0.91, '03': 0.97, '04': 0.99, '05': 1.03, '06': 0.98, '07': 1.09, '08': 1.01}
PEDIDOS_POR_MES = 84          # pedidos (notas) por mes para uma casa de porte 1.0
ESCALA_QTD = 1.5

# =====================================================================================================================
# Catalogo de itens: GRUPO -> SUBGRUPO -> "NOME|UM|preco base". Itens genericos, sem marca.
# =====================================================================================================================
CATALOGO = {
    'PROTEINAS': {
        'BOVINOS': """FILE MIGNON BOVINO PECA|KG|98
            PICANHA BOVINA PECA|KG|86
            CONTRA FILE BOVINO PECA|KG|62
            ALCATRA BOVINA PECA|KG|48
            FRALDINHA BOVINA|KG|46
            COSTELA BOVINA JANELA|KG|29
            ACEM BOVINO|KG|32
            PATINHO BOVINO|KG|41
            CARNE MOIDA BOVINA|KG|36
            BIFE ANCHO BOVINO|KG|92
            OSSOBUCO BOVINO|KG|34
            CUPIM BOVINO|KG|44
            MAMINHA BOVINA|KG|52
            HAMBURGUER BOVINO 160G|UNID|7.8
            CARPACCIO BOVINO FATIADO|KG|118""",
        'SUINOS': """LOMBO SUINO|KG|24
            COSTELINHA SUINA|KG|27
            PANCETTA SUINA|KG|38
            BACON EM MANTA|KG|42
            LINGUICA TOSCANA|KG|23
            PRESUNTO CRU FATIADO|KG|165
            COPA LOMBO SUINA|KG|29
            CALABRESA DEFUMADA|KG|26
            PARMA FATIADO 100G|UNID|28""",
        'AVES': """PEITO DE FRANGO SEM OSSO|KG|19
            COXA E SOBRECOXA DE FRANGO|KG|14
            FRANGO INTEIRO RESFRIADO|KG|12
            ASA DE FRANGO TULIPA|KG|21
            FILE DE SASSAMI|KG|23
            GALETO RESFRIADO|UNID|16
            OVOS BRANCOS|UNID|0.75
            PEITO DE PATO|KG|96""",
        'PESCADOS': """SALMAO FILE FRESCO|KG|98
            CAMARAO CINZA LIMPO|KG|79
            CAMARAO ROSA GRANDE|KG|118
            FILE DE PESCADA|KG|42
            ROBALO FILE|KG|92
            LULA EM ANEIS|KG|48
            ATUM FRESCO LOMBO|KG|110
            FILE DE TILAPIA|KG|38
            MEXILHAO LIMPO|KG|36
            BACALHAU DESSALGADO|KG|99""",
    },
    'HORTIFRUTI': {
        'FLV-LEGUMES': """TOMATE ITALIANO|KG|7.5
            TOMATE CEREJA|KG|16
            BATATA INGLESA|KG|5.2
            BATATA DOCE|KG|5.8
            CEBOLA BRANCA|KG|4.6
            CEBOLA ROXA|KG|6.4
            CENOURA|KG|4.9
            ABOBRINHA ITALIANA|KG|6.8
            BERINJELA|KG|6.2
            PIMENTAO VERMELHO|KG|14
            PIMENTAO VERDE|KG|8.5
            ALHO DESCASCADO|KG|34
            MANDIOCA DESCASCADA|KG|7.9
            ABOBORA CABOTIA|KG|4.8
            COGUMELO PARIS|KG|42
            MILHO VERDE ESPIGA|UNID|2.4""",
        'FLV-FRUTAS': """LIMAO TAHITI|KG|5.9
            LARANJA PERA|KG|4.2
            ABACAXI PEROLA|UNID|7.5
            MORANGO|KG|24
            BANANA PRATA|KG|6.3
            MARACUJA AZEDO|KG|11
            MANGA PALMER|KG|8.4
            MELANCIA|KG|3.2
            UVA SEM SEMENTE|KG|18
            ABACATE|KG|9.5
            LIMAO SICILIANO|KG|16""",
        'FLV-VERDURAS': """ALFACE AMERICANA|UNID|4.2
            RUCULA MACO|UNID|3.6
            MANJERICAO MACO|UNID|4.4
            SALSINHA MACO|UNID|2.6
            CEBOLINHA MACO|UNID|2.6
            COUVE MANTEIGA MACO|UNID|3.4
            ESPINAFRE MACO|UNID|4.1
            HORTELA MACO|UNID|3.9
            MIX DE FOLHAS|KG|38
            ALECRIM MACO|UNID|3.8""",
    },
    'LATICINIOS': {
        'QUEIJOS': """QUEIJO MUSSARELA|KG|39
            QUEIJO PARMESAO|KG|92
            QUEIJO GRANA PADANO|KG|128
            QUEIJO PROVOLONE|KG|62
            QUEIJO GORGONZOLA|KG|74
            BURRATA 200G|UNID|24
            QUEIJO BRIE|KG|86
            QUEIJO COALHO ESPETO|UNID|3.9
            RICOTA FRESCA|KG|26
            QUEIJO PRATO|KG|44
            MUSSARELA DE BUFALA BOLINHA|KG|78""",
        'LACTEOS': """LEITE INTEGRAL|LITRO|5.1
            CREME DE LEITE FRESCO|LITRO|24
            MANTEIGA SEM SAL|KG|52
            IOGURTE NATURAL|KG|14
            REQUEIJAO CREMOSO|KG|28
            LEITE CONDENSADO|KG|19
            MASCARPONE|KG|68
            CREME DE LEITE UHT|LITRO|17""",
    },
    'MERCEARIA': {
        'FARINACEOS': """FARINHA DE TRIGO TIPO 1|KG|4.6
            FARINHA DE TRIGO 00|KG|7.9
            FARINHA PANKO|KG|21
            FARINHA DE ROSCA|KG|9.5
            FARINHA DE MANDIOCA|KG|8.4
            FUBA MIMOSO|KG|5.1
            AMIDO DE MILHO|KG|11""",
        'MASSAS': """MASSA SPAGHETTI GRANO DURO|KG|13
            MASSA PENNE GRANO DURO|KG|13
            MASSA FETTUCCINE|KG|16
            MASSA RIGATONI|KG|14
            MASSA LASANHA|KG|15
            GNOCCHI DE BATATA|KG|21
            RAVIOLI DE QUEIJO|KG|39
            MASSA FRESCA TAGLIATELLE|KG|28""",
        'OLEOS': """AZEITE EXTRA VIRGEM|LITRO|46
            OLEO DE SOJA|LITRO|7.6
            OLEO DE GIRASSOL|LITRO|11
            OLEO PARA FRITURA|LITRO|9.2
            AZEITE COMPOSTO|LITRO|21""",
        'GRAOS': """ARROZ AGULHINHA TIPO 1|KG|5.6
            ARROZ ARBORIO|KG|24
            FEIJAO CARIOCA|KG|7.4
            FEIJAO PRETO|KG|8.1
            GRAO DE BICO|KG|14
            LENTILHA|KG|13
            QUINOA EM GRAOS|KG|36""",
        'CONSERVAS': """TOMATE PELADO|KG|12
            MOLHO DE TOMATE TRADICIONAL|KG|9.8
            AZEITONA VERDE SEM CAROCO|KG|26
            AZEITONA PRETA|KG|29
            PALMITO PUPUNHA|KG|38
            ALCAPARRA|KG|58
            PEPINO EM CONSERVA|KG|17
            ATUM EM LATA|KG|42
            MILHO EM CONSERVA|KG|11
            EXTRATO DE TOMATE|KG|13""",
        'TEMPEROS': """SAL REFINADO|KG|2.4
            SAL GROSSO|KG|2.1
            PIMENTA DO REINO MOIDA|KG|64
            OREGANO DESIDRATADO|KG|58
            PAPRICA DEFUMADA|KG|72
            VINAGRE DE VINHO TINTO|LITRO|9.4
            MOSTARDA DIJON|KG|44
            MAIONESE|KG|16
            KETCHUP|KG|14
            SHOYU|LITRO|15
            ACETO BALSAMICO|LITRO|38
            CALDO DE LEGUMES|KG|31""",
        'ACUCARES E DOCES': """ACUCAR REFINADO|KG|4.8
            ACUCAR CRISTAL|KG|4.3
            ACUCAR MASCAVO|KG|12
            ACUCAR DE CONFEITEIRO|KG|11
            ACUCAR SACHE 5G|UNID|0.07
            CHOCOLATE MEIO AMARGO|KG|58
            CACAU EM PO|KG|62
            DOCE DE LEITE|KG|23
            MEL|KG|42
            GELEIA DE FRUTAS VERMELHAS|KG|37""",
        'CAFES E CHAS': """CAFE EM GRAOS TORRADO|KG|68
            CAFE MOIDO TRADICIONAL|KG|52
            CAFE ESPECIAL EM GRAOS|KG|96
            CAPSULA DE CAFE|UNID|2.1
            CHA DE CAMOMILA SACHE|UNID|0.45
            CHA VERDE SACHE|UNID|0.48""",
    },
    'PADARIA': {
        'PAES': """PAO FRANCES|KG|17
            PAO DE FORMA|UNID|9.5
            PAO DE HAMBURGUER BRIOCHE|UNID|2.3
            PAO ITALIANO|UNID|12
            FOCACCIA|UNID|18
            CIABATTA|UNID|3.6
            PAO DE QUEIJO CONGELADO|KG|26
            CROISSANT CONGELADO|UNID|3.9""",
        'CONFEITARIA': """BOLO DE CENOURA|UNID|38
            TORTA DE LIMAO|UNID|62
            BROWNIE|UNID|6.5
            COOKIE|UNID|4.2
            MASSA FOLHADA|KG|29""",
    },
    'CONGELADOS': {
        'BATATAS CONGELADAS': """BATATA PALITO CONGELADA|KG|16
            BATATA RUSTICA CONGELADA|KG|19
            MANDIOCA PALITO CONGELADA|KG|14
            ANEIS DE CEBOLA EMPANADOS|KG|29""",
        'SOBREMESAS': """SORVETE DE CREME|LITRO|21
            SORVETE DE CHOCOLATE|LITRO|23
            POLPA DE FRUTA|KG|17
            PETIT GATEAU|UNID|7.9""",
        'FRUTOS DO MAR CONGELADOS': """POLVO|KG|88
            CAMARAO EMPANADO|KG|64""",
    },
    'BEBIDAS': {
        'REFRIGERANTES': """REFRIGERANTE COLA LATA 350ML|UNID|3.6
            REFRIGERANTE GUARANA LATA 350ML|UNID|3.2
            REFRIGERANTE LIMAO LATA 350ML|UNID|3.2
            REFRIGERANTE ZERO LATA 350ML|UNID|3.6
            TONICA LATA 350ML|UNID|3.9""",
        'AGUAS': """AGUA MINERAL SEM GAS 500ML|UNID|1.4
            AGUA MINERAL COM GAS 500ML|UNID|1.6
            AGUA MINERAL VIDRO 300ML|UNID|2.3""",
        'SUCOS': """SUCO DE LARANJA INTEGRAL|LITRO|11
            SUCO DE UVA INTEGRAL|LITRO|14
            AGUA DE COCO|LITRO|9.8
            CHA GELADO LATA|UNID|4.4""",
        'CERVEJAS': """CERVEJA PILSEN CHOPP BARRIL 50L|UNID|420
            CERVEJA PILSEN LONG NECK 355ML|UNID|4.6
            CERVEJA PILSEN GARRAFA 600ML|UNID|7.2
            CERVEJA IPA LONG NECK 355ML|UNID|8.9
            CERVEJA SEM ALCOOL LATA 350ML|UNID|4.1
            CERVEJA WEISS GARRAFA 500ML|UNID|11""",
        'DESTILADOS': """CACHACA ENVELHECIDA 700ML|UNID|62
            VODKA NACIONAL 1L|UNID|48
            GIN NACIONAL 750ML|UNID|79
            RUM BRANCO 1L|UNID|52
            LICOR DE LARANJA 750ML|UNID|88
            APERITIVO AMARO 750ML|UNID|64""",
    },
    'VINHOS': {
        'VINHOS TINTOS': """VINHO TINTO MALBEC 750ML|UNID|62
            VINHO TINTO CABERNET 750ML|UNID|58
            VINHO TINTO MERLOT 750ML|UNID|54
            VINHO TINTO SANGIOVESE 750ML|UNID|89
            VINHO TINTO TEMPRANILLO 750ML|UNID|71
            VINHO TINTO DA CASA 5L|UNID|96""",
        'VINHOS BRANCOS': """VINHO BRANCO SAUVIGNON BLANC 750ML|UNID|56
            VINHO BRANCO CHARDONNAY 750ML|UNID|61
            VINHO BRANCO PINOT GRIGIO 750ML|UNID|67""",
        'ESPUMANTES': """ESPUMANTE BRUT 750ML|UNID|52
            ESPUMANTE MOSCATEL 750ML|UNID|44
            PROSECCO 750ML|UNID|74""",
        'VINHOS ROSES': """VINHO ROSE 750ML|UNID|57""",
    },
    'PRODUCAO CENTRAL': {
        'INSUMOS DE PRODUCAO': """ETIQUETA DE VALIDADE|UNID|0.09
            SACO A VACUO|UNID|0.42""",
    },
    'REFEICAO FUNCIONARIOS': {
        'REFEICOES': """MARMITA REFEICAO FUNCIONARIO|UNID|17""",
    },
    'CPQ - PRODUCAO': {
        'TRANSFERENCIAS': """CAIXA TERMICA DE TRANSPORTE|UNID|38""",
    },
    # ---- grupos "nao produto" (excluidos das analises de compra de insumos, como no portal original) ----
    'DESCARTAVEIS': {
        'EMBALAGENS': """EMBALAGEM DELIVERY KRAFT|UNID|1.3
            COPO DESCARTAVEL 300ML|UNID|0.16
            GUARDANAPO DE PAPEL|UNID|0.03
            PAPEL FILME PVC|UNID|39
            PAPEL ALUMINIO ROLO|UNID|46
            CANUDO DE PAPEL|UNID|0.06
            SACOLA KRAFT|UNID|0.9""",
    },
    'CONSUMO': {
        'LIMPEZA': """DETERGENTE NEUTRO|LITRO|6.4
            DESENGORDURANTE|LITRO|19
            ALCOOL 70|LITRO|11
            PANO MULTIUSO|UNID|1.9
            SACO DE LIXO 100L|UNID|0.85
            LUVA NITRILICA|UNID|0.48""",
    },
    'UTENSILIOS': {
        'COZINHA': """FACA DO CHEF|UNID|189
            TABUA DE CORTE|UNID|96
            PANELA INOX 10L|UNID|420
            ASSADEIRA ALUMINIO|UNID|78
            TACA DE VINHO|UNID|24
            PRATO RASO PORCELANA|UNID|36""",
    },
    'MANUTENCAO': {
        'REPAROS': """MANUTENCAO DE COIFA|UNID|1450
            REPARO ELETRICO|UNID|680
            MANUTENCAO DE CAMARA FRIA|UNID|2100
            LAMPADA LED|UNID|19
            PINTURA DE SALAO|UNID|3800""",
    },
    'MAQUINAS E EQUIPAMENTOS': {
        'EQUIPAMENTOS': """LIQUIDIFICADOR INDUSTRIAL|UNID|1890
            FORNO COMBINADO PECA REPOSICAO|UNID|2600
            BALANCA DIGITAL|UNID|540
            SELADORA A VACUO|UNID|3200""",
    },
    'SERVICOS': {
        'SERVICOS GERAIS': """DEDETIZACAO|UNID|980
            LAVANDERIA DE ENXOVAL|UNID|1650
            COLETA DE OLEO USADO|UNID|240
            AFIACAO DE FACAS|UNID|180""",
    },
}

GRUPOS_NAO_PRODUTO = {'DESCARTAVEIS', 'CONSUMO', 'UTENSILIOS', 'MANUTENCAO', 'MAQUINAS E EQUIPAMENTOS', 'SERVICOS'}
GRUPO_GERENCIAL = {'BEBIDAS': 'BEBIDAS', 'VINHOS': 'VINHOS'}
# Itens produzidos pela central e faturados para as casas (fornecedor intercompany, excluido das analises)
ITENS_CENTRAL = """MOLHO DE TOMATE DA CASA|KG|14
    MASSA FRESCA DA CASA|KG|19
    CALDO DE CARNE DA CASA|LITRO|12
    PAO DE FERMENTACAO NATURAL DA CASA|UNID|9""".split('\n')

# Familias de commodity (mesmas regras da pagina de Commodities): o choque mensal de preco de cada familia e' usado nas
# notas e, com ruido, no IPCA sintetico da familia — por isso o preco pago e o IPCA "andam juntos" de forma plausivel.
FAMILIAS = {
    'carne_bovina': (7283, 'Carnes'), 'suino': (7287, 'Carne de porco'), 'frango': (107618, 'Frango em pedaços'),
    'leite_derivados': (7356, 'Leite e derivados'), 'trigo': (7184, 'Farinhas, féculas e massas'),
    'oleos_azeite': (7384, 'Óleos e gorduras'), 'cafe': (7392, 'Café moído'), 'acucar': (7220, 'Açúcares e derivados'),
    'hortifruti': (7200, 'Tubérculos, raízes e legumes'),
}
IPCA_GERAL, IPCA_ALIMENTACAO = 7169, 7170


def familia_do_item(nome, subgrupo, grupo, um):
    if subgrupo == 'BOVINOS':
        return 'carne_bovina'
    if subgrupo == 'SUINOS':
        return 'suino'
    if subgrupo == 'AVES':
        return 'frango'
    if grupo == 'LATICINIOS':
        return 'leite_derivados'
    if subgrupo in ('FARINACEOS', 'MASSAS'):
        return 'trigo'
    if subgrupo == 'OLEOS':
        return 'oleos_azeite'
    if nome.startswith('CAFE') and um == 'KG':
        return 'cafe'
    if nome.startswith('ACUCAR') and um == 'KG':
        return 'acucar'
    if subgrupo == 'FLV-LEGUMES' and nome.split()[0] in ('TOMATE', 'BATATA', 'CEBOLA') and 'DOCE' not in nome:
        return 'hortifruti'
    return None


# =====================================================================================================================
# Fornecedores: nomes inventados por silabas (seed), com especialidade e porte (concentracao de Pareto)
# =====================================================================================================================
ESPECIALIDADES = {
    # especialidade: (subgrupos atendidos, quantidade de fornecedores, prefixos de razao social)
    'carnes': (['BOVINOS', 'SUINOS'], 10, ['FRIGORIFICO', 'CARNES', 'CASA DE CARNES']),
    'aves': (['AVES'], 5, ['AVICOLA', 'GRANJA']),
    'pescados': (['PESCADOS', 'FRUTOS DO MAR CONGELADOS'], 6, ['PESCADOS', 'COMERCIO DE PESCADOS']),
    'flv': (['FLV-LEGUMES', 'FLV-FRUTAS', 'FLV-VERDURAS'], 10, ['HORTIFRUTI', 'CEREALISTA', 'DISTRIBUIDORA DE HORTALICAS']),
    'laticinios': (['QUEIJOS', 'LACTEOS'], 9, ['LATICINIOS', 'QUEIJARIA', 'DISTRIBUIDORA DE FRIOS']),
    'mercearia': (['FARINACEOS', 'MASSAS', 'OLEOS', 'GRAOS', 'CONSERVAS', 'TEMPEROS', 'ACUCARES E DOCES', 'CAFES E CHAS'],
                  16, ['ATACADISTA', 'DISTRIBUIDORA', 'COMERCIAL', 'EMPORIO']),
    'cafe': (['CAFES E CHAS'], 3, ['TORREFACAO', 'CAFES']),
    'padaria': (['PAES', 'CONFEITARIA'], 7, ['PANIFICADORA', 'CONFEITARIA', 'PADARIA']),
    'congelados': (['BATATAS CONGELADAS', 'SOBREMESAS', 'FRUTOS DO MAR CONGELADOS'], 5, ['CONGELADOS', 'SORVETES']),
    'bebidas': (['REFRIGERANTES', 'AGUAS', 'SUCOS', 'CERVEJAS'], 9, ['DISTRIBUIDORA DE BEBIDAS', 'BEBIDAS']),
    'cervejaria': (['CERVEJAS'], 3, ['CERVEJARIA']),
    'destilados': (['DESTILADOS'], 4, ['DESTILARIA', 'IMPORTADORA DE BEBIDAS']),
    'vinhos': (['VINHOS TINTOS', 'VINHOS BRANCOS', 'ESPUMANTES', 'VINHOS ROSES'], 10, ['IMPORTADORA DE VINHOS', 'VINICOLA', 'ADEGA']),
    'producao': (['INSUMOS DE PRODUCAO', 'REFEICOES', 'TRANSFERENCIAS'], 3, ['SUPRIMENTOS', 'COZINHA INDUSTRIAL']),
    'descartaveis': (['EMBALAGENS'], 8, ['EMBALAGENS', 'DESCARTAVEIS']),
    'limpeza': (['LIMPEZA'], 6, ['PRODUTOS DE LIMPEZA', 'HIGIENE']),
    'utensilios': (['COZINHA'], 6, ['UTILIDADES', 'EQUIPAMENTOS PARA COZINHA']),
    'manutencao': (['REPAROS'], 14, ['MANUTENCAO', 'ENGENHARIA', 'REFRIGERACAO', 'INSTALACOES']),
    'equipamentos': (['EQUIPAMENTOS'], 7, ['MAQUINAS', 'EQUIPAMENTOS']),
    'servicos': (['SERVICOS GERAIS'], 14, ['SERVICOS', 'LAVANDERIA', 'CONTROLE DE PRAGAS', 'AMBIENTAL']),
}

# Fornecedores "ancora" com variacoes de grafia na base bruta — exercitam a padronizacao de nomes de
# shared_py/etl_common.py (_MAPA_EXATO e a regra por substring). Os nomes sao inventados.
ANCORAS = {
    'carnes': ('FRIGORIFICO BARILO S/A', ['FRIGORIFICO BARILO S A', 'FRIGORIFICO BARILO SA - FILIAL 2']),
    'mercearia': ('DISTRIBUIDORA VETAMON LTDA', ['DISTRIB. VETAMON LTDA', 'DISTRIBUIDORA VETAMON LTDA.']),
    'laticinios': ('LATICINIOS QUIRANA LTDA', ['LATICINIOS QUIRANA LTDA - MATRIZ']),
    'cervejaria': ('CERVEJARIA LUPULAR S/A', ['LUPULAR BEBIDAS DO SUDESTE LTDA', 'CERVEJARIA LUPULAR S.A. FILIAL RJ']),
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
        # quantidade tipica por linha de nota: itens caros saem em quantidades menores
        it['q0'] = float(np.clip(380 / it['preco'], 1, 90))
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


# Mix de compra por vertical (peso de cada especialidade nas notas da casa)
MIX = {
    'RESTAURANTE': {'carnes': 15, 'aves': 5, 'pescados': 7, 'flv': 12, 'laticinios': 9, 'mercearia': 16, 'cafe': 1.5,
                    'padaria': 4, 'congelados': 3, 'bebidas': 8, 'cervejaria': 2.5, 'destilados': 2, 'vinhos': 7,
                    'producao': 0.6, 'descartaveis': 3, 'limpeza': 2.5, 'utensilios': 1, 'manutencao': 1.6,
                    'equipamentos': 0.5, 'servicos': 1.6},
    'BAR': {'carnes': 9, 'aves': 6, 'pescados': 3, 'flv': 8, 'laticinios': 6, 'mercearia': 11, 'cafe': 0.6,
            'padaria': 4, 'congelados': 6, 'bebidas': 17, 'cervejaria': 12, 'destilados': 7, 'vinhos': 2,
            'producao': 0.5, 'descartaveis': 3, 'limpeza': 2.5, 'utensilios': 1, 'manutencao': 1.6,
            'equipamentos': 0.5, 'servicos': 1.5},
    'CAFETERIA': {'carnes': 1, 'aves': 3, 'pescados': 0.3, 'flv': 9, 'laticinios': 14, 'mercearia': 13, 'cafe': 14,
                  'padaria': 17, 'congelados': 4, 'bebidas': 7, 'cervejaria': 0.3, 'destilados': 0.2, 'vinhos': 0.6,
                  'producao': 0.4, 'descartaveis': 6, 'limpeza': 2.5, 'utensilios': 1, 'manutencao': 1.2,
                  'equipamentos': 0.4, 'servicos': 1.2},
    'PRODUCAO CENTRAL': {'carnes': 22, 'aves': 7, 'pescados': 6, 'flv': 16, 'laticinios': 10, 'mercearia': 22, 'cafe': 0.2,
                         'padaria': 1, 'congelados': 2, 'bebidas': 0.3, 'cervejaria': 0, 'destilados': 0, 'vinhos': 0.2,
                         'producao': 2.5, 'descartaveis': 4, 'limpeza': 3, 'utensilios': 1.2, 'manutencao': 2,
                         'equipamentos': 1, 'servicos': 1.8},
}
FATOR_REGIAO = {'SP': 1.0, 'RJ': 1.035, 'BR': 0.975}


def caminho_precos(itens):
    """Fator de preco por item e mes: tendencia propria + choque mensal da familia + sazonalidade do hortifruti."""
    choques = {fam: rng.normal(0.004, 0.018, len(MESES)) for fam in FAMILIAS}
    choques['carne_bovina'] += 0.012                 # ciclo de alta da arroba no periodo
    choques['cafe'] += np.linspace(0.03, -0.01, len(MESES))
    choques['hortifruti'] += 0.06 * np.sin(np.linspace(0, 2.4 * math.pi, len(MESES)))
    choques['oleos_azeite'] -= 0.008
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
        destinatarios[c['fantasia']] = (f'{marca} GASTRONOMIA LTDA' if c is not CENTRAL else FORNECEDOR_INTERCOMPANY,
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
    # intercompany: a central fatura producao propria para as casas (removido das analises pelo ETL)
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
            if c['vertical'] == 'CAFETERIA' or (c['abertura'] and mes < c['abertura']):
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
                desc_forn = f"{it['nome']} {rng.choice(['KG', 'PECA', 'A GRANEL', 'RESFRIADO'] if it['grupo'] == 'PROTEINAS' else ['KG', 'PCT 1KG', 'SC 5KG', 'A GRANEL'])}"
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
            if it['nome'] == 'FILE MIGNON BOVINO PECA' and rng.random() < 0.35:
                nome_item = str(rng.choice(['FILE MIGNON BOVINO', '(MP) FILE MIGNON BOVINO PECA']))
            else:
                nome_item = it['nome']
            grupo = it['grupo']
            if grupo == 'MERCEARIA' and rng.random() < 0.2:
                grupo = 'MERCEARIA SECA'           # variante de cadastro, unificada pelo ETL
            if nome_item == 'POLVO':
                grupo = 'CONGELADOS'               # reclassificado para PROTEINAS/PESCADOS pelo ETL
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


DEMANDA_POR_ESP = {'carnes': 'PROTEINAS', 'aves': 'PROTEINAS', 'pescados': 'PROTEINAS', 'flv': 'HORTIFRUTI',
                   'laticinios': 'LATICINIOS', 'mercearia': 'MERCEARIA', 'cafe': 'MERCEARIA', 'padaria': 'PADARIA',
                   'congelados': 'CONGELADOS', 'bebidas': 'BEBIDAS', 'cervejaria': 'BEBIDAS', 'destilados': 'BEBIDAS',
                   'vinhos': 'VINHOS', 'descartaveis': 'MATERIAIS', 'limpeza': 'MATERIAIS'}
COMPRADOR_POR_DEMANDA = {'PROTEINAS': ['ANA PAULA', 'BRUNO COSTA'], 'HORTIFRUTI': ['CARLA MENDES'],
                         'LATICINIOS': ['CARLA MENDES', 'DIEGO'], 'MERCEARIA': ['DIEGO', 'ELISA RAMOS'],
                         'PADARIA': ['ELISA RAMOS'], 'CONGELADOS': ['BRUNO COSTA'], 'BEBIDAS': ['GABRIEL'],
                         'VINHOS': ['GABRIEL'], 'MATERIAIS': ['COMPRAS APOIO'], 'CPQ': ['COMPRAS CPQ']}
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
    n['CAT'] = np.select([n['GRUPO'] == 'VINHOS', n['GRUPO'] == 'BEBIDAS', n['GRUPO'].isin(GRUPOS_NAO_PRODUTO)],
                         ['vinhos', 'bebidas', 'outros'], 'alimentos')
    inter = n['RAZAO FORNECEDOR'] == FORNECEDOR_INTERCOMPANY
    compras = n[~inter].groupby(['CASAS', 'MES', 'CAT'])['V. CONTABIL NF'].sum()
    producao = n[inter].groupby(['CASAS', 'MES'])['V. CONTABIL NF'].sum()
    meta_casa = {c['fantasia']: float(rng.normal(0.33, 0.024)) for c in CASAS}
    cmc_linhas, cmv_linhas = [], []
    for mes in MESES:
        for c in CASAS:
            if not c['codigo'] or (c['abertura'] and mes < c['abertura']):
                continue
            g = lambda cat: float(compras.get((c['fantasia'], mes, cat), 0.0))  # noqa: E731
            comp_alim, comp_vin, comp_beb = g('alimentos'), g('vinhos'), g('bebidas')
            prod = float(producao.get((c['fantasia'], mes), 0.0))
            alvo = meta_casa[c['fantasia']] + rng.normal(-0.002 * MESES.index(mes), 0.012)
            vendas_alim = (comp_alim + prod) / max(alvo, 0.2) * 1.03
            ref_func = vendas_alim * float(rng.uniform(0.02, 0.04))
            vendas_vin = comp_vin / float(rng.uniform(0.36, 0.46)) if comp_vin else 0.0
            vendas_beb = comp_beb / float(rng.uniform(0.2, 0.29)) if comp_beb else 0.0
            custo_alim = comp_alim + prod - ref_func
            pct = lambda a, b: round(a / b, 4) if b else None  # noqa: E731
            cmc_linhas.append({
                'CASA': c['codigo'], 'EQUIVALENTE': c['fantasia'], 'SEGMENTO': c['vertical'], 'REGIÃO': c['regiao'],
                'mês': datetime(int(mes[:4]), int(mes[5:]), 1),
                'VENDAS ALIMENTOS (+)': round(vendas_alim, 2), 'COMPRAS ALIMENTOS (-)': round(comp_alim, 2),
                'PRODUÇÃO CENTRAL (-)': round(prod, 2), 'REF. FUNCIONARIO (V.MÉDIO) (+)': round(ref_func, 2),
                '% CMC ALIMENTOS': pct(custo_alim, vendas_alim),
                'COMPRAS VINHOS (-)': round(comp_vin, 2), 'VENDAS VINHOS (+)': round(vendas_vin, 2),
                '% CMC VINHOS': pct(comp_vin, vendas_vin),
                'COMPRAS BEBIDAS (-)': round(comp_beb, 2), 'VENDAS BEBIDAS (+)': round(vendas_beb, 2),
                '% CMC BEBIDAS': pct(comp_beb, vendas_beb),
                '% CMC Geral': pct(custo_alim + comp_vin + comp_beb, vendas_alim + vendas_vin + vendas_beb),
            })
            receita = (vendas_alim + vendas_vin + vendas_beb) * float(rng.uniform(0.9, 0.93))
            cmv = (custo_alim + comp_vin + comp_beb) * float(rng.uniform(0.96, 1.03))
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
            cmv = (base26 + float(rng.uniform(0.004, 0.019))) if base26 else float(rng.normal(0.318, 0.006))
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
        props.title = 'Dados sinteticos — Grupo Quintaluz (ficticio)'
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
