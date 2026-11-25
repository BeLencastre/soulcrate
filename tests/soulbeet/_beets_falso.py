"""Um `beets` de brincadeira para testar os plugins sem o contêiner.

O beets só existe dentro da imagem do Soulbeet. Aqui ficam o suficiente dele para importar o
`pastas.py` e exercitar o plugin: `beets.plugins.BeetsPlugin`, `beets.ui.Subcommand`, um item e uma
biblioteca de brinquedo. Os testes dos dois arquivos (`test_pastas.py`, `test_beatport.py`) usam este.
"""

import importlib.util
import pathlib
import sys
import types

RAIZ = pathlib.Path(__file__).resolve().parents[2]
PLUGINS = RAIZ / "soulbeet" / "beets-plugins"


class _Visao:
    def __init__(self, valor):
        self._valor = valor

    def get(self, _tipo=None):
        return self._valor


class _Config:
    def __init__(self):
        self._dados = {}

    def add(self, padroes):
        for chave, valor in padroes.items():
            self._dados.setdefault(chave, valor)

    def __getitem__(self, chave):
        return _Visao(self._dados.get(chave))


class _Log:
    def __init__(self):
        self.avisos = []

    def warning(self, texto, *args):
        self.avisos.append(texto.format(*args))

    info = debug = warning


class BeetsPlugin:
    def __init__(self):
        self.config = _Config()
        self.template_fields = {}
        self.import_stages = []
        self._log = _Log()


class Subcommand:
    def __init__(self, nome, parser=None, help="", aliases=()):
        self.name = nome
        self.help = help
        self.func = None


class ItemFalso(dict):
    """Faixa de brinquedo: os campos são chaves; `store()` só conta quantas vezes gravou no banco."""

    def __init__(self, **campos):
        super().__init__(campos)
        self.gravacoes = 0

    def store(self):
        self.gravacoes += 1


class BibliotecaFalsa:
    def __init__(self, itens):
        self._itens = list(itens)

    def items(self, consulta=None):
        return list(self._itens)


class TarefaFalsa:
    def __init__(self, itens):
        self._itens = list(itens)

    def imported_items(self):
        return list(self._itens)


def instalar():
    """Põe o beets falso em sys.modules (se o beets de verdade não foi importado)."""
    if "beets" in sys.modules and not getattr(sys.modules["beets"], "_falso", False):
        return
    beets = types.ModuleType("beets")
    beets._falso = True
    plugins = types.ModuleType("beets.plugins")
    plugins.BeetsPlugin = BeetsPlugin
    ui = types.ModuleType("beets.ui")
    ui.Subcommand = Subcommand
    beets.plugins = plugins
    beets.ui = ui
    sys.modules["beets"] = beets
    sys.modules["beets.plugins"] = plugins
    sys.modules["beets.ui"] = ui


_PASTAS = None


def carregar_pastas():
    global _PASTAS
    if _PASTAS is None:
        instalar()
        spec = importlib.util.spec_from_file_location("pastas", PLUGINS / "pastas.py")
        _PASTAS = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_PASTAS)
    return _PASTAS
