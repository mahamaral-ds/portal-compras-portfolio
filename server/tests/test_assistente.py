"""Testes do Assistente (sem chamar a API: o Claude é substituído por um cliente falso).

Rodar na pasta do projeto:  server\\.venv\\Scripts\\python -m unittest discover -s server/tests -v
"""
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'server'))

import assistente  # noqa: E402
import portal_tools as T  # noqa: E402

assistente.USAR_FALLBACK = False

try:
    import pandas  # noqa: F401
    _TEM_PANDAS = True
except ImportError:
    _TEM_PANDAS = False


def bloco_texto(t):
    return SimpleNamespace(type='text', text=t)


def bloco_tool(i, nome, args):
    return SimpleNamespace(type='tool_use', id=i, name=nome, input=args)


def resp(stop, *blocos):
    return SimpleNamespace(stop_reason=stop, content=list(blocos),
                           usage=SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0))


class ClienteFalso:
    """Devolve respostas roteirizadas e guarda as chamadas recebidas."""

    def __init__(self, *roteiro):
        self.roteiro = list(roteiro)
        self.chamadas = []
        self.messages = SimpleNamespace(create=self._criar)
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._criar))

    def _criar(self, **kw):
        # copia a lista de mensagens: o laço continua acrescentando a ela depois da chamada
        kw = dict(kw, messages=[dict(m) for m in kw['messages']])
        self.chamadas.append(kw)
        return self.roteiro.pop(0)


class TestFerramentas(unittest.TestCase):
    def test_categorias_formata_valores_e_traz_fonte(self):
        txt, erro = T.executar('categorias', {'top': 2})
        self.assertFalse(erro)
        d = json.loads(txt)
        self.assertEqual(len(d['categorias']), 2)
        self.assertTrue(d['categorias'][0]['valor'].startswith('R$ '))
        self.assertIn('Categorias', d['fonte'])

    def test_meses_invalidos_viram_erro(self):
        txt, erro = T.executar('categorias', {'meses': ['2026-13']})
        self.assertTrue(erro)
        self.assertIn('inválido', json.loads(txt)['erro'])

    def test_item_ambiguo_pede_esclarecimento(self):
        txt, erro = T.executar('preco_item', {'item': 'file mignon'})
        self.assertTrue(erro)
        self.assertIn('Pergunte ao usuário', json.loads(txt)['erro'])

    def test_categoria_e_segmento_juntos_sao_recusados(self):
        _, erro = T.executar('ranking_fornecedores', {'categoria': 'PROTEINAS', 'segmento': 'BAR'})
        self.assertTrue(erro)

    def test_ferramenta_desconhecida_e_parametro_invalido(self):
        self.assertTrue(T.executar('nao_existe', {})[1])
        self.assertTrue(T.executar('categorias', {'parametro_errado': 1})[1])

    def test_varios_meses_somam_o_valor_dos_meses(self):
        um = json.loads(T.executar('categorias', {'meses': ['2026-03'], 'top': 30})[0])
        dois = json.loads(T.executar('categorias', {'meses': ['2026-03', '2026-04'], 'top': 30})[0])
        self.assertIn('observacao', dois)
        self.assertNotIn('itens_unicos', dois['categorias'][0])   # contagem única não é somável
        self.assertEqual(um['periodo'], 'Mar/26')

    @unittest.skipUnless((RAIZ / 'raw-data' / 'base-raw-compras.xlsx').exists() and _TEM_PANDAS,
                         'precisa da planilha bruta e do pandas (rode com o Python do sistema para incluir este teste)')
    def test_valores_batem_com_a_base_bruta(self):
        """Compara categoria e fornecedor com a soma direta da planilha (até o último mês dos data.js).

        Tolerância de 0,05%: se os data.js estiverem defasados em relação à planilha (ajustes retroativos), é sinal
        de que os módulos precisam ser reconstruídos, não de erro de leitura das ferramentas."""
        sys.path.insert(0, str(RAIZ / 'shared_py'))
        import etl_common
        etl_common.registrar_periodo_base = lambda df: None      # não reescrever shared/portal-meta.js
        df = etl_common.raw_to_consolidada(str(RAIZ / 'raw-data' / 'base-raw-compras.xlsx'))
        ultimo = T.dados('categorias')['months_order'][-1]
        df = df[df['MES'] <= ultimo]
        por_grupo = df.groupby('GRUPO')['VALOR_CONTABIL'].sum()
        for r in T.dados('categorias')['periods']['ALL']['ranking'][:5]:
            self.assertAlmostEqual(r['Valor Total'], float(por_grupo[r['Categoria']]), delta=max(1.0, 0.0005 * r['Valor Total']), msg=r['Categoria'])
        por_forn = df.groupby('RAZAO FORNECEDOR')['VALOR_CONTABIL'].sum()
        for r in T.dados('fornecedores')['periods']['ALL']['ranking'][:5]:
            self.assertAlmostEqual(r['Valor Total'], float(por_forn[r['Fornecedor']]), delta=max(1.0, 0.0005 * r['Valor Total']), msg=r['Fornecedor'])


class TestHistorico(unittest.TestCase):
    def test_exige_ultima_mensagem_do_usuario(self):
        with self.assertRaises(assistente.PedidoInvalido):
            assistente.validar_historico([{'role': 'user', 'content': 'oi'}, {'role': 'assistant', 'content': 'olá'}])

    def test_rejeita_formato_e_pergunta_longa(self):
        with self.assertRaises(assistente.PedidoInvalido):
            assistente.validar_historico([{'role': 'system', 'content': 'x'}])
        with self.assertRaises(assistente.PedidoInvalido):
            assistente.validar_historico([{'role': 'user', 'content': 'a' * 2001}])
        with self.assertRaises(assistente.PedidoInvalido):
            assistente.validar_historico([])

    def test_limita_e_alterna_papeis(self):
        msgs = []
        for i in range(30):
            msgs += [{'role': 'user', 'content': f'p{i}'}, {'role': 'assistant', 'content': f'r{i}'}]
        msgs.append({'role': 'user', 'content': 'final'})
        h = assistente.validar_historico(msgs)
        self.assertLessEqual(len(h), assistente.MAX_TURNOS_HISTORICO)
        self.assertEqual(h[0]['role'], 'user')
        self.assertEqual(h[-1]['content'], 'final')
        self.assertTrue(all(a['role'] != b['role'] for a, b in zip(h, h[1:])))


class TestLaco(unittest.TestCase):
    def test_executa_ferramenta_e_devolve_resposta_com_fontes(self):
        cliente = ClienteFalso(
            resp('tool_use', bloco_texto('Vou consultar.'), bloco_tool('t1', 'categorias', {'top': 2})),
            resp('end_turn', bloco_texto('A maior categoria é PROTEINAS.')),
        )
        saida = assistente.responder([{'role': 'user', 'content': 'qual a maior categoria?'}], cliente=cliente)
        self.assertEqual(saida['resposta'], 'A maior categoria é PROTEINAS.')
        self.assertIn('Categorias → Ranking de Categorias', saida['fontes'])
        self.assertEqual(saida['ferramentas'][0]['ferramenta'], 'categorias')
        # 2ª chamada: o resultado da ferramenta volta ao Claude como tool_result com os dados reais
        seg = cliente.chamadas[1]['messages'][-1]['content'][0]
        self.assertEqual(seg['type'], 'tool_result')
        self.assertEqual(seg['tool_use_id'], 't1')
        self.assertIn('PROTEINAS', seg['content'])
        self.assertNotIn('is_error', seg)
        self.assertEqual(saida['uso']['entrada'], 200)
        # parâmetros da chamada: modelo, thinking adaptativo, ferramentas e sistema
        c = cliente.chamadas[0]
        self.assertEqual(c['model'], assistente.MODELO)
        self.assertEqual(c['thinking'], {'type': 'adaptive'})
        self.assertEqual(len(c['tools']), len(T.FERRAMENTAS))
        self.assertIn('REGRAS DE OURO', c['system'])

    def test_erro_de_ferramenta_vai_como_is_error(self):
        cliente = ClienteFalso(
            resp('tool_use', bloco_tool('t1', 'categorias', {'meses': ['1999-01']})),
            resp('end_turn', bloco_texto('Esse mês não existe nos dados.')),
        )
        saida = assistente.responder([{'role': 'user', 'content': 'categorias em 1999'}], cliente=cliente)
        seg = cliente.chamadas[1]['messages'][-1]['content'][0]
        self.assertTrue(seg.get('is_error'))
        self.assertTrue(saida['ferramentas'][0]['erro'])
        self.assertEqual(saida['fontes'], [])

    def test_varias_ferramentas_na_mesma_rodada_voltam_juntas(self):
        cliente = ClienteFalso(
            resp('tool_use', bloco_tool('a', 'resumo_geral', {}), bloco_tool('b', 'indicadores_executivos', {})),
            resp('end_turn', bloco_texto('ok')),
        )
        assistente.responder([{'role': 'user', 'content': 'panorama'}], cliente=cliente)
        resultados = cliente.chamadas[1]['messages'][-1]['content']
        self.assertEqual([r['tool_use_id'] for r in resultados], ['a', 'b'])

    def test_limite_de_rodadas(self):
        n = assistente.MAX_ITER
        cliente = ClienteFalso(*[resp('tool_use', bloco_tool(f't{i}', 'resumo_geral', {})) for i in range(n)])
        saida = assistente.responder([{'role': 'user', 'content': 'x'}], cliente=cliente)
        self.assertTrue(saida.get('interrompido'))

    def test_recusa_e_texto_vazio(self):
        s1 = assistente.responder([{'role': 'user', 'content': 'x'}], cliente=ClienteFalso(resp('refusal', bloco_texto(''))))
        self.assertTrue(s1.get('recusa'))
        s2 = assistente.responder([{'role': 'user', 'content': 'x'}], cliente=ClienteFalso(resp('end_turn')))
        self.assertIn('Tente reformul', s2['resposta'])


if __name__ == '__main__':
    unittest.main()
