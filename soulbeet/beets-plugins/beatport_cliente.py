"""beatport_cliente — consulta o gênero e o sub-gênero de uma faixa no Beatport (API v4).

Só biblioteca padrão: a imagem do Soulbeet é distroless e não recebe pacote pip por isso.
O nome do módulo não é `beatport.py` de propósito: os plugins do `pluginpath` são carregados
no pacote `beetsplug`, onde o beets já tem o seu `beetsplug.beatport`. O `pastas.py` carrega
este arquivo pelo caminho (importlib).

O Beatport não tem API aberta: o acesso é o contorno do plugin beets-beatport4 (client ID
público da documentação, mais usuário e senha da conta de quem usa). Não há acesso
oficial; se o Beatport mudar o fluxo, tudo aqui falha de forma explícita (`ErroBeatport`)
e o plugin cai nas regras locais. Veja o ADR 0007.

Fluxo (conferido contra o beets-beatport4 e o spike de 2026-11-24):
  1. GET  <base>/docs/                          -> scripts; o client ID está em `API_CLIENT_ID: '...'`
  2. POST <base>/auth/login/                    -> JSON {"username","password"}; cookie de sessão
  3. GET  <base>/auth/o/authorize/?client_id=..&response_type=code&redirect_uri=..
          sem seguir o redirecionamento; o código vem em `code=` no cabeçalho Location
          (o servidor manda `location` em minúsculas: a leitura não diferencia a caixa)
  4. POST <base>/auth/o/token/?code=..&grant_type=authorization_code&redirect_uri=..&client_id=..
          -> JSON {"access_token","expires_in","refresh_token"}
  5. GET  <base>/catalog/search?q=..&type=tracks&per_page=5  (Authorization: Bearer)
          -> {"tracks": [{"id","name","mix_name","artists":[{"name"}],"genre":{"name"},"sub_genre":{"name"}|null}]}

Suposições (não deu para chamar o Beatport de verdade nesta etapa; o parse é tolerante):
  - o refresh usa o mesmo endpoint de token com grant_type=refresh_token e `refresh_token`
    (parâmetros na query, como no passo 4); se falhar, faz o login completo;
  - a lista de resultados pode vir em "tracks" ou em "results";
  - genre e sub_genre são objetos com "name" (ou o próprio texto).

Segurança: usuário, senha, token, refresh_token, client ID e cookies nunca vão para log nem para
mensagem de erro; `ErroBeatport` carrega só um código e, quando há, o status HTTP.
"""

import hashlib
import http.client
import http.cookiejar
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import namedtuple

BASE_DA_API = "https://api.beatport.com/v4"
ARQUIVO_DO_TOKEN = "/data/beatport-token.json"
USER_AGENT = "soulcrate"
TEMPO_LIMITE = 15  # segundos por chamada: se o Beatport demorar, a faixa segue sem ele
PAUSA_MINIMA = 1.0  # segundos entre duas buscas
RESULTADOS_POR_BUSCA = 5
MARGEM_DO_TOKEN = 30  # segundos: renova um pouco antes de expirar
FALHAS_SEGUIDAS_PARA_FREAR = 3  # rede fora do ar: não vale esperar 15 s a cada faixa
LIMITE_DE_CORPO = 5_000_000

# códigos que a linha `soulcrate-beatport: <codigo>` do beatport-testar usa
SEM_CONTA = "sem-conta"
LOGIN_RECUSADO = "login-recusado"
VERIFICACAO = "verificacao"
LIMITE = "limite"
FLUXO_MUDOU = "fluxo-mudou"
FORA_DO_AR = "fora-do-ar"
_CODIGOS_DE_FREIO = (LOGIN_RECUSADO, VERIFICACAO, LIMITE)
CODIGOS = (SEM_CONTA, LOGIN_RECUSADO, VERIFICACAO, LIMITE, FLUXO_MUDOU, FORA_DO_AR)

EXATA = "exata"
APROXIMADA = "aproximada"
NAO_ENCONTRADA = "nao-encontrada"

Resultado = namedtuple("Resultado", "situacao id genero subgenero")

_SCRIPT = re.compile(r"""src\s*=\s*["']([^"']+\.js[^"']*)["']""")
_CLIENT_ID = re.compile(r"""API_CLIENT_ID\s*[:=]\s*['"]([^'"]+)['"]""")
_PALAVRAS_DE_MIX = r"mix|remix|dub|edit|rework|re-edit|version|vip|instrumental|bootleg|remaster(?:ed)?"
_MIX_ENTRE_PARENTESES = re.compile(r"\s*[\(\[]([^\(\)\[\]]*\b(?:%s)\b[^\(\)\[\]]*)[\)\]]\s*$" % _PALAVRAS_DE_MIX, re.I)
_MIX_COM_HIFEN = re.compile(r"\s+-\s+([^-]*\b(?:%s)\b[^-]*)$" % _PALAVRAS_DE_MIX, re.I)
_SEPARADORES_DE_ARTISTA = re.compile(r"\s*[,;]\s*|\s+/\s+|\s+(?:feat\.?|ft\.?|featuring|vs\.?|x)\s+", re.I)


class ErroBeatport(Exception):
    """Falha ao falar com o Beatport. `codigo` é um dos códigos acima; `status` é o HTTP, se houve."""

    def __init__(self, codigo, status=None):
        super().__init__(codigo if status is None else "%s (HTTP %s)" % (codigo, status))
        self.codigo = codigo
        self.status = status


# ------------------------------------------------------------------ texto e casamento


def chave_do_texto(texto):
    """Compara nomes sem acento, caixa nem pontuação: "Azyr & Co." -> "azyrandco"."""
    sem_acento = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", sem_acento.lower().replace("&", "and"))


def separar_mix(titulo):
    """"No Escape (Extended Mix)" -> ("No Escape", "Extended Mix"); sem mix no fim -> (título, None)."""
    titulo = (titulo or "").strip()
    achou = _MIX_ENTRE_PARENTESES.search(titulo) or _MIX_COM_HIFEN.search(titulo)
    if not achou:
        return titulo, None
    return titulo[: achou.start()].strip(), achou.group(1).strip()


def _artistas_da_biblioteca(artista, artistas):
    nomes = [str(a) for a in (artistas or []) if a]
    if artista:
        nomes.append(str(artista))
        nomes.extend(p for p in _SEPARADORES_DE_ARTISTA.split(str(artista)) if p.strip())
    return {chave_do_texto(n) for n in nomes if chave_do_texto(n)}


def _nome(valor):
    """O nome de um objeto do Beatport ({"name": ...}) ou o próprio texto; None se não houver."""
    if isinstance(valor, dict):
        valor = valor.get("name")
    if isinstance(valor, str) and valor.strip():
        return valor.strip()
    return None


def classificar_casamento(artista, titulo, faixas, artistas=None):
    """Escolhe o melhor resultado entre os da busca.

    exata: artista confere e o mix do título confere; aproximada: artista e título conferem, mas o mix
    difere ou a biblioteca não tem mix (o gênero quase nunca muda entre mixes); senão, nao-encontrada.
    """
    base, mix = separar_mix(titulo)
    quer_base, quer_mix = chave_do_texto(base), chave_do_texto(mix)
    quem = _artistas_da_biblioteca(artista, artistas)
    melhor = None
    for faixa in faixas or []:
        if not isinstance(faixa, dict):
            continue
        nome_da_faixa = _nome(faixa.get("name"))
        if not nome_da_faixa:
            continue
        nomes = [n for n in (_nome(a) for a in faixa.get("artists") or []) if n]
        chaves = {chave_do_texto(n) for n in nomes}
        if nomes:
            chaves.add(chave_do_texto("".join(nomes)))
        if not (quem & chaves):
            continue
        # o título pode vir sem o mix (o mix fica em mix_name) ou com ele no próprio nome
        base_da_faixa, mix_no_nome = separar_mix(nome_da_faixa)
        if chave_do_texto(base_da_faixa) != quer_base:
            continue
        mix_da_faixa = chave_do_texto(_nome(faixa.get("mix_name")) or mix_no_nome)
        situacao = EXATA if (quer_mix and quer_mix == mix_da_faixa) else APROXIMADA
        candidato = Resultado(
            situacao,
            str(faixa.get("id") or ""),
            _nome(faixa.get("genre")),
            _nome(faixa.get("sub_genre") or faixa.get("subGenre")),
        )
        if situacao == EXATA:
            return candidato
        melhor = melhor or candidato
    return melhor or Resultado(NAO_ENCONTRADA, "", None, None)


def _cabecalho(cabecalhos, nome):
    """Valor de um cabeçalho sem diferenciar a caixa (o Beatport manda `location` em minúsculas)."""
    itens = cabecalhos.items() if hasattr(cabecalhos, "items") else cabecalhos
    for chave, valor in itens:
        if str(chave).lower() == nome.lower():
            return valor
    return None


class _SemRedirecionamento(urllib.request.HTTPRedirectHandler):
    """Devolve o 3xx como resposta: o código de autorização está no cabeçalho Location."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ClienteBeatport:
    def __init__(
        self,
        usuario,
        senha,
        base=BASE_DA_API,
        arquivo_do_token=ARQUIVO_DO_TOKEN,
        relogio=time.time,
        pausar=time.sleep,
        pausa_minima=PAUSA_MINIMA,
        tempo_limite=TEMPO_LIMITE,
    ):
        self._usuario = usuario
        self._senha = senha
        self._base = base.rstrip("/")
        self._arquivo_do_token = arquivo_do_token
        self._relogio = relogio
        self._pausar = pausar
        self._pausa_minima = pausa_minima
        self._tempo_limite = tempo_limite
        self._quem = hashlib.sha256(str(usuario).encode("utf-8")).hexdigest()[:16]
        self._token = None  # {"access_token","refresh_token","expira_em","client_id","quem"}
        self._ultima_busca = None
        self._falhas_seguidas = 0
        self.freio = None  # código que ligou o freio; vale até o fim do processo

    # ------------------------------------------------------------------ http

    def _abrir(self, metodo, url, corpo=None, cabecalhos=None, cookies=None):
        """(status, cabeçalhos, corpo em bytes). Erros de rede viram ErroBeatport(fora-do-ar)."""
        pedido = urllib.request.Request(url, data=corpo, method=metodo)
        pedido.add_header("User-Agent", USER_AGENT)
        for nome, valor in (cabecalhos or {}).items():
            pedido.add_header(nome, valor)
        abridor = urllib.request.build_opener(
            _SemRedirecionamento(), urllib.request.HTTPCookieProcessor(cookies if cookies is not None else http.cookiejar.CookieJar())
        )
        try:
            with abridor.open(pedido, timeout=self._tempo_limite) as resposta:
                return resposta.status, resposta.headers, resposta.read(LIMITE_DE_CORPO)
        except urllib.error.HTTPError as erro:
            try:
                dados = erro.read(LIMITE_DE_CORPO)
            except OSError:
                dados = b""
            finally:
                erro.close()
            return erro.code, erro.headers, dados
        except (OSError, ValueError, http.client.HTTPException):
            # URLError, timeout, conexão recusada, resposta truncada
            raise ErroBeatport(FORA_DO_AR) from None

    def _conferir(self, status):
        """Traduz o status HTTP: 403, 429 e 5xx viram erro; o resto volta para quem chamou decidir."""
        if status == 403:
            raise self._frear(VERIFICACAO, status)
        if status == 429:
            raise self._frear(LIMITE, status)
        if status >= 500:
            raise ErroBeatport(FORA_DO_AR, status)

    def _frear(self, codigo, status=None):
        self.freio = self.freio or codigo
        return ErroBeatport(codigo, status)

    def _json(self, dados):
        try:
            valor = json.loads(dados.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ErroBeatport(FLUXO_MUDOU) from None
        return valor

    # ------------------------------------------------------------ autenticação

    def _id_do_cliente(self):
        status, _, html = self._abrir("GET", self._base + "/docs/")
        self._conferir(status)
        if status != 200:
            raise ErroBeatport(FLUXO_MUDOU, status)
        texto = html.decode("utf-8", "replace")
        achados = _CLIENT_ID.findall(texto)
        for origem in _SCRIPT.findall(texto):
            if achados:
                break
            url = urllib.parse.urljoin(self._base + "/docs/", origem)
            try:
                status, _, js = self._abrir("GET", url)
            except ErroBeatport as erro:
                if erro.codigo in _CODIGOS_DE_FREIO:
                    raise
                continue
            if status == 200:
                achados = _CLIENT_ID.findall(js.decode("utf-8", "replace"))
        if not achados:
            raise ErroBeatport(FLUXO_MUDOU)
        return achados[0]

    def _url(self, caminho, consulta=None):
        return self._base + caminho + ("?" + urllib.parse.urlencode(consulta) if consulta else "")

    def _redirecionamento(self):
        return self._base + "/auth/o/post-message/"

    def _entrar(self):
        """Login completo (authorization_code). Guarda o token em memória e no arquivo."""
        id_do_cliente = self._id_do_cliente()
        cookies = http.cookiejar.CookieJar()
        corpo = json.dumps({"username": self._usuario, "password": self._senha}).encode("utf-8")
        status, _, dados = self._abrir(
            "POST", self._url("/auth/login/"), corpo, {"Content-Type": "application/json"}, cookies
        )
        self._conferir(status)
        if status in (400, 401):
            raise self._frear(LOGIN_RECUSADO, status)
        if not 200 <= status < 300:
            raise ErroBeatport(FLUXO_MUDOU, status)
        resposta = self._json(dados)
        if not isinstance(resposta, dict) or "username" not in resposta:
            # 200 com mensagem de erro no JSON: o Beatport recusou a conta
            raise self._frear(LOGIN_RECUSADO, status)

        consulta = {"client_id": id_do_cliente, "response_type": "code", "redirect_uri": self._redirecionamento()}
        status, cabecalhos, _ = self._abrir("GET", self._url("/auth/o/authorize/", consulta), cookies=cookies)
        self._conferir(status)
        destino = _cabecalho(cabecalhos, "Location")
        if not destino:
            raise ErroBeatport(FLUXO_MUDOU, status)
        codigos = urllib.parse.parse_qs(urllib.parse.urlparse(destino).query).get("code")
        if not codigos:
            raise ErroBeatport(FLUXO_MUDOU, status)

        consulta = {
            "code": codigos[0],
            "grant_type": "authorization_code",
            "redirect_uri": self._redirecionamento(),
            "client_id": id_do_cliente,
        }
        status, _, dados = self._abrir("POST", self._url("/auth/o/token/", consulta), b"", cookies=cookies)
        self._conferir(status)
        if status in (400, 401):
            raise self._frear(LOGIN_RECUSADO, status)
        if status != 200:
            raise ErroBeatport(FLUXO_MUDOU, status)
        self._guardar_token(self._json(dados), id_do_cliente)

    def _renovar(self):
        """Refresh do token. False quando não deu; quem chama faz o login completo."""
        token = self._token or {}
        if not token.get("refresh_token") or not token.get("client_id"):
            return False
        consulta = {
            "grant_type": "refresh_token",
            "refresh_token": token["refresh_token"],
            "client_id": token["client_id"],
        }
        status, _, dados = self._abrir("POST", self._url("/auth/o/token/", consulta), b"")
        self._conferir(status)
        if status != 200:
            return False
        try:
            self._guardar_token(self._json(dados), token["client_id"], token["refresh_token"])
        except ErroBeatport:
            return False
        return True

    def _guardar_token(self, dados, id_do_cliente, refresh_anterior=None):
        try:
            acesso = str(dados["access_token"])
            expira_em = self._relogio() + int(dados.get("expires_in") or 0)
        except (KeyError, TypeError, ValueError):
            raise ErroBeatport(FLUXO_MUDOU) from None
        self._token = {
            "access_token": acesso,
            "refresh_token": str(dados.get("refresh_token") or refresh_anterior or ""),
            "expira_em": expira_em,
            "client_id": id_do_cliente,
            "quem": self._quem,
        }
        self._gravar_arquivo()

    def _gravar_arquivo(self):
        """Cada `beet` é um processo novo: o token vai para o disco (0600) para não logar de novo."""
        try:
            pasta = os.path.dirname(self._arquivo_do_token)
            if pasta:
                os.makedirs(pasta, exist_ok=True)
            descritor = os.open(self._arquivo_do_token, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(descritor, "w", encoding="utf-8") as arquivo:
                json.dump(self._token, arquivo)
            os.chmod(self._arquivo_do_token, 0o600)
        except OSError:
            pass  # sem onde guardar: só perde o reaproveitamento

    def _ler_arquivo(self):
        try:
            with open(self._arquivo_do_token, encoding="utf-8") as arquivo:
                token = json.load(arquivo)
        except (OSError, ValueError):
            return None
        if not isinstance(token, dict) or token.get("quem") != self._quem or not token.get("access_token"):
            return None  # outra conta, ou arquivo estranho
        return token

    def _token_valido(self):
        if self._token is None:
            self._token = self._ler_arquivo()
        return bool(self._token) and self._relogio() + MARGEM_DO_TOKEN < float(self._token.get("expira_em") or 0)

    def _garantir_token(self):
        if self._token_valido():
            return
        if self._token and self._renovar():
            return
        self._entrar()

    # ------------------------------------------------------------------ busca

    def _respeitar_ritmo(self):
        agora = self._relogio()
        if self._ultima_busca is not None:
            espera = self._pausa_minima - (agora - self._ultima_busca)
            if espera > 0:
                self._pausar(espera)
        self._ultima_busca = self._relogio()

    def _pesquisar(self, consulta):
        """GET da busca já com o token; devolve (status, dados)."""
        url = self._url("/catalog/search", {"q": consulta, "type": "tracks", "per_page": RESULTADOS_POR_BUSCA})
        cabecalhos = {"Authorization": "Bearer " + self._token["access_token"], "Accept": "application/json"}
        status, _, dados = self._abrir("GET", url, cabecalhos=cabecalhos)
        return status, dados

    def _buscar_json(self, consulta):
        if self.freio:
            raise ErroBeatport(self.freio)
        try:
            self._garantir_token()
            self._respeitar_ritmo()
            status, dados = self._pesquisar(consulta)
            if status == 401:
                # o token pode ter sido revogado: um login novo, e uma segunda tentativa só
                self._token = None
                self._entrar()
                self._respeitar_ritmo()
                status, dados = self._pesquisar(consulta)
                if status == 401:
                    raise self._frear(LOGIN_RECUSADO, status)
            self._conferir(status)
            if status != 200:
                raise ErroBeatport(FLUXO_MUDOU, status)
            resposta = self._json(dados)
        except ErroBeatport as erro:
            if erro.codigo == FORA_DO_AR:
                self._falhas_seguidas += 1
                if self._falhas_seguidas >= FALHAS_SEGUIDAS_PARA_FREAR:
                    self.freio = self.freio or FORA_DO_AR
            raise
        self._falhas_seguidas = 0
        return resposta

    @staticmethod
    def _faixas(resposta):
        if not isinstance(resposta, dict):
            raise ErroBeatport(FLUXO_MUDOU)
        faixas = resposta.get("tracks", resposta.get("results"))
        if not isinstance(faixas, list):
            raise ErroBeatport(FLUXO_MUDOU)
        return faixas

    def buscar(self, artista, titulo, artistas=None):
        """Resultado do casamento. Levanta ErroBeatport se o Beatport não respondeu o esperado."""
        base, _ = separar_mix(titulo)
        consulta = ("%s %s" % (artista or "", base)).strip()
        faixas = self._faixas(self._buscar_json(consulta))
        return classificar_casamento(artista, titulo, faixas, artistas)

    def testar(self):
        """Login e uma busca de teste. Levanta ErroBeatport com o motivo se algo falhar."""
        self._faixas(self._buscar_json("techno"))

