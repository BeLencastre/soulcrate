"""Testes das regras do plugin pastas (soulbeet/beets-plugins/pastas.py).

Rodam sem o contêiner: o beets só existe dentro da imagem do Soulbeet, então um
`beets.plugins` falso basta para importar o módulo e testar as funções puras.

    python -m unittest discover -s tests/soulbeet -v
"""

import json
import pathlib
import re
import tempfile
import unittest
from unittest import mock

import _beets_falso

RAIZ = pathlib.Path(__file__).resolve().parents[2]
pastas = _beets_falso.carregar_pastas()


class GeneroDaPasta(unittest.TestCase):
    def assertGenero(self, generos, esperado):
        self.assertEqual(pastas.genero_da_pasta(generos), esperado, repr(generos))

    def test_listas_de_generos_num_texto_so_ficam_com_o_primeiro(self):
        for g in [
            "Hard Dance",
            "Hard Dance / Hardcore / Neo Rave",
            "Hard Dance _ Hardcore _ Neo Rave",
            "Hard Dance _ Hardcore _ Neo Rave, Neo Rave",
            "Hard Dance;Hardcore;Neo Rave",
            "Hard Dance - Hardcore",
        ]:
            self.assertGenero(g, "Hard Dance")

    def test_virgula_e_sublinhado_separam(self):
        self.assertGenero("Electro, Techno_House, Dance", "Electro")
        self.assertGenero("Electro_ Techno_House", "Electro")
        self.assertGenero("Electro_Techno_House_Rock_Hard Rock", "Electro")
        self.assertGenero("Electronic,Gabber,Hard Techno,Hardcore,Hardstyle", "Electronic")
        self.assertGenero("Hard Techno, Techno", "Hard Techno")
        self.assertGenero("Industrial Techno, Techno", "Industrial Techno")
        self.assertGenero("Dance _ Pop", "Dance")

    def test_qualificador_entre_parenteses_sai(self):
        self.assertGenero("Techno (Peak Time / Driving)", "Techno")
        self.assertGenero("Techno (Peak Time _ Driving)", "Techno")
        self.assertGenero("Techno (Hard)", "Techno")

    def test_grafias_do_mesmo_genero_viram_uma(self):
        for g in ["Psy-Trance", "Psy Trance", "psytrance", "PSY TRANCE", "Psytrance"]:
            self.assertGenero(g, "Psy-Trance")
        for g in ["Hip Hop", "hip-hop", "HipHop"]:
            self.assertGenero(g, "Hip-Hop")
        for g in ["Drum and Bass", "drum & bass", "DnB", "Drum n Bass"]:
            self.assertGenero(g, "Drum & Bass")
        self.assertGenero("hard techno", "Hard Techno")
        self.assertGenero("Électronique, Techno", "Electronic")
        self.assertGenero("Dans", "Dance")

    def test_hifen_e_e_comercial_fazem_parte_do_nome(self):
        self.assertGenero("Melodic House & Techno", "Melodic House & Techno")
        self.assertGenero("Psy-Trance", "Psy-Trance")

    def test_generos_emendados_sem_separador(self):
        self.assertGenero("HardcoreHardstyleGabberHard Techno", "Hardcore")

    def test_generos_diferentes_continuam_diferentes(self):
        self.assertGenero("Hard Techno", "Hard Techno")
        self.assertGenero("Techno", "Techno")
        self.assertGenero("Electro", "Electro")
        self.assertGenero("Electronic", "Electronic")
        self.assertGenero("Dance Trance", "Dance Trance")
        self.assertGenero("Psychedelic", "Psychedelic")

    def test_genero_fora_da_tabela_so_arruma_maiusculas(self):
        self.assertGenero("crust punk", "Crust Punk")
        self.assertGenero("METALCORE", "Metalcore")
        self.assertGenero("EDM", "EDM")
        self.assertGenero("Neurofunk", "Neurofunk")

    def test_site_no_lugar_do_genero_conta_como_sem_genero(self):
        for g in ["djsoundtop.com", "https_djsoundtop.com", "https://electronicfresh.com", "www.site.net"]:
            self.assertGenero(g, pastas.SEM_GENERO)
        self.assertGenero("djsoundtop.com; Techno", "Techno")

    def test_sem_genero(self):
        for g in [None, "", [], ["", "  "], " ; / "]:
            self.assertGenero(g, pastas.SEM_GENERO)

    def test_lista_do_beets_usa_o_primeiro_aproveitavel(self):
        self.assertGenero(["Hard Dance;Hardcore", "Techno"], "Hard Dance")
        self.assertGenero(["djsoundtop.com", "Techno"], "Techno")

    def test_apelidos_do_config(self):
        tabela = pastas.montar_tabela({"Psychedelic": "Psy-Trance", "Bouncy": "Bounce"})
        self.assertEqual(pastas.genero_da_pasta("Psychedelic", tabela), "Psy-Trance")
        self.assertEqual(pastas.genero_da_pasta("bouncy", tabela), "Bounce")
        self.assertEqual(pastas.genero_da_pasta("Bounce", tabela), "Bounce")


class PrimeiroArtista(unittest.TestCase):
    def assertArtista(self, artista, esperado, artistas=None):
        self.assertEqual(pastas.primeiro_artista(artistas, artista), esperado, repr((artistas, artista)))

    def test_colaboracao_fica_na_pasta_do_primeiro(self):
        self.assertArtista("KUKO, 9inebro, NEUF", "KUKO")
        self.assertArtista("KUKO; NEUF", "KUKO")
        self.assertArtista("KUKO feat. NEUF", "KUKO")
        self.assertArtista("KUKO ft NEUF", "KUKO")
        self.assertArtista("KUKO featuring NEUF", "KUKO")
        self.assertArtista("KUKO x NEUF", "KUKO")
        self.assertArtista("KUKO vs. NEUF", "KUKO")
        self.assertArtista("KUKO / NEUF", "KUKO")
        self.assertArtista("KUKO (feat. NEUF)", "KUKO")

    def test_nomes_com_e_comercial_barra_ou_x_continuam_inteiros(self):
        self.assertArtista("Above & Beyond", "Above & Beyond")
        self.assertArtista("Chase & Status", "Chase & Status")
        self.assertArtista("AC/DC", "AC/DC")
        self.assertArtista("Malcolm X", "Malcolm X")
        self.assertArtista("Xavier", "Xavier")

    def test_lista_do_musicbrainz_vence_o_texto(self):
        self.assertArtista("Tyler, The Creator & Kali Uchis", "Tyler, The Creator", ["Tyler, The Creator", "Kali Uchis"])
        # lista com um item só: pode ser o texto da tag inteiro (importação "as-is")
        self.assertArtista("KUKO, NEUF", "KUKO", ["KUKO, NEUF"])

    def test_sem_artista(self):
        self.assertArtista(None, "")
        self.assertArtista("", "", [])
        self.assertArtista("KUKO", "KUKO", [])


class Organizacao(unittest.TestCase):
    """A escolha do disco que o app grava em /data/pastas.json (app/src/shared/organizacao.ts)."""

    def test_le_o_que_o_app_grava(self):
        texto = '{\n  "disco": "genero",\n  "rekordbox": "genero-artista"\n}\n'
        self.assertEqual(pastas.organizacao_do_texto(texto), "genero")
        self.assertEqual(pastas.organizacao_do_texto('{"disco": "genero-artista"}'), "genero-artista")

    def test_a_escolha_do_rekordbox_nao_muda_o_disco(self):
        self.assertEqual(pastas.organizacao_do_texto('{"rekordbox": "genero"}'), "genero-artista")
        self.assertEqual(pastas.organizacao_do_texto('{"disco": "genero-artista", "rekordbox": "genero"}'), "genero-artista")

    def test_sem_arquivo_ou_estragado_vale_genero_e_artista(self):
        for texto in [None, "", "{", "[]", "null", '"genero"', '{"disco": "artista"}', '{"disco": 1}']:
            self.assertEqual(pastas.organizacao_do_texto(texto), "genero-artista", repr(texto))

    def test_arquivo_que_nao_existe(self):
        self.assertEqual(pastas.ler_organizacao(str(RAIZ / "nao-existe" / "pastas.json")), "genero-artista")

    def test_le_do_disco(self):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = pathlib.Path(pasta) / "pastas.json"
            caminho.write_text('{"disco": "genero"}', encoding="utf-8")
            self.assertEqual(pastas.ler_organizacao(str(caminho)), "genero")


class Opcoes(unittest.TestCase):
    """O formato novo do pastas.json: {"disco", "rekordbox", "subgenero": {"disco", "rekordbox"}}."""

    def test_formato_novo(self):
        texto = '{"disco": "genero", "rekordbox": "genero-artista", "subgenero": {"disco": true, "rekordbox": false}}'
        self.assertEqual(pastas.opcoes_do_texto(texto), pastas.Opcoes("genero", True))
        self.assertEqual(pastas.organizacao_do_texto(texto), "genero")

    def test_arquivo_antigo_sem_a_chave_nova_deixa_o_subgenero_desligado(self):
        self.assertEqual(pastas.opcoes_do_texto('{"disco": "genero"}'), pastas.Opcoes("genero", False))
        self.assertEqual(pastas.opcoes_do_texto('{"subgenero": {"rekordbox": true}}'), pastas.Opcoes("genero-artista", False))

    def test_chave_invalida_vale_o_padrao(self):
        for texto in [None, "", "{", "[]", '{"subgenero": true}', '{"subgenero": {"disco": "sim"}}', '{"subgenero": {"disco": 1}}', '{"subgenero": null}']:
            self.assertEqual(pastas.opcoes_do_texto(texto), pastas.Opcoes("genero-artista", False), repr(texto))

    def test_le_do_disco_e_tolera_arquivo_ausente(self):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = pathlib.Path(pasta) / "pastas.json"
            caminho.write_text('{"subgenero": {"disco": true}}', encoding="utf-8")
            self.assertEqual(pastas.ler_opcoes(str(caminho)), pastas.Opcoes("genero-artista", True))
            self.assertEqual(pastas.ler_opcoes(str(caminho.with_name("nao-existe.json"))), pastas.Opcoes("genero-artista", False))


class Resolvedor(unittest.TestCase):
    def assertResolve(self, generos, esperado, beatport=None):
        self.assertEqual(pastas.resolver_genero_e_subgenero(generos, beatport), esperado, repr((generos, beatport)))

    def test_beatport_vence_a_tag(self):
        self.assertResolve("Techno", ("Hard Dance", "Neo Rave"), ("Hard Dance / Hardcore / Neo Rave", "Neo Rave"))
        self.assertResolve(None, ("Trance", "Tech Trance"), ("Trance (Main Floor)", "Tech Trance"))

    def test_subgenero_do_beatport_vence_o_qualificador_do_genero(self):
        self.assertResolve("", ("Techno", "Psy-Techno"), ("Techno (Peak Time / Driving)", "Psy-Techno"))
        self.assertResolve("", ("Techno", "Peak Time - Driving"), ("Techno (Peak Time / Driving)", None))
        self.assertResolve("", ("Techno", "Raw - Deep - Hypnotic"), ("Techno (Raw / Deep / Hypnotic)", None))
        self.assertResolve("", ("Trance", "Main Floor"), ("Trance (Main Floor)", None))
        self.assertResolve("", ("Trance", "Raw - Deep - Hypnotic"), ("Trance (Raw / Deep / Hypnotic)", ""))

    def test_pasta_curta_dos_generos_do_beatport(self):
        self.assertResolve("", ("Minimal", "Deep Tech"), ("Minimal / Deep Tech", "Deep Tech"))
        self.assertResolve("", ("Hard Techno", pastas.SEM_SUBGENERO), ("Hard Techno", None))
        self.assertResolve("", ("Psy-Trance", pastas.SEM_SUBGENERO), ("psytrance", None))  # a chave ignora a grafia
        self.assertResolve("", ("Melodic House & Techno", "Melodic Techno"), ("Melodic House & Techno", "Melodic Techno"))

    def test_barra_do_subgenero_vira_hifen(self):
        self.assertResolve("", ("Techno", "Deep - Hypnotic"), ("Techno (Raw / Deep / Hypnotic)", "Deep / Hypnotic"))
        self.assertResolve("", ("Hard Dance", "UK - Happy Hardcore"), ("Hard Dance / Hardcore / Neo Rave", "UK / Happy Hardcore"))

    def test_nome_do_beatport_fora_da_tabela_nunca_vira_pasta(self):
        for genero, sub in [
            ("..", None),
            ("a/b", None),
            ("../../etc", "passwd"),
            ("Techno\\..\\x", None),
            ("Gênero Inventado", "Qualquer"),
            ("", "Peak Time"),
            (None, None),
            (42, "x"),
        ]:
            resultado = pastas.resolver_genero_e_subgenero("Techno", (genero, sub))
            self.assertEqual(resultado, ("Techno", pastas.SEM_SUBGENERO), repr((genero, sub)))

    def test_subgenero_do_beatport_fora_da_tabela_e_ignorado(self):
        self.assertResolve("", ("Techno", "Peak Time - Driving"), ("Techno (Peak Time / Driving)", "../../x"))
        self.assertResolve("", ("Hard Techno", pastas.SEM_SUBGENERO), ("Hard Techno", "a/b"))
        # sub-gênero de outro gênero não serve
        self.assertResolve("", ("Hard Techno", pastas.SEM_SUBGENERO), ("Hard Techno", "Peak Time"))

    def test_beatport_desconhecido_cai_na_tag(self):
        self.assertResolve("Techno (Peak Time / Driving)", ("Techno", "Peak Time - Driving"), ("Coisa Nova", "Outra"))

    def test_tag_com_qualificador_entre_parenteses(self):
        self.assertResolve("Techno (Peak Time / Driving)", ("Techno", "Peak Time - Driving"))
        self.assertResolve("Techno (Peak Time _ Driving)", ("Techno", "Peak Time - Driving"))
        self.assertResolve("Techno (Raw / Deep / Hypnotic)", ("Techno", "Raw - Deep - Hypnotic"))
        self.assertResolve("Trance (Main Floor)", ("Trance", "Main Floor"))
        self.assertResolve(["Trance (Raw / Deep / Hypnotic)"], ("Trance", "Raw - Deep - Hypnotic"))

    def test_qualificador_nao_serve_para_outra_familia(self):
        self.assertResolve("Trance (Peak Time / Driving)", ("Trance", pastas.SEM_SUBGENERO))
        self.assertResolve("Techno (Hard)", ("Techno", pastas.SEM_SUBGENERO))

    def test_aliases_de_texto(self):
        self.assertResolve("Peak Time Techno", ("Techno", "Peak Time"))
        self.assertResolve("peak-time techno", ("Techno", "Peak Time"))
        self.assertResolve("Minimal Techno", ("Minimal", pastas.SEM_SUBGENERO))
        self.assertResolve("Melodic Techno", ("Melodic House & Techno", "Melodic Techno"))
        self.assertResolve("Tech Trance", ("Trance", "Tech Trance"))
        self.assertResolve("Hard Trance", ("Trance", "Hard Trance"))
        self.assertResolve("Psytrance", ("Psy-Trance", pastas.SEM_SUBGENERO))

    def test_alias_na_segunda_posicao_da_lista_do_musicbrainz(self):
        self.assertResolve(["techno", "peak time techno"], ("Techno", "Peak Time"))
        self.assertResolve(["house", "peak time techno"], ("House", pastas.SEM_SUBGENERO))  # outro gênero: não vale

    def test_sem_subgenero(self):
        self.assertResolve("Techno", ("Techno", pastas.SEM_SUBGENERO))
        self.assertResolve("Hard Techno", ("Hard Techno", pastas.SEM_SUBGENERO))
        self.assertResolve("crust punk", ("Crust Punk", pastas.SEM_SUBGENERO))
        self.assertResolve(None, (pastas.SEM_GENERO, pastas.SEM_SUBGENERO))
        self.assertResolve("djsoundtop.com", (pastas.SEM_GENERO, pastas.SEM_SUBGENERO))
        self.assertEqual(pastas.SEM_SUBGENERO, "_Sem Subgenero")

    def test_genero_da_pasta_nao_mudou(self):
        # o resolvedor não interfere no caminho de quem não liga nada
        self.assertEqual(pastas.genero_da_pasta("Techno (Peak Time / Driving)"), "Techno")
        self.assertEqual(pastas.genero_da_pasta("Peak Time Techno"), "Peak Time Techno")

    def test_taxonomia_ausente_ou_ilegivel_so_deixa_sem_subgenero(self):
        with tempfile.TemporaryDirectory() as pasta:
            ruim = pathlib.Path(pasta) / "ruim.json"
            ruim.write_text("{ nao e json", encoding="utf-8")
            for caminho in [str(pathlib.Path(pasta) / "nao-existe.json"), str(ruim)]:
                taxonomia = pastas.carregar_taxonomia(caminho)
                r = pastas.resolver_genero_e_subgenero(
                    "Techno (Peak Time / Driving)", ("Hard Dance / Hardcore / Neo Rave", "Neo Rave"), taxonomia=taxonomia
                )
                self.assertEqual(r, ("Techno", pastas.SEM_SUBGENERO))

    def test_entradas_estragadas_da_taxonomia_sao_ignoradas(self):
        taxonomia = pastas.Taxonomia(
            {
                "generos": [
                    {"nome": "Bom", "pasta": "Bom", "qualificador": None, "subgeneros": ["Ok", "../x", "a:b"]},
                    {"nome": "Mau", "pasta": "../fora"},
                    {"pasta": "Sem Nome"},
                    "texto",
                ],
                "aliases": [
                    {"texto": "alias", "genero": "Bom", "subgenero": "Ok"},
                    {"texto": "ruim", "genero": "a/../b", "subgenero": None},
                    {"texto": "x", "genero": "Bom", "subgenero": ".."},
                ],
            }
        )
        self.assertEqual(list(taxonomia.generos), ["bom"])
        self.assertEqual(list(taxonomia.generos["bom"].subgeneros.values()), ["Ok"])
        self.assertEqual(list(taxonomia.aliases), ["alias"])


class TabelaDaTaxonomia(unittest.TestCase):
    """O beatport-generos.json inteiro: todo nome que sai dele serve de nome de pasta."""

    ARQUIVO = RAIZ / "soulbeet" / "beets-plugins" / "beatport-generos.json"
    INSEGUROS = re.compile(r'[<>:"?*|\\/\x00-\x1f]')

    @classmethod
    def setUpClass(cls):
        cls.dados = json.loads(cls.ARQUIVO.read_text(encoding="utf-8"))

    def test_tem_leiame_e_os_generos_do_apendice_a(self):
        self.assertTrue(self.dados["_leiame"])
        nomes = {g["nome"] for g in self.dados["generos"]}
        for esperado in [
            "Hard Techno", "Psy-Trance", "Melodic House & Techno", "Minimal / Deep Tech", "Hard Dance / Hardcore / Neo Rave",
            "Techno (Peak Time / Driving)", "Techno (Raw / Deep / Hypnotic)", "Trance (Main Floor)",
            "Trance (Raw / Deep / Hypnotic)", "UK Garage / Bassline", "Drum & Bass", "Hip-Hop",
        ]:
            self.assertIn(esperado, nomes)

    def test_nenhuma_entrada_foi_descartada_ao_carregar(self):
        taxonomia = pastas.TAXONOMIA_PADRAO
        self.assertEqual(len(taxonomia.generos), len(self.dados["generos"]))
        self.assertEqual(len(taxonomia.aliases), len(self.dados["aliases"]))
        for entrada in self.dados["generos"]:
            carregada = taxonomia.generos[pastas.chave_do_genero(entrada["nome"])]
            self.assertEqual(len(carregada.subgeneros), len(entrada["subgeneros"]), entrada["nome"])

    def test_todo_nome_de_pasta_e_seguro(self):
        nomes = []
        for entrada in pastas.TAXONOMIA_PADRAO.generos.values():
            nomes += [entrada.pasta, *entrada.subgeneros.values()]
            if entrada.qualificador:
                nomes.append(entrada.qualificador)
        for pasta, subgenero in pastas.TAXONOMIA_PADRAO.aliases.values():
            nomes += [pasta] + ([subgenero] if subgenero else [])
        self.assertGreater(len(nomes), 150)
        for nome in nomes:
            self.assertIsNone(self.INSEGUROS.search(nome), nome)
            self.assertNotIn("..", nome)
            self.assertEqual(nome, nome.strip(" ."), nome)
            self.assertEqual(pastas.nome_de_pasta_seguro(nome), nome)

    def test_familias_divididas(self):
        com_qualificador = {(g["pasta"], g["qualificador"]) for g in self.dados["generos"] if g["qualificador"]}
        self.assertEqual(
            com_qualificador,
            {("Techno", "Peak Time - Driving"), ("Techno", "Raw - Deep - Hypnotic"), ("Trance", "Main Floor"), ("Trance", "Raw - Deep - Hypnotic")},
        )

    def test_pastas_curtas_do_item_2_do_adr(self):
        pasta = {g["nome"]: g["pasta"] for g in self.dados["generos"]}
        self.assertEqual(pasta["Techno (Peak Time / Driving)"], "Techno")
        self.assertEqual(pasta["Techno (Raw / Deep / Hypnotic)"], "Techno")
        self.assertEqual(pasta["Trance (Main Floor)"], "Trance")
        self.assertEqual(pasta["Trance (Raw / Deep / Hypnotic)"], "Trance")
        self.assertEqual(pasta["Hard Dance / Hardcore / Neo Rave"], "Hard Dance")
        self.assertEqual(pasta["Minimal / Deep Tech"], "Minimal")
        self.assertEqual(pasta["Hard Techno"], "Hard Techno")
        self.assertEqual(pasta["Bass / Club"], "Bass - Club")

    def test_resolver_cada_subgenero_da_tabela_devolve_nome_seguro_e_sem_barra(self):
        for entrada in self.dados["generos"]:
            for sub in entrada["subgeneros"]:
                pasta, subgenero = pastas.resolver_genero_e_subgenero("", (entrada["nome"], sub))
                self.assertNotIn("/", pasta + subgenero)
                self.assertEqual(subgenero, pastas.nome_de_pasta_seguro(sub), sub)
            pasta, subgenero = pastas.resolver_genero_e_subgenero("", (entrada["nome"], None))
            self.assertEqual(subgenero, entrada["qualificador"] or pastas.SEM_SUBGENERO)

    def test_aliases_apontam_para_generos_e_subgeneros_da_tabela(self):
        validos = {}
        for entrada in self.dados["generos"]:
            nomes = {pastas.nome_de_pasta_seguro(s) for s in entrada["subgeneros"]}
            if entrada["qualificador"]:
                nomes.add(entrada["qualificador"])
            validos.setdefault(entrada["pasta"], set()).update(nomes)
        for alias in self.dados["aliases"]:
            pasta = pastas.nome_de_pasta_seguro(alias["genero"])
            self.assertIn(pasta, validos, alias["texto"])
            if alias["subgenero"]:
                self.assertIn(alias["subgenero"], validos[pasta], alias["texto"])


class CamposDoPlugin(unittest.TestCase):
    """O plugin montado com o beets falso: os campos de template e o estágio de importação."""

    def montar(self, opcoes=None, ambiente=None):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = pathlib.Path(pasta) / "pastas.json"
            if opcoes is not None:
                caminho.write_text(json.dumps(opcoes), encoding="utf-8")
            with mock.patch.object(pastas, "ARQUIVO_DA_ORGANIZACAO", str(caminho)), mock.patch.dict(
                "os.environ", ambiente or {}, clear=True
            ):
                return pastas.PastasPlugin()

    def item(self, **campos):
        return _beets_falso.ItemFalso(**campos)

    def test_sem_nada_novo_o_caminho_e_o_de_hoje(self):
        campos = self.montar().template_fields
        item = self.item(genres=["Techno (Peak Time / Driving)"], subgenero_resolvido="Peak Time - Driving", artist="KUKO, NEUF")
        self.assertEqual(campos["genero_pasta"](item), "Techno")
        self.assertEqual(campos["subgenero_pasta"](item), "")
        self.assertEqual(campos["artista_pasta"](item), "KUKO")
        self.assertEqual(campos["organizar_por_artista"](item), "1")
        # nem o alias muda o gênero com o subgênero desligado
        self.assertEqual(campos["genero_pasta"](self.item(genres="Peak Time Techno")), "Peak Time Techno")

    def test_subgenero_ligado(self):
        campos = self.montar({"disco": "genero", "subgenero": {"disco": True}}).template_fields
        self.assertEqual(campos["organizar_por_artista"](self.item()), "0")
        self.assertEqual(campos["subgenero_pasta"](self.item(subgenero_resolvido="Neo Rave")), "Neo Rave")
        self.assertEqual(campos["subgenero_pasta"](self.item()), "_Sem Subgenero")
        self.assertEqual(campos["subgenero_pasta"](self.item(subgenero_resolvido="")), "_Sem Subgenero")
        self.assertEqual(campos["genero_pasta"](self.item(genres="Peak Time Techno")), "Techno")

    def test_conta_conectada_usa_o_beatport_guardado(self):
        conta = {"BEATPORT_USERNAME": "usuario-de-teste", "BEATPORT_PASSWORD": "senha-de-teste"}
        item = self.item(genres="Techno", beatport_genero="Hard Dance / Hardcore / Neo Rave", beatport_subgenero="Neo Rave")
        self.assertEqual(self.montar(ambiente=conta).template_fields["genero_pasta"](item), "Hard Dance")
        # sem conta, o que está guardado não vale
        self.assertEqual(self.montar().template_fields["genero_pasta"](item), "Techno")
        # a conta precisa dos dois
        self.assertFalse(pastas.conta_conectada({"BEATPORT_USERNAME": "u", "BEATPORT_PASSWORD": ""}))
        self.assertFalse(pastas.conta_conectada({"BEATPORT_USERNAME": " ", "BEATPORT_PASSWORD": "s"}))
        self.assertTrue(pastas.conta_conectada({"BEATPORT_USERNAME": "u", "BEATPORT_PASSWORD": "s"}))

    def test_estagio_grava_o_subgenero_no_banco_sem_conta(self):
        plugin = self.montar()
        item = self.item(genres=["Techno (Raw / Deep / Hypnotic)"], artist="A", title="T")
        plugin.import_stages[0](None, _beets_falso.TarefaFalsa([item]))
        self.assertEqual(item["subgenero_resolvido"], "Raw - Deep - Hypnotic")
        self.assertEqual(item.gravacoes, 1)
        self.assertFalse([c for c in item if c.startswith("beatport_")])  # sem conta, nada do Beatport

    def test_config_roda_o_pastas_depois_do_lastgenre(self):
        texto = (RAIZ / "soulbeet" / "config" / "config.yaml").read_text(encoding="utf-8")
        plugins = re.search(r"^plugins:\n((?:  .*\n)+)", texto, re.M).group(1)
        nomes = [linha.split()[1] for linha in plugins.splitlines() if linha.startswith("  - ")]
        self.assertLess(nomes.index("lastgenre"), nomes.index("pastas"))

    def test_paths_do_config_usam_o_subgenero(self):
        texto = (RAIZ / "soulbeet" / "config" / "config.yaml").read_text(encoding="utf-8")
        self.assertEqual(texto.count("'$genero_pasta/%if{$subgenero_pasta,$subgenero_pasta/}"), 3)


if __name__ == "__main__":
    unittest.main()
