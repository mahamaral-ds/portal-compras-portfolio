"""
Cruzamento entre os nomes de casa usados na base BRUTA de notas fiscais
(coluna FANTASIA/CASAS, nomes por extenso — ex: "QUINTALUZ CAFE MIRANTE") e os
codigos usados nas bases de CMC e CMV (coluna CASA/CASAS — ex: "QC-MIRANTE").

Os dois mapas sao montados a partir do catalogo ficticio de lojas
(shared_py/catalogo_ficticio.py). Lojas sem codigo (ex.: o quiosque sazonal)
ficam de fora de proposito — servem de exemplo de loja sem correspondencia.
"""
from catalogo_ficticio import CASAS

# FANTASIA (base bruta) -> CASA (base de CMC)
FANTASIA_TO_CMC = {c['fantasia']: c['codigo'] for c in CASAS if c['codigo']}

# FANTASIA (base bruta) -> CASAS (base cmv-casas.xlsx — vertical e regiao de cada casa).
# Na base ficticia os codigos de CMC e de CMV sao os mesmos.
FANTASIA_TO_CMV = dict(FANTASIA_TO_CMC)
