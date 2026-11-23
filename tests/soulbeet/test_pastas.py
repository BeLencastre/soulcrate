"""Testes das regras do plugin pastas (soulbeet/beets-plugins/pastas.py).

Rodam sem o contêiner: o beets só existe dentro da imagem do Soulbeet, então um
`beets.plugins` falso basta para importar o módulo e testar as funções puras.

    python -m unittest discover -s tests/soulbeet -v
"""

import importlib.util
import pathlib
import sys
import types
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]


def _carregar_plugin():
    beets = types.ModuleType("beets")
    plugins = types.ModuleType("beets.plugins")
    plugins.BeetsPlugin = object
    beets.plugins = plugins
    sys.modules.setdefault("beets", beets)
    sys.modules.setdefault("beets.plugins", plugins)
    spec = importlib.util.spec_from_file_location("pastas", RAIZ / "soulbeet" / "beets-plugins" / "pastas.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


pastas = _carregar_plugin()


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
        import tempfile

        with tempfile.TemporaryDirectory() as pasta:
            caminho = pathlib.Path(pasta) / "pastas.json"
            caminho.write_text('{"disco": "genero"}', encoding="utf-8")
            self.assertEqual(pastas.ler_organizacao(str(caminho)), "genero")


if __name__ == "__main__":
    unittest.main()
