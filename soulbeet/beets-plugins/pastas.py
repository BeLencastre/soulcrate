"""pastas — plugin beets que decide o nome das pastas de Gênero, Subgênero e Artista.

Problema: o caminho usava o gênero e o artista do jeito que vinham no arquivo.
  - Faixa em colaboração ("KUKO, 9inebro, NEUF") criava uma pasta só para ela,
    ao lado da pasta "KUKO".
  - O mesmo gênero escrito de vários jeitos virava várias pastas:
    "Hard Dance / Hardcore / Neo Rave", "Hard Dance;Hardcore;Neo Rave",
    "Psy-Trance" e "psytrance", "Techno (Peak Time / Driving)" e "Techno".

O plugin oferece estes campos para o `paths:` do config.yaml:
  $genero_pasta           o primeiro gênero, limpo e com a grafia canônica
                          ("_Sem Genero" quando não há gênero aproveitável)
  $subgenero_pasta        o subgênero resolvido da faixa ("_Sem Subgenero" quando não há), ou
                          vazio quando o nível de subgênero do disco está desligado
  $artista_pasta          o primeiro artista da faixa
  $albumartista_pasta     o primeiro artista do álbum
  $organizar_por_artista  "1" quando cada artista tem a sua pasta dentro do gênero,
                          "0" quando as faixas ficam direto na pasta do gênero

A organização é escolhida no app (Suas músicas → Organizar), que a grava em /data/pastas.json:
  {"disco": "genero-artista" | "genero", "rekordbox": ..., "subgenero": {"disco": bool, "rekordbox": bool}}
O plugin só usa "disco" e "subgenero.disco"; "rekordbox" é do app (a árvore de playlists do Rekordbox).
Sem o arquivo, com ele ilegível ou sem uma chave, valem os padrões: "genero-artista" e subgênero
desligado (o jeito de sempre). Contrato nos dois lados: app/src/shared/organizacao.ts.

Subgênero (ADR 0007). `resolver_genero_e_subgenero` decide (pasta de gênero, subgênero) em camadas:
  1. Beatport, se há conta conectada (BEATPORT_USERNAME e BEATPORT_PASSWORD no ambiente) e a faixa
     tem o resultado guardado; só vale nome que está em beatport-generos.json;
  2. a tag: gênero como sempre, mais o qualificador entre parênteses ("Techno (Peak Time / Driving)")
     e os aliases do beatport-generos.json ("Peak Time Techno");
  3. "_Sem Subgenero".
Na importação, um estágio consulta o Beatport (uma vez por faixa) e grava, no BANCO do beets e
nunca na tag, os campos flexíveis beatport_id, beatport_genero, beatport_subgenero,
beatport_situacao, beatport_em e subgenero_resolvido (este sempre, ligado o nível ou não: é o que
o Rekordbox lê). Os subcomandos `beet beatport-testar` e `beet beatport-classificar` são do app e
imprimem linhas `soulcrate-beatport: ...`. Uma falha do Beatport nunca impede a importação.

Só o nome da pasta muda: as tags do arquivo (gênero e artista) ficam como estão.
As regras são funções puras (sem beets) para poderem ser testadas sem o contêiner.
"""

import datetime
import importlib.util
import json
import os
import re
import sys
import unicodedata
from collections import namedtuple

from beets import ui
from beets.plugins import BeetsPlugin

SEM_GENERO = "_Sem Genero"
SEM_SUBGENERO = "_Sem Subgenero"

# O app grava a escolha aqui (soulbeet/data/pastas.json na pasta do Soulcrate). É dado do
# usuário: a atualização dos arquivos da stack não toca nele.
ARQUIVO_DA_ORGANIZACAO = "/data/pastas.json"
ORGANIZACAO_PADRAO = "genero-artista"
ORGANIZACOES = ("genero-artista", "genero")

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


_QUALIFICADOR = re.compile(r"[\(\[]([^\)\]]*)[\)\]]")


def _partes(generos, tabela):
    """Cada gênero aproveitável, na ordem: (parte limpa, texto do qualificador entre parênteses ou None)."""
    for texto in _como_lista(generos):
        achou = _QUALIFICADOR.search(texto)
        qualificador = achou.group(1) if achou else None
        sem_qualificador = _ENTRE_PARENTESES.sub("", texto)
        for parte in _SEPARADORES_DE_GENERO.split(sem_qualificador):
            parte = re.sub(r"\s+", " ", parte).strip(" .-'\"")
            if not parte or _PARECE_SITE.search(parte) or not chave_do_genero(parte):
                continue
            yield _separar_emenda(parte, tabela), qualificador
            qualificador = None  # o qualificador é do primeiro nome do texto


def _pasta_do_genero(parte, tabela):
    return tabela.get(chave_do_genero(parte), _grafia(parte))


def genero_da_pasta(generos, tabela=TABELA_PADRAO):
    """O nome da pasta de gênero: o primeiro gênero aproveitável, na grafia canônica."""
    for parte, _ in _partes(generos, tabela):
        return _pasta_do_genero(parte, tabela)
    return SEM_GENERO


# --- Taxonomia do Beatport (beatport-generos.json) ---------------------------------------

ARQUIVO_DA_TAXONOMIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "beatport-generos.json")

EntradaDeGenero = namedtuple("EntradaDeGenero", "pasta qualificador subgeneros")


def nome_de_pasta_seguro(texto):
    """O texto como nome de uma pasta só (a "/" vira " - "), ou None se não der para usar.

    Recusa o que o disco ou o pendrive (FAT32/exFAT) não aceitam e o que escaparia da pasta:
    "..", barras, `<>:"?*|`, controle, ponto ou espaço nas pontas.
    """
    if not isinstance(texto, str):
        return None
    partes = [p.strip() for p in texto.replace("\\", "/").split("/")]
    nome = " - ".join(partes)
    if not nome or any(not p for p in partes) or nome != nome.strip(" ."):
        return None
    if ".." in nome or re.search(r'[<>:"?*|\x00-\x1f]', nome):
        return None
    return nome


class Taxonomia:
    """Os gêneros do Beatport e os aliases de texto, indexados pela chave normalizada.

    Só o que está aqui vira nome de pasta: o que o Beatport devolve é entrada não confiável.
    """

    def __init__(self, dados=None):
        self.generos = {}  # chave do nome do Beatport -> EntradaDeGenero
        self.qualificadores = {}  # (pasta, chave do qualificador no nome) -> subgênero da família dividida
        self.aliases = {}  # chave do texto -> (pasta, subgênero ou None)
        if isinstance(dados, dict):
            for entrada in dados.get("generos") or []:
                self._adicionar_genero(entrada)
            for alias in dados.get("aliases") or []:
                self._adicionar_alias(alias)

    def _adicionar_genero(self, entrada):
        if not isinstance(entrada, dict) or not isinstance(entrada.get("nome"), str):
            return
        pasta = nome_de_pasta_seguro(entrada.get("pasta"))
        if pasta is None or not chave_do_genero(entrada["nome"]):
            return
        qualificador = nome_de_pasta_seguro(entrada.get("qualificador"))
        subgeneros = {}
        for nome in entrada.get("subgeneros") or []:
            seguro = nome_de_pasta_seguro(nome)
            if seguro is not None and chave_do_genero(nome):
                subgeneros[chave_do_genero(nome)] = seguro
        self.generos[chave_do_genero(entrada["nome"])] = EntradaDeGenero(pasta, qualificador, subgeneros)
        entre_parenteses = _QUALIFICADOR.search(entrada["nome"])
        if qualificador and entre_parenteses:
            self.qualificadores[(pasta, chave_do_genero(entre_parenteses.group(1)))] = qualificador

    def _adicionar_alias(self, alias):
        if not isinstance(alias, dict) or not isinstance(alias.get("texto"), str):
            return
        pasta = nome_de_pasta_seguro(alias.get("genero"))
        subgenero = alias.get("subgenero")
        subgenero = None if subgenero is None else nome_de_pasta_seguro(subgenero)
        if pasta is None or not chave_do_genero(alias["texto"]) or (alias.get("subgenero") is not None and subgenero is None):
            return
        self.aliases[chave_do_genero(alias["texto"])] = (pasta, subgenero)

    def conhece(self, genero_do_beatport):
        return isinstance(genero_do_beatport, str) and chave_do_genero(genero_do_beatport) in self.generos


def carregar_taxonomia(caminho=ARQUIVO_DA_TAXONOMIA):
    """A taxonomia do arquivo; vazia (só `_Sem Subgenero`) quando ele não existe ou está ilegível."""
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return Taxonomia(json.load(arquivo))
    except (OSError, ValueError):
        return Taxonomia()


TAXONOMIA_PADRAO = carregar_taxonomia()


def _do_beatport(beatport, taxonomia):
    """(pasta, subgênero) a partir do gênero e do sub-gênero do Beatport; None se o nome não é da tabela."""
    if not beatport:
        return None
    genero, subgenero = (list(beatport) + [None, None])[:2]
    if not isinstance(genero, str):
        return None
    entrada = taxonomia.generos.get(chave_do_genero(genero))
    if entrada is None:
        return None
    escolhido = entrada.subgeneros.get(chave_do_genero(subgenero)) if isinstance(subgenero, str) and subgenero else None
    return entrada.pasta, escolhido or entrada.qualificador or SEM_SUBGENERO


def _da_tag(generos, tabela, taxonomia):
    partes = list(_partes(generos, tabela))
    if not partes:
        return SEM_GENERO, SEM_SUBGENERO
    parte, qualificador = partes[0]
    alias = taxonomia.aliases.get(chave_do_genero(parte))
    pasta, subgenero = alias if alias else (_pasta_do_genero(parte, tabela), None)
    if subgenero is None and qualificador:
        subgenero = taxonomia.qualificadores.get((pasta, chave_do_genero(qualificador)))
    if subgenero is None:
        # a lista do MusicBrainz costuma trazer o gênero e depois o estilo: ["techno", "peak time techno"]
        for outra, _ in partes[1:]:
            do_alias = taxonomia.aliases.get(chave_do_genero(outra))
            if do_alias and do_alias[1] and do_alias[0] == pasta:
                subgenero = do_alias[1]
                break
    return pasta, subgenero or SEM_SUBGENERO


def resolver_genero_e_subgenero(generos_da_tag, beatport=None, tabela=TABELA_PADRAO, taxonomia=TAXONOMIA_PADRAO):
    """(pasta de gênero, subgênero), da primeira camada que responder: Beatport, tag, `_Sem Subgenero`.

    `beatport` é (gênero, sub-gênero) como o Beatport escreveu, ou None quando não há conta ou a faixa
    não foi encontrada. O sub-gênero do Beatport vale mais que o qualificador do gênero.
    """
    return _do_beatport(beatport, taxonomia) or _da_tag(generos_da_tag, tabela, taxonomia)


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


Opcoes = namedtuple("Opcoes", "organizacao subgenero_no_disco")
OPCOES_PADRAO = Opcoes(ORGANIZACAO_PADRAO, False)


def opcoes_do_texto(texto):
    """As escolhas do disco que o app grava; cada chave ausente ou inválida vale o padrão."""
    try:
        dados = json.loads(texto) if texto else None
    except ValueError:
        return OPCOES_PADRAO
    if not isinstance(dados, dict):
        return OPCOES_PADRAO
    organizacao = dados.get("disco")
    subgenero = dados.get("subgenero")
    ligado = subgenero.get("disco") if isinstance(subgenero, dict) else None
    return Opcoes(
        organizacao if organizacao in ORGANIZACOES else ORGANIZACAO_PADRAO,
        ligado is True,
    )


def organizacao_do_texto(texto):
    """A organização do disco gravada pelo app; o padrão quando o texto não existe ou não é o esperado."""
    return opcoes_do_texto(texto).organizacao


def ler_opcoes(caminho=ARQUIVO_DA_ORGANIZACAO):
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return opcoes_do_texto(arquivo.read())
    except OSError:
        return OPCOES_PADRAO


def ler_organizacao(caminho=ARQUIVO_DA_ORGANIZACAO):
    return ler_opcoes(caminho).organizacao


# --- Beatport: conta, campos guardados e o módulo do cliente -----------------------------

PREFIXO_DAS_LINHAS = "soulcrate-beatport: "
DIAS_ATE_CONSULTAR_DE_NOVO = 30  # `nao-encontrada` não se repete antes disso


def conta_conectada(ambiente=None):
    """True quando o usuário e a senha do Beatport estão preenchidos no ambiente (o `.env` do app)."""
    ambiente = os.environ if ambiente is None else ambiente
    return bool((ambiente.get("BEATPORT_USERNAME") or "").strip() and (ambiente.get("BEATPORT_PASSWORD") or "").strip())


def _modulo_do_cliente():
    """Carrega o beatport_cliente.py ao lado deste arquivo.

    Pelo caminho, e não por `import beatport`: os plugins do pluginpath vivem no pacote `beetsplug`,
    onde o beets já tem o seu `beetsplug.beatport`, e o nome colidiria.
    """
    nome = "soulcrate_beatport_cliente"
    if nome not in sys.modules:
        caminho = os.path.join(os.path.dirname(os.path.abspath(__file__)), "beatport_cliente.py")
        spec = importlib.util.spec_from_file_location(nome, caminho)
        modulo = importlib.util.module_from_spec(spec)
        sys.modules[nome] = modulo
        spec.loader.exec_module(modulo)
    return sys.modules[nome]


def beatport_do_item(item):
    """(gênero, sub-gênero) guardados na faixa, ou None quando o Beatport não a achou."""
    genero = item.get("beatport_genero")
    if not genero:
        return None
    return genero, item.get("beatport_subgenero") or None


def deve_consultar(item, hoje):
    """Falta consultar o Beatport: nunca consultada, ou `nao-encontrada` há 30 dias ou mais."""
    situacao = item.get("beatport_situacao")
    if not situacao:
        return True
    if situacao != "nao-encontrada":
        return False
    try:
        return (hoje - datetime.date.fromisoformat(str(item.get("beatport_em")))).days >= DIAS_ATE_CONSULTAR_DE_NOVO
    except ValueError:
        return True


def _linha(texto):
    """Uma linha para o app ler. Nunca leva usuário, senha, token, client ID nem cookie."""
    linha = PREFIXO_DAS_LINHAS + texto
    try:
        print(linha, flush=True)
    except UnicodeEncodeError:  # contêiner com locale ASCII
        print(linha.encode("ascii", "replace").decode("ascii"), flush=True)


class PastasPlugin(BeetsPlugin):
    def __init__(self):
        super().__init__()
        self.config.add({"apelidos": {}})
        self._tabela = montar_tabela(self.config["apelidos"].get(dict))
        self._taxonomia = TAXONOMIA_PADRAO
        # lido uma vez por comando: cada `beet` (do app ou do Soulbeet) é um processo novo
        opcoes = ler_opcoes(ARQUIVO_DA_ORGANIZACAO)
        self._por_artista = "1" if opcoes.organizacao == "genero-artista" else "0"
        self._subgenero_no_disco = opcoes.subgenero_no_disco
        self._conta = conta_conectada()
        self._cliente = None
        self._hoje = datetime.date.today
        self.template_fields["genero_pasta"] = self._genero
        self.template_fields["subgenero_pasta"] = self._subgenero
        self.template_fields["artista_pasta"] = self._artista
        self.template_fields["albumartista_pasta"] = self._albumartista
        self.template_fields["organizar_por_artista"] = lambda _item: self._por_artista
        # Os estágios rodam na ordem de `plugins:`: o config.yaml põe `pastas` depois do `lastgenre`,
        # para o resolvedor ver o gênero que ele preencheu.
        self.import_stages = [self._estagio_de_importacao]

    # ------------------------------------------------------------ campos de caminho

    def _generos_da_tag(self, item):
        # beets >= 2.11 guarda a lista em "genres"; "genre" é o campo antigo (texto).
        return item.get("genres") or item.get("genre")

    def _beatport(self, item):
        return beatport_do_item(item) if self._conta else None

    def _genero(self, item):
        beatport = self._beatport(item)
        if beatport is None and not self._subgenero_no_disco:
            # nada novo ligado: o caminho fica idêntico ao de sempre
            return genero_da_pasta(self._generos_da_tag(item), self._tabela)
        return resolver_genero_e_subgenero(self._generos_da_tag(item), beatport, self._tabela, self._taxonomia)[0]

    def _subgenero(self, item):
        if not self._subgenero_no_disco:
            return ""
        return item.get("subgenero_resolvido") or SEM_SUBGENERO

    def _artista(self, item):
        return primeiro_artista(item.get("artists"), item.get("artist"))

    def _albumartista(self, item):
        return primeiro_artista(item.get("albumartists"), item.get("albumartist") or item.get("artist"))

    # ------------------------------------------------------------ classificação

    def _obter_cliente(self):
        if self._cliente is None:
            modulo = _modulo_do_cliente()
            usuario = os.environ.get("BEATPORT_USERNAME", "").strip()
            self._cliente = modulo.ClienteBeatport(usuario, os.environ.get("BEATPORT_PASSWORD", ""))
        return self._cliente

    def _consultar(self, item):
        """Pergunta ao Beatport (se há conta, a faixa precisa e não há freio) e guarda a resposta no banco."""
        if not self._conta or not deve_consultar(item, self._hoje()):
            return
        cliente = self._obter_cliente()
        if getattr(cliente, "freio", None):
            return
        artista = primeiro_artista(item.get("artists"), item.get("artist"))
        artistas = [*_como_lista(item.get("artists")), *_como_lista(item.get("artist"))]
        try:
            resultado = cliente.buscar(artista, item.get("title") or "", artistas)
        except Exception as erro:  # nunca impede a importação; só o código, sem dados da conta
            self._log.warning("beatport: sem resposta ({}); vale a regra local", getattr(erro, "codigo", type(erro).__name__))
            return
        item["beatport_id"] = resultado.id or ""
        item["beatport_genero"] = resultado.genero or ""
        item["beatport_subgenero"] = resultado.subgenero or ""
        item["beatport_situacao"] = resultado.situacao
        item["beatport_em"] = self._hoje().isoformat()

    def _classificar(self, item):
        """Consulta o Beatport e grava `subgenero_resolvido` no banco, sem tocar na tag.

        Devolve (gênero, subgênero, se veio do Beatport).
        """
        self._consultar(item)
        beatport = self._beatport(item)
        genero, subgenero = resolver_genero_e_subgenero(self._generos_da_tag(item), beatport, self._tabela, self._taxonomia)
        item["subgenero_resolvido"] = subgenero
        item.store()
        return genero, subgenero, beatport is not None and self._taxonomia.conhece(beatport[0])

    def _estagio_de_importacao(self, session, task):
        for item in task.imported_items():
            try:
                self._classificar(item)
            except Exception as erro:
                self._log.warning("subgênero: não classificou uma faixa ({})", type(erro).__name__)

    # ------------------------------------------------------------ subcomandos

    def commands(self):
        testar = ui.Subcommand("beatport-testar", help="testa a conta do Beatport: login e uma busca")
        testar.func = self._testar
        classificar = ui.Subcommand(
            "beatport-classificar",
            help="grava o subgênero das faixas da biblioteca (Beatport, se há conta, e regras locais)",
        )
        classificar.func = self._classificar_biblioteca
        return [testar, classificar]

    def _testar(self, lib, opts, args):
        if not self._conta:
            _linha("sem-conta")
            return
        modulo = _modulo_do_cliente()
        try:
            self._obter_cliente().testar()
            codigo = "ok"
        except Exception as erro:
            codigo = getattr(erro, "codigo", None)
            if codigo not in modulo.CODIGOS:
                codigo = modulo.FLUXO_MUDOU
        _linha(codigo)

    def _precisa_de_classificacao(self, item):
        if not item.get("subgenero_resolvido"):
            return True
        return self._conta and deve_consultar(item, self._hoje())

    def _classificar_biblioteca(self, lib, opts, args):
        faltam = [item for item in lib.items() if self._precisa_de_classificacao(item)]
        _linha("total=%d conta=%d" % (len(faltam), 1 if self._conta else 0))
        pelo_beatport = sem_subgenero = 0
        for n, item in enumerate(faltam, 1):
            # grava faixa a faixa: interromper e rodar de novo continua de onde parou
            genero, subgenero, via_beatport = self._classificar(item)
            pelo_beatport += 1 if via_beatport else 0
            sem_subgenero += 1 if subgenero == SEM_SUBGENERO else 0
            _linha("%d/%d %s / %s" % (n, len(faltam), genero, subgenero))
        freio = 1 if getattr(self._cliente, "freio", None) else 0
        _linha(
            "fim classificadas=%d beatport=%d local=%d sem-subgenero=%d freio=%d"
            % (len(faltam), pelo_beatport, len(faltam) - pelo_beatport, sem_subgenero, freio)
        )
