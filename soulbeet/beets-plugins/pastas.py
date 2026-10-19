"""pastas — plugin beets que decide o nome das pastas de Gênero e de Artista.

Problema: o caminho usava o gênero e o artista do jeito que vinham no arquivo.
  - Faixa em colaboração ("KUKO, 9inebro, NEUF") criava uma pasta só para ela,
    ao lado da pasta "KUKO".
  - O mesmo gênero escrito de vários jeitos virava várias pastas:
    "Hard Dance / Hardcore / Neo Rave", "Hard Dance;Hardcore;Neo Rave",
    "Psy-Trance" e "psytrance", "Techno (Peak Time / Driving)" e "Techno".

O plugin oferece três campos para o `paths:` do config.yaml:
  $genero_pasta        o primeiro gênero, limpo e com a grafia canônica
                       ("_Sem Genero" quando não há gênero aproveitável)
  $artista_pasta       o primeiro artista da faixa
  $albumartista_pasta  o primeiro artista do álbum

Só o nome da pasta muda: as tags do arquivo (gênero e artista) ficam como estão.
As regras são funções puras (sem beets) para poderem ser testadas sem o contêiner.
"""

import re
import unicodedata

from beets.plugins import BeetsPlugin

SEM_GENERO = "_Sem Genero"

# Grafia canônica dos gêneros mais comuns em música eletrônica (a do Beatport,
# quando ele tem o gênero), seguida das outras grafias que significam o mesmo.
# Grafias que só mudam em maiúsculas, espaço, hífen, sublinhado ou acento já
# caem juntas pela chave (veja `chave_do_genero`); aqui vão só as que mudam de fato.
GENEROS_CANONICOS = {
    "Acid House": [],
    "Acid Techno": [],
    "Afro House": [],
    "Alternative": [],
    "Ambient": [],
    "Bass House": [],
    "Breakbeat": ["Breaks"],
    "Dance": ["Dans", "Danse", "Tanz"],
    "Deep House": [],
    "Disco": [],
    "Downtempo": [],
    "Drum & Bass": ["Drum and Bass", "Drum n Bass", "Drum'n'Bass", "DnB", "D&B"],
    "Dubstep": [],
    "Electro": [],
    "Electronic": ["Électronique", "Elektronisch", "Electrónica", "Eletrônica"],
    "Electronica": [],
    "Gabber": ["Gabba"],
    "Hard Dance": [],
    "Hard House": [],
    "Hard Techno": [],
    "Hard Trance": [],
    "Hardcore": [],
    "Hardstyle": [],
    "Hip-Hop": ["Hip Hop", "Hiphop"],
    "House": [],
    "Indie Dance": [],
    "Industrial Techno": [],
    "Mainstage": [],
    "Melodic House & Techno": ["Melodic House and Techno"],
    "Melodic Techno": [],
    "Minimal": [],
    "Neo Rave": [],
    "Pop": [],
    "Progressive House": [],
    "Psy-Trance": ["Psytrance", "Psychedelic Trance"],
    "Rock": [],
    "Schranz": [],
    "Tech House": [],
    "Techno": [],
    "Trance": [],
    "UK Garage": ["UKG"],
}

# Separadores de uma lista de gêneros dentro de um único texto. O hífen sem
# espaço (Psy-Trance, Hip-Hop) e o "&" (Drum & Bass) fazem parte do nome.
_SEPARADORES_DE_GENERO = re.compile(r"\s*(?:[;,/|\\_]|\s-\s)\s*")
_ENTRE_PARENTESES = re.compile(r"\s*[\(\[][^\)\]]*[\)\]]")
# "djsoundtop.com", "https://site": o gênero foi preenchido com o site de onde o arquivo veio.
_PARECE_SITE = re.compile(r"https?|www\.|\.(?:com|net|org|info|ru|io|fm)\b", re.I)
_EMENDA_CAMEL = re.compile(r"(?<=[a-z])(?=[A-Z])")

# Separadores de artistas. "&" e "and" ficam de fora de propósito: "Above & Beyond",
# "Chase & Status", "Aly & Fila" são um artista só. A barra só separa com espaço dos
# dois lados ("AC/DC" é um artista).
_SEPARADORES_DE_ARTISTA = re.compile(
    r"\s*[,;]\s*|\s+/\s+"
    r"|\s+(?:feat\.?|ft\.?|featuring|vs\.?|x)\s+",
    re.I,
)
_PARTICIPACAO_ENTRE_PARENTESES = re.compile(r"\s*[\(\[]\s*(?:feat\.?|ft\.?|featuring|with)\s[^\)\]]*[\)\]]", re.I)


def chave_do_genero(nome):
    """Chave que junta grafias do mesmo gênero: "Psy-Trance", "psy trance" e "PSY TRANCE" -> "psytrance"."""
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii")
    sem_e_comercial = re.sub(r"\s*&\s*|\s+and\s+|\s+n\s+|'n'", " and ", sem_acento.lower())
    return re.sub(r"[^a-z0-9]", "", sem_e_comercial)


def montar_tabela(apelidos_extras=None):
    """chave -> nome canônico, com os gêneros padrão e os apelidos do config.yaml (`pastas.apelidos`)."""
    tabela = {}
    for canonico, apelidos in GENEROS_CANONICOS.items():
        for nome in [canonico, *apelidos]:
            tabela[chave_do_genero(nome)] = canonico
    for apelido, canonico in (apelidos_extras or {}).items():
        tabela[chave_do_genero(str(apelido))] = str(canonico)
        tabela.setdefault(chave_do_genero(str(canonico)), str(canonico))
    return tabela


TABELA_PADRAO = montar_tabela()


def _como_lista(valor):
    if valor is None:
        return []
    if isinstance(valor, str):
        return [valor]
    return [str(v) for v in valor if v is not None]


def _separar_emenda(parte, tabela):
    """"HardcoreHardstyleGabberHard Techno" -> "Hardcore", só quando o começo é um gênero conhecido."""
    pedacos = _EMENDA_CAMEL.split(parte)
    if len(pedacos) > 1 and chave_do_genero(pedacos[0]) in tabela:
        return pedacos[0]
    return parte


def _grafia(parte):
    """Gênero fora da tabela: só arruma maiúsculas de quem veio tudo minúsculo ou tudo maiúsculo."""
    if parte.islower() or (parte.isupper() and len(parte) > 4):
        return " ".join(p[:1].upper() + p[1:].lower() for p in parte.split(" "))
    return parte


def genero_da_pasta(generos, tabela=TABELA_PADRAO):
    """O nome da pasta de gênero: o primeiro gênero aproveitável, na grafia canônica."""
    for texto in _como_lista(generos):
        sem_qualificador = _ENTRE_PARENTESES.sub("", texto)
        for parte in _SEPARADORES_DE_GENERO.split(sem_qualificador):
            parte = re.sub(r"\s+", " ", parte).strip(" .-'\"")
            if not parte or _PARECE_SITE.search(parte) or not chave_do_genero(parte):
                continue
            parte = _separar_emenda(parte, tabela)
            return tabela.get(chave_do_genero(parte), _grafia(parte))
    return SEM_GENERO


def primeiro_artista(artistas, artista):
    """O primeiro artista: da lista do MusicBrainz quando ela tem mais de um, senão do texto da tag."""
    lista = [a.strip() for a in _como_lista(artistas) if a and a.strip()]
    if len(lista) > 1:
        # a lista já vem separada pelo MusicBrainz: "Tyler, The Creator" continua inteiro
        return lista[0]
    texto = lista[0] if lista else (artista or "")
    texto = _PARTICIPACAO_ENTRE_PARENTESES.sub("", texto)
    for parte in _SEPARADORES_DE_ARTISTA.split(texto):
        if parte.strip():
            return parte.strip()
    return (artista or "").strip()


class PastasPlugin(BeetsPlugin):
    def __init__(self):
        super().__init__()
        self.config.add({"apelidos": {}})
        self._tabela = montar_tabela(self.config["apelidos"].get(dict))
        self.template_fields["genero_pasta"] = self._genero
        self.template_fields["artista_pasta"] = self._artista
        self.template_fields["albumartista_pasta"] = self._albumartista

    def _genero(self, item):
        # beets >= 2.11 guarda a lista em "genres"; "genre" é o campo antigo (texto).
        return genero_da_pasta(item.get("genres") or item.get("genre"), self._tabela)

    def _artista(self, item):
        return primeiro_artista(item.get("artists"), item.get("artist"))

    def _albumartista(self, item):
        return primeiro_artista(item.get("albumartists"), item.get("albumartist") or item.get("artist"))
