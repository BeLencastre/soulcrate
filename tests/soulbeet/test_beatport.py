"""Testes do cliente do Beatport (soulbeet/beets-plugins/beatport_cliente.py) e dos subcomandos do pastas.

Sem rede real: um servidor HTTP falso (http.server, numa thread, porta 0) faz o papel do Beatport, com
respostas anonimizadas no formato da API v4. O usuário, a senha e os tokens daqui são inventados.

    python -m unittest discover -s tests/soulbeet -v
"""

import contextlib
import datetime
import io
import json
import os
import pathlib
import re
import stat
import tempfile
import threading
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

import _beets_falso

pastas = _beets_falso.carregar_pastas()
beatport = pastas._modulo_do_cliente()

USUARIO = "usuario-de-teste"
SENHA = "senha-de-teste"
ID_DO_CLIENTE = "id-publico-de-teste"
HOJE = datetime.date(2026, 11, 24)


def faixa(id_, nome, mix, artistas, genero, subgenero=None):
    return {
        "id": id_,
        "name": nome,
        "mix_name": mix,
        "artists": [{"id": 1, "name": a} for a in artistas],
        "genre": {"id": 90, "name": genero} if genero else None,
        "sub_genre": {"id": 91, "name": subgenero} if subgenero else None,
    }


PEAK_TIME = faixa(101, "No Escape", "Extended Mix", ["Azyr"], "Techno (Peak Time / Driving)", "Peak Time")
NEO_RAVE = faixa(303, "Rave Alert", "Original Mix", ["Kuko", "Neuf"], "Hard Dance / Hardcore / Neo Rave", "Neo Rave")
HARD_TECHNO = faixa(202, "Fire Walk", "Original Mix", ["Azyr"], "Hard Techno")


class ServidorFalso:
    """O Beatport de mentira. Os atributos escolhem o que ele responde; `requisicoes` guarda o que recebeu."""

    def __init__(self):
        self.requisicoes = []  # (método, caminho, consulta, cabeçalhos em minúsculas, corpo)
        self.docs_com_id = True
        self.login_status = 200
        self.login_corpo = {"username": USUARIO, "email": "anonimo@example.com"}
        self.authorize = "ok"  # ok | sem-location | sem-codigo
        self.nome_do_location = "location"  # o Beatport manda em minúsculas
        self.token_status = 200
        self.expira_em = 3600
        self.refresh_status = 200
        self.busca_status = 200
        self.busca_corpo = {"tracks": [PEAK_TIME]}
        self.tokens_validos = set()
        self._n = 0
        servidor = self

        class Atendente(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _responder(self, status, corpo=b"", tipo="application/json", cabecalhos=()):
                self.send_response(status)
                self.send_header("Content-Type", tipo)
                for nome, valor in cabecalhos:
                    self.send_header(nome, valor)
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)

            def _json(self, status, dados, cabecalhos=()):
                self._responder(status, json.dumps(dados).encode("utf-8"), cabecalhos=cabecalhos)

            def _tratar(self, metodo):
                url = urllib.parse.urlparse(self.path)
                consulta = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}
                tamanho = int(self.headers.get("Content-Length") or 0)
                corpo = self.rfile.read(tamanho) if tamanho else b""
                cabecalhos = {k.lower(): v for k, v in self.headers.items()}
                servidor.requisicoes.append((metodo, url.path, consulta, cabecalhos, corpo))
                caminho = url.path
                if caminho == "/v4/docs/":
                    return self._responder(200, b'<html><script src="/static/docs.js"></script></html>', "text/html")
                if caminho == "/static/docs.js":
                    texto = "var config = {API_CLIENT_ID: '%s'};" % ID_DO_CLIENTE if servidor.docs_com_id else "var x = 1;"
                    return self._responder(200, texto.encode("utf-8"), "text/javascript")
                if caminho == "/v4/auth/login/" and metodo == "POST":
                    if servidor.login_status != 200:
                        return self._json(servidor.login_status, {"detail": "recusado"})
                    return self._json(200, servidor.login_corpo, [("Set-Cookie", "sessionid=sessao-de-teste; Path=/")])
                if caminho == "/v4/auth/o/authorize/":
                    if servidor.authorize == "sem-location":
                        return self._responder(200, b"<p>pagina</p>", "text/html")
                    destino = "/v4/auth/o/post-message/" + ("?code=codigo-de-teste" if servidor.authorize == "ok" else "?erro=x")
                    return self._responder(302, b"", cabecalhos=[(servidor.nome_do_location, destino)])
                if caminho == "/v4/auth/o/token/" and metodo == "POST":
                    renovando = consulta.get("grant_type") == "refresh_token"
                    status = servidor.refresh_status if renovando else servidor.token_status
                    if status != 200:
                        return self._json(status, {"error": "x"})
                    servidor._n += 1
                    acesso = "acesso-%d" % servidor._n
                    servidor.tokens_validos.add(acesso)
                    return self._json(
                        200, {"access_token": acesso, "expires_in": servidor.expira_em, "refresh_token": "refresh-%d" % servidor._n}
                    )
                if caminho == "/v4/catalog/search":
                    # o Beatport real manda a busca sem barra final para a com barra (301)
                    return self._responder(301, b"", cabecalhos=[("location", "/v4/catalog/search/?" + self.path.partition("?")[2])])
                if caminho == "/v4/catalog/search/":
                    autorizacao = cabecalhos.get("authorization", "")
                    if autorizacao.replace("Bearer ", "") not in servidor.tokens_validos:
                        return self._json(401, {"detail": "token invalido"})
                    if servidor.busca_status != 200:
                        return self._json(servidor.busca_status, {"detail": "x"})
                    corpo_da_busca = servidor.busca_corpo
                    if isinstance(corpo_da_busca, bytes):
                        return self._responder(200, corpo_da_busca, "text/html")
                    return self._json(200, corpo_da_busca)
                self._json(404, {})

            def do_GET(self):
                self._tratar("GET")

            def do_POST(self):
                self._tratar("POST")

        self._http = ThreadingHTTPServer(("127.0.0.1", 0), Atendente)
        self._http.daemon_threads = True
        self.base = "http://127.0.0.1:%d/v4" % self._http.server_address[1]
        self._thread = threading.Thread(target=self._http.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self._thread.start()

    def parar(self):
        self._http.shutdown()
        self._http.server_close()

    def chamadas(self, caminho):
        return [r for r in self.requisicoes if r[1] == caminho]


class Relogio:
    """Tempo e pausa de mentira: `pausar` só avança o relógio."""

    def __init__(self):
        self.agora = 1_000_000.0
        self.pausas = []

    def __call__(self):
        return self.agora

    def pausar(self, segundos):
        self.pausas.append(segundos)
        self.agora += segundos


class BaseDoCliente(unittest.TestCase):
    def setUp(self):
        self.servidor = ServidorFalso()
        self.addCleanup(self.servidor.parar)
        self.pasta = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta.cleanup)
        self.arquivo_do_token = os.path.join(self.pasta.name, "beatport-token.json")
        self.relogio = Relogio()
        # sem consulta de proxy do sistema (no Windows ela custa ~0,2 s por requisição): só o servidor local
        for alvo in (mock.patch("urllib.request.getproxies", return_value={}), mock.patch("urllib.request.proxy_bypass", return_value=True)):
            alvo.start()
            self.addCleanup(alvo.stop)

    def cliente(self, usuario=USUARIO, base=None, **extra):
        return beatport.ClienteBeatport(
            usuario,
            SENHA,
            base=base or self.servidor.base,
            arquivo_do_token=self.arquivo_do_token,
            relogio=self.relogio,
            pausar=self.relogio.pausar,
            tempo_limite=5,
            **extra,
        )

    def assertErro(self, codigo, funcao, *args):
        with self.assertRaises(beatport.ErroBeatport) as contexto:
            funcao(*args)
        self.assertEqual(contexto.exception.codigo, codigo)
        return contexto.exception


class Casamento(unittest.TestCase):
    def casar(self, artista, titulo, faixas, artistas=None):
        return beatport.classificar_casamento(artista, titulo, faixas, artistas)

    def test_exata_quando_artista_e_mix_conferem(self):
        r = self.casar("Azyr", "No Escape (Extended Mix)", [PEAK_TIME])
        self.assertEqual(r, beatport.Resultado("exata", "101", "Techno (Peak Time / Driving)", "Peak Time"))

    def test_aproximada_quando_a_biblioteca_nao_tem_mix(self):
        r = self.casar("Azyr", "Fire Walk", [HARD_TECHNO])
        self.assertEqual(r, beatport.Resultado("aproximada", "202", "Hard Techno", None))

    def test_aproximada_quando_o_mix_difere(self):
        self.assertEqual(self.casar("Azyr", "No Escape (Dub Mix)", [PEAK_TIME]).situacao, "aproximada")
        self.assertEqual(self.casar("Azyr", "No Escape - Dub Mix", [PEAK_TIME]).situacao, "aproximada")

    def test_nao_encontrada(self):
        self.assertEqual(self.casar("Outro Artista", "No Escape (Extended Mix)", [PEAK_TIME]), ("nao-encontrada", "", None, None))
        self.assertEqual(self.casar("Azyr", "Outra Faixa", [PEAK_TIME]).situacao, "nao-encontrada")
        self.assertEqual(self.casar("Azyr", "No Escape", []).situacao, "nao-encontrada")
        self.assertEqual(self.casar("Azyr", "No Escape", None).situacao, "nao-encontrada")
        self.assertEqual(self.casar("Azyr", "No Escape", ["texto", 1, {}]).situacao, "nao-encontrada")

    def test_a_exata_vale_mais_que_uma_aproximada_anterior(self):
        dub = faixa(1, "No Escape", "Dub Mix", ["Azyr"], "Hard Techno")
        r = self.casar("Azyr", "No Escape (Extended Mix)", [dub, PEAK_TIME])
        self.assertEqual((r.situacao, r.id), ("exata", "101"))

    def test_colaboracao_acentos_e_caixa(self):
        r = self.casar("KUKO", "RAVE ALERT", [NEO_RAVE])
        self.assertEqual(r.situacao, "aproximada")
        r = self.casar("Kuko, Neuf", "Rave Alert (Original Mix)", [NEO_RAVE], ["Kuko", "Neuf"])
        self.assertEqual(r.situacao, "exata")
        acentuada = faixa(5, "Ação", "Original Mix", ["Jóse"], "House")
        self.assertEqual(self.casar("Jose", "Acao (Original Mix)", [acentuada]).situacao, "exata")

    def test_faixa_sem_genero(self):
        r = self.casar("Azyr", "Sem Genero", [faixa(7, "Sem Genero", "Original Mix", ["Azyr"], None)])
        self.assertEqual((r.situacao, r.genero, r.subgenero), ("aproximada", None, None))

    def test_separar_mix(self):
        self.assertEqual(beatport.separar_mix("No Escape (Extended Mix)"), ("No Escape", "Extended Mix"))
        self.assertEqual(beatport.separar_mix("No Escape - Dub Mix"), ("No Escape", "Dub Mix"))
        self.assertEqual(beatport.separar_mix("No Escape (feat. Neuf)"), ("No Escape (feat. Neuf)", None))
        self.assertEqual(beatport.separar_mix("No Escape"), ("No Escape", None))
        self.assertEqual(beatport.separar_mix(None), ("", None))

    def test_cabecalho_sem_diferenciar_a_caixa(self):
        self.assertEqual(beatport._cabecalho({"location": "x"}, "Location"), "x")
        self.assertEqual(beatport._cabecalho([("LOCATION", "y")], "location"), "y")
        self.assertIsNone(beatport._cabecalho({}, "Location"))


class Autenticacao(BaseDoCliente):
    def test_fluxo_completo_e_busca(self):
        resultado = self.cliente().buscar("Azyr", "No Escape (Extended Mix)")
        self.assertEqual((resultado.situacao, resultado.genero, resultado.subgenero), ("exata", "Techno (Peak Time / Driving)", "Peak Time"))
        sequencia = [(m, c) for m, c, *_ in self.servidor.requisicoes if c.startswith("/v4")]
        self.assertEqual(
            sequencia,
            [
                ("GET", "/v4/docs/"),
                ("POST", "/v4/auth/login/"),
                ("GET", "/v4/auth/o/authorize/"),
                ("POST", "/v4/auth/o/token/"),
                ("GET", "/v4/catalog/search/"),
            ],
        )
        login = self.servidor.chamadas("/v4/auth/login/")[0]
        self.assertEqual(json.loads(login[4]), {"username": USUARIO, "password": SENHA})
        self.assertEqual(login[3]["user-agent"], "soulcrate")
        autorizar = self.servidor.chamadas("/v4/auth/o/authorize/")[0]
        self.assertEqual(autorizar[2]["client_id"], ID_DO_CLIENTE)
        self.assertEqual(autorizar[2]["response_type"], "code")
        self.assertIn("sessionid=sessao-de-teste", autorizar[3]["cookie"])  # a sessão do login segue para o authorize
        token = self.servidor.chamadas("/v4/auth/o/token/")[0]
        self.assertEqual(token[2]["code"], "codigo-de-teste")
        self.assertEqual(token[2]["grant_type"], "authorization_code")
        busca = self.servidor.chamadas("/v4/catalog/search/")[0]
        self.assertEqual(busca[2], {"q": "Azyr No Escape", "type": "tracks", "per_page": "5"})  # o título vai sem o mix
        self.assertEqual(busca[3]["authorization"], "Bearer acesso-1")

    def test_location_em_maiusculas_tambem_funciona(self):
        self.servidor.nome_do_location = "Location"
        self.assertEqual(self.cliente().buscar("Azyr", "No Escape").situacao, "aproximada")

    def test_token_fica_no_disco_so_para_o_dono(self):
        self.cliente().buscar("Azyr", "No Escape")
        with open(self.arquivo_do_token, encoding="utf-8") as arquivo:
            guardado = json.load(arquivo)
        self.assertEqual(guardado["access_token"], "acesso-1")
        self.assertEqual(guardado["refresh_token"], "refresh-1")
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(os.stat(self.arquivo_do_token).st_mode), 0o600)
        # a senha nunca vai para o arquivo
        with open(self.arquivo_do_token, encoding="utf-8") as arquivo:
            self.assertNotIn(SENHA, arquivo.read())

    def test_token_e_reaproveitado_por_outro_processo(self):
        self.cliente().buscar("Azyr", "No Escape")
        self.relogio.agora += 100
        outro = self.cliente()  # um `beet` novo: instância nova, mesmo arquivo
        outro.buscar("Azyr", "Fire Walk")
        self.assertEqual(len(self.servidor.chamadas("/v4/auth/login/")), 1)
        self.assertEqual(self.servidor.chamadas("/v4/catalog/search/")[1][3]["authorization"], "Bearer acesso-1")

    def test_token_de_outra_conta_nao_e_reaproveitado(self):
        self.cliente().buscar("Azyr", "No Escape")
        self.cliente(usuario="outra-conta").buscar("Azyr", "No Escape")
        self.assertEqual(len(self.servidor.chamadas("/v4/auth/login/")), 2)

    def test_token_expirado_e_renovado_com_o_refresh(self):
        cliente = self.cliente()
        cliente.buscar("Azyr", "No Escape")
        self.relogio.agora += 4000  # passou dos 3600 s
        cliente.buscar("Azyr", "Fire Walk")
        self.assertEqual(len(self.servidor.chamadas("/v4/auth/login/")), 1)
        renovacao = [r for r in self.servidor.chamadas("/v4/auth/o/token/") if r[2].get("grant_type") == "refresh_token"]
        self.assertEqual(len(renovacao), 1)
        self.assertEqual(renovacao[0][2]["refresh_token"], "refresh-1")
        self.assertEqual(self.servidor.chamadas("/v4/catalog/search/")[1][3]["authorization"], "Bearer acesso-2")

    def test_refresh_recusado_faz_o_login_completo(self):
        cliente = self.cliente()
        cliente.buscar("Azyr", "No Escape")
        self.relogio.agora += 4000
        self.servidor.refresh_status = 400
        cliente.buscar("Azyr", "Fire Walk")
        self.assertEqual(len(self.servidor.chamadas("/v4/auth/login/")), 2)

    def test_token_revogado_pede_login_novo_uma_vez(self):
        cliente = self.cliente()
        cliente.buscar("Azyr", "No Escape")
        self.servidor.tokens_validos.clear()  # o servidor esqueceu o token
        cliente.buscar("Azyr", "Fire Walk")
        self.assertEqual(len(self.servidor.chamadas("/v4/auth/login/")), 2)
        self.assertEqual(len(self.servidor.chamadas("/v4/catalog/search/")), 3)

    def test_login_recusado_liga_o_freio(self):
        for status in (401, 400):
            self.servidor.login_status = status
            cliente = self.cliente()
            erro = self.assertErro("login-recusado", cliente.buscar, "Azyr", "No Escape")
            self.assertEqual(erro.status, status)
            self.assertEqual(cliente.freio, "login-recusado")

    def test_login_com_200_e_mensagem_de_erro_tambem_e_recusa(self):
        self.servidor.login_corpo = {"detail": "Unable to log in"}
        self.assertErro("login-recusado", self.cliente().buscar, "Azyr", "No Escape")

    def test_com_freio_o_resto_do_processo_nao_chama_o_beatport(self):
        self.servidor.login_status = 401
        cliente = self.cliente()
        self.assertErro("login-recusado", cliente.buscar, "Azyr", "No Escape")
        antes = len(self.servidor.requisicoes)
        self.servidor.login_status = 200  # mesmo que o servidor melhore, o processo não insiste
        self.assertErro("login-recusado", cliente.buscar, "Azyr", "Fire Walk")
        self.assertErro("login-recusado", cliente.testar)
        self.assertEqual(len(self.servidor.requisicoes), antes)

    def test_verificacao_de_navegador_403(self):
        self.servidor.login_status = 403
        cliente = self.cliente()
        self.assertErro("verificacao", cliente.buscar, "Azyr", "No Escape")
        self.assertEqual(cliente.freio, "verificacao")

    def test_403_na_busca(self):
        self.servidor.busca_status = 403
        cliente = self.cliente()
        self.assertErro("verificacao", cliente.buscar, "Azyr", "No Escape")
        self.assertEqual(cliente.freio, "verificacao")

    def test_limite_429(self):
        self.servidor.busca_status = 429
        cliente = self.cliente()
        self.assertErro("limite", cliente.buscar, "Azyr", "No Escape")
        self.assertEqual(cliente.freio, "limite")
        self.servidor.login_status = 429
        self.assertErro("limite", self.cliente().buscar, "Azyr", "No Escape")

    def test_fluxo_mudou(self):
        self.servidor.docs_com_id = False
        self.assertErro("fluxo-mudou", self.cliente().buscar, "Azyr", "No Escape")
        self.servidor.docs_com_id = True
        for modo in ("sem-location", "sem-codigo"):
            self.servidor.authorize = modo
            self.assertErro("fluxo-mudou", self.cliente().buscar, "Azyr", "No Escape")
        self.servidor.authorize = "ok"
        self.servidor.token_status = 404
        self.assertErro("fluxo-mudou", self.cliente().buscar, "Azyr", "No Escape")

    def test_resposta_fora_do_esperado_na_busca(self):
        self.servidor.token_status = 200
        for corpo in (b"<html>nao e json</html>", {"outra": "coisa"}, {"tracks": "texto"}):
            self.servidor.busca_corpo = corpo
            cliente = self.cliente()
            self.assertErro("fluxo-mudou", cliente.buscar, "Azyr", "No Escape")
            self.assertIsNone(cliente.freio)  # fluxo mudou não liga o freio: só não responde

    def test_lista_em_results_tambem_serve(self):
        self.servidor.busca_corpo = {"results": [PEAK_TIME]}
        self.assertEqual(self.cliente().buscar("Azyr", "No Escape (Extended Mix)").situacao, "exata")

    def test_erro_do_servidor_e_fora_do_ar_e_o_freio_vem_na_terceira(self):
        self.servidor.busca_status = 503
        cliente = self.cliente()
        for _ in range(3):
            self.assertErro("fora-do-ar", cliente.buscar, "Azyr", "No Escape")
        self.assertEqual(cliente.freio, "fora-do-ar")

    def test_rede_fora_do_ar(self):
        cliente = self.cliente(base="http://127.0.0.1:9/v4")  # porta que ninguém escuta
        self.assertErro("fora-do-ar", cliente.buscar, "Azyr", "No Escape")
        self.assertIsNone(cliente.freio)

    def test_pausa_minima_entre_buscas(self):
        cliente = self.cliente()
        cliente.buscar("Azyr", "No Escape")
        cliente.buscar("Azyr", "Fire Walk")
        self.assertEqual(self.relogio.pausas, [1.0])
        self.relogio.agora += 5  # já passou mais que a pausa
        cliente.buscar("Azyr", "Fire Walk")
        self.assertEqual(self.relogio.pausas, [1.0])

    def test_testar_faz_login_e_uma_busca(self):
        self.cliente().testar()
        self.assertEqual(len(self.servidor.chamadas("/v4/catalog/search/")), 1)

    def test_nada_secreto_na_mensagem_de_erro(self):
        self.servidor.login_status = 401
        erro = self.assertErro("login-recusado", self.cliente().buscar, "Azyr", "No Escape")
        for segredo in (USUARIO, SENHA, ID_DO_CLIENTE, "sessao-de-teste"):
            self.assertNotIn(segredo, str(erro))


class Subcomandos(BaseDoCliente):
    """`beet beatport-testar` e `beet beatport-classificar`, com o servidor falso e com um cliente de brinquedo."""

    CONTA = {"BEATPORT_USERNAME": USUARIO, "BEATPORT_PASSWORD": SENHA}

    def montar(self, conta=True, opcoes=None):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = pathlib.Path(pasta) / "pastas.json"
            if opcoes is not None:
                caminho.write_text(json.dumps(opcoes), encoding="utf-8")
            with mock.patch.object(pastas, "ARQUIVO_DA_ORGANIZACAO", str(caminho)), mock.patch.dict(
                "os.environ", self.CONTA if conta else {}, clear=True
            ):
                plugin = pastas.PastasPlugin()
        plugin._hoje = lambda: HOJE
        return plugin

    def executar(self, plugin, nome, lib=None):
        comando = {c.name: c for c in plugin.commands()}[nome]
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            comando.func(lib or _beets_falso.BibliotecaFalsa([]), None, [])
        return saida.getvalue().splitlines()

    def item(self, **campos):
        base = {"artist": "Azyr", "title": "No Escape", "genres": ["Techno"]}
        base.update(campos)
        return _beets_falso.ItemFalso(**base)

    # --- beatport-testar

    def test_testar_sem_conta(self):
        self.assertEqual(self.executar(self.montar(conta=False), "beatport-testar"), ["soulcrate-beatport: sem-conta"])

    def test_testar_com_o_servidor_falso(self):
        casos = [
            ({}, "ok"),
            ({"login_status": 401}, "login-recusado"),
            ({"login_status": 403}, "verificacao"),
            ({"busca_status": 429}, "limite"),
            ({"docs_com_id": False}, "fluxo-mudou"),
            ({"busca_corpo": b"nao e json"}, "fluxo-mudou"),
            ({"busca_status": 502}, "fora-do-ar"),
        ]
        for ajustes, esperado in casos:
            for chave, valor in {"login_status": 200, "busca_status": 200, "docs_com_id": True, "busca_corpo": {"tracks": []}}.items():
                setattr(self.servidor, chave, valor)
            self.servidor.tokens_validos.clear()
            for chave, valor in ajustes.items():
                setattr(self.servidor, chave, valor)
            plugin = self.montar()
            plugin._cliente = self.cliente()
            if os.path.exists(self.arquivo_do_token):
                os.remove(self.arquivo_do_token)
            self.assertEqual(self.executar(plugin, "beatport-testar"), ["soulcrate-beatport: " + esperado], ajustes)

    def test_testar_sem_rede(self):
        plugin = self.montar()
        plugin._cliente = self.cliente(base="http://127.0.0.1:9/v4")
        self.assertEqual(self.executar(plugin, "beatport-testar"), ["soulcrate-beatport: fora-do-ar"])

    def test_testar_erro_inesperado_vira_fluxo_mudou(self):
        plugin = self.montar()
        plugin._cliente = ClienteQueQuebra()
        self.assertEqual(self.executar(plugin, "beatport-testar"), ["soulcrate-beatport: fluxo-mudou"])

    # --- beatport-classificar

    def test_classificar_sem_conta_so_aplica_as_regras_locais(self):
        plugin = self.montar(conta=False)
        plugin._cliente = ClienteQueQuebra()  # se chamasse a rede, quebraria
        itens = [
            self.item(genres=["Techno (Peak Time / Driving)"]),
            self.item(genres=["Hard Techno"], title="Outra"),
            self.item(genres=["Techno"], subgenero_resolvido="Peak Time", title="Ja feita"),
        ]
        linhas = self.executar(plugin, "beatport-classificar", _beets_falso.BibliotecaFalsa(itens))
        self.assertEqual(
            linhas,
            [
                "soulcrate-beatport: total=2 conta=0",
                "soulcrate-beatport: 1/2 Techno / Peak Time - Driving",
                "soulcrate-beatport: 2/2 Hard Techno / _Sem Subgenero",
                "soulcrate-beatport: fim classificadas=2 beatport=0 local=2 sem-subgenero=1 freio=0",
            ],
        )
        self.assertEqual([i.get("subgenero_resolvido") for i in itens], ["Peak Time - Driving", "_Sem Subgenero", "Peak Time"])
        self.assertEqual([i.gravacoes for i in itens], [1, 1, 0])

    def test_classificar_com_conta_grava_os_campos_do_beatport(self):
        plugin = self.montar()
        R = beatport.Resultado
        plugin._cliente = ClienteDeBrinquedo(
            [R("exata", "101", "Techno (Peak Time / Driving)", "Peak Time"), R("nao-encontrada", "", None, None), R("aproximada", "303", "Hard Dance / Hardcore / Neo Rave", "Neo Rave")]
        )
        itens = [self.item(title="A (Extended Mix)"), self.item(title="B", genres=["Hard Techno"]), self.item(title="C")]
        linhas = self.executar(plugin, "beatport-classificar", _beets_falso.BibliotecaFalsa(itens))
        self.assertEqual(
            linhas,
            [
                "soulcrate-beatport: total=3 conta=1",
                "soulcrate-beatport: 1/3 Techno / Peak Time",
                "soulcrate-beatport: 2/3 Hard Techno / _Sem Subgenero",
                "soulcrate-beatport: 3/3 Hard Dance / Neo Rave",
                "soulcrate-beatport: fim classificadas=3 beatport=2 local=1 sem-subgenero=1 freio=0",
            ],
        )
        primeira, segunda, terceira = itens
        self.assertEqual(
            {k: v for k, v in primeira.items() if k.startswith(("beatport_", "subgenero"))},
            {
                "beatport_id": "101",
                "beatport_genero": "Techno (Peak Time / Driving)",
                "beatport_subgenero": "Peak Time",
                "beatport_situacao": "exata",
                "beatport_em": "2026-11-24",
                "subgenero_resolvido": "Peak Time",
            },
        )
        self.assertEqual((segunda["beatport_situacao"], segunda["beatport_genero"], segunda["beatport_em"]), ("nao-encontrada", "", "2026-11-24"))
        self.assertEqual(terceira["subgenero_resolvido"], "Neo Rave")
        self.assertEqual(plugin._cliente.chamadas[0], ("Azyr", "A (Extended Mix)"))

    def test_classificar_de_novo_nao_repete_o_que_ja_foi(self):
        plugin = self.montar()
        R = beatport.Resultado
        plugin._cliente = ClienteDeBrinquedo([R("exata", "101", "Techno (Peak Time / Driving)", "Peak Time"), R("nao-encontrada", "", None, None)])
        itens = [self.item(title="A"), self.item(title="B")]
        biblioteca = _beets_falso.BibliotecaFalsa(itens)
        self.executar(plugin, "beatport-classificar", biblioteca)
        linhas = self.executar(plugin, "beatport-classificar", biblioteca)
        self.assertEqual(linhas[0], "soulcrate-beatport: total=0 conta=1")
        self.assertEqual(len(plugin._cliente.chamadas), 2)

    def test_nao_encontrada_so_volta_a_ser_consultada_depois_de_30_dias(self):
        plugin = self.montar()
        recente = self.item(title="R", subgenero_resolvido="_Sem Subgenero", beatport_situacao="nao-encontrada", beatport_em="2026-10-26")  # 29 dias
        antiga = self.item(title="A", subgenero_resolvido="_Sem Subgenero", beatport_situacao="nao-encontrada", beatport_em="2026-10-25")  # 30 dias
        estragada = self.item(title="E", subgenero_resolvido="_Sem Subgenero", beatport_situacao="nao-encontrada", beatport_em="ontem")
        achada = self.item(title="F", subgenero_resolvido="Peak Time", beatport_situacao="exata", beatport_em="2020-01-01")
        plugin._cliente = ClienteDeBrinquedo([beatport.Resultado("exata", "9", "Hard Techno", None)] * 5)
        linhas = self.executar(plugin, "beatport-classificar", _beets_falso.BibliotecaFalsa([recente, antiga, estragada, achada]))
        self.assertEqual(linhas[0], "soulcrate-beatport: total=2 conta=1")
        self.assertEqual([c[1] for c in plugin._cliente.chamadas], ["A", "E"])

    def test_com_freio_continua_so_com_as_regras_locais(self):
        plugin = self.montar()
        plugin._cliente = ClienteDeBrinquedo([beatport.ErroBeatport("login-recusado", 401)], freia_no_erro=True)
        itens = [self.item(title="A", genres=["Techno (Raw / Deep / Hypnotic)"]), self.item(title="B"), self.item(title="C")]
        linhas = self.executar(plugin, "beatport-classificar", _beets_falso.BibliotecaFalsa(itens))
        self.assertEqual(len(plugin._cliente.chamadas), 1)  # depois do freio, nem tenta
        self.assertEqual(linhas[-1], "soulcrate-beatport: fim classificadas=3 beatport=0 local=3 sem-subgenero=2 freio=1")
        self.assertEqual(itens[0]["subgenero_resolvido"], "Raw - Deep - Hypnotic")
        self.assertTrue(all(i.get("subgenero_resolvido") for i in itens))
        self.assertFalse(any(i.get("beatport_situacao") for i in itens))  # falha não vira cache negativo

    def test_interromper_e_rodar_de_novo_continua_de_onde_parou(self):
        plugin = self.montar()
        R = beatport.Resultado
        plugin._cliente = ClienteDeBrinquedo([R("exata", "1", "Hard Techno", None), KeyboardInterrupt()])
        itens = [self.item(title="A"), self.item(title="B"), self.item(title="C")]
        biblioteca = _beets_falso.BibliotecaFalsa(itens)
        with self.assertRaises(KeyboardInterrupt), contextlib.redirect_stdout(io.StringIO()):
            self.executar(plugin, "beatport-classificar", biblioteca)
        self.assertEqual([bool(i.get("subgenero_resolvido")) for i in itens], [True, False, False])
        plugin._cliente = ClienteDeBrinquedo([R("exata", "2", "Hard Techno", None)] * 2)
        linhas = self.executar(plugin, "beatport-classificar", biblioteca)
        self.assertEqual(linhas[0], "soulcrate-beatport: total=2 conta=1")
        self.assertEqual([c[1] for c in plugin._cliente.chamadas], ["B", "C"])
        self.assertEqual(itens[0]["beatport_id"], "1")  # a primeira ficou como estava

    def test_com_o_servidor_falso_de_ponta_a_ponta(self):
        self.servidor.busca_corpo = {"tracks": [PEAK_TIME, NEO_RAVE]}
        plugin = self.montar()
        plugin._cliente = self.cliente()
        itens = [self.item(title="No Escape (Extended Mix)"), self.item(artist="Kuko", title="Rave Alert", genres=["Techno"]), self.item(title="Sumiu")]
        linhas = self.executar(plugin, "beatport-classificar", _beets_falso.BibliotecaFalsa(itens))
        self.assertEqual(linhas[-1], "soulcrate-beatport: fim classificadas=3 beatport=2 local=1 sem-subgenero=1 freio=0")
        self.assertEqual([i["beatport_situacao"] for i in itens], ["exata", "aproximada", "nao-encontrada"])
        self.assertEqual([i["subgenero_resolvido"] for i in itens], ["Peak Time", "Neo Rave", "_Sem Subgenero"])

    def test_linhas_nunca_levam_segredo_nem_dado_da_faixa_alem_do_genero(self):
        self.servidor.busca_corpo = {"tracks": [PEAK_TIME]}
        plugin = self.montar()
        plugin._cliente = self.cliente()
        todas = self.executar(plugin, "beatport-classificar", _beets_falso.BibliotecaFalsa([self.item(title="No Escape (Extended Mix)")]))
        todas += self.executar(plugin, "beatport-testar")
        for linha in todas:
            self.assertRegex(linha, r"^soulcrate-beatport: (ok|total=\d+ conta=[01]|\d+/\d+ .+ / .+|fim classificadas=\d+ beatport=\d+ local=\d+ sem-subgenero=\d+ freio=[01])$")
            for segredo in (USUARIO, SENHA, ID_DO_CLIENTE, "acesso-", "refresh-", "sessao-de-teste", "Azyr"):
                self.assertNotIn(segredo, linha)

    # --- estágio de importação

    def test_importacao_grava_no_banco_e_nunca_na_tag(self):
        plugin = self.montar()
        plugin._cliente = ClienteDeBrinquedo([beatport.Resultado("exata", "101", "Techno (Peak Time / Driving)", "Peak Time")])
        item = self.item(title="No Escape (Extended Mix)")
        plugin.import_stages[0](None, _beets_falso.TarefaFalsa([item]))
        self.assertEqual(item["subgenero_resolvido"], "Peak Time")
        self.assertEqual(item["beatport_situacao"], "exata")
        self.assertEqual(item.gravacoes, 1)
        self.assertFalse(hasattr(item, "write"))  # o item de brinquedo nem tem `write`: chamar quebraria
        codigo = (_beets_falso.PLUGINS / "pastas.py").read_text(encoding="utf-8")
        self.assertNotIn(".write(", codigo.replace("sys.stdout", ""))

    def test_falha_do_beatport_nunca_impede_a_importacao(self):
        plugin = self.montar()
        plugin._cliente = ClienteQueQuebra()
        item = self.item(genres=["Techno (Peak Time / Driving)"])
        plugin.import_stages[0](None, _beets_falso.TarefaFalsa([item]))
        self.assertEqual(item["subgenero_resolvido"], "Peak Time - Driving")
        self.assertEqual(item.gravacoes, 1)
        self.assertFalse(item.get("beatport_situacao"))
        avisos = " ".join(plugin._log.avisos)
        self.assertIn("beatport: sem resposta", avisos)
        for segredo in (USUARIO, SENHA):
            self.assertNotIn(segredo, avisos)

    def test_faixa_ja_consultada_nao_e_consultada_na_reimportacao(self):
        plugin = self.montar()
        plugin._cliente = ClienteQueQuebra()
        item = self.item(beatport_situacao="exata", beatport_genero="Hard Techno", beatport_subgenero="")
        plugin.import_stages[0](None, _beets_falso.TarefaFalsa([item]))
        self.assertEqual(item["subgenero_resolvido"], "_Sem Subgenero")
        self.assertEqual(plugin._log.avisos, [])

    def test_beatport_com_gaveta_do_servidor_com_nome_perigoso_nunca_vira_pasta(self):
        self.servidor.busca_corpo = {"tracks": [faixa(1, "No Escape", "Original Mix", ["Azyr"], "../../Windows", "a/b")]}
        plugin = self.montar()
        plugin._cliente = self.cliente()
        item = self.item(title="No Escape (Original Mix)", genres=["Techno (Peak Time / Driving)"])
        plugin.import_stages[0](None, _beets_falso.TarefaFalsa([item]))
        self.assertEqual(item["subgenero_resolvido"], "Peak Time - Driving")  # caiu na tag
        self.assertEqual(plugin.template_fields["genero_pasta"](item), "Techno")


class ClienteDeBrinquedo:
    """Responde com uma lista de Resultado (ou exceção) na ordem; guarda o que foi perguntado."""

    def __init__(self, respostas, freia_no_erro=False):
        self._respostas = list(respostas)
        self._freia = freia_no_erro
        self.chamadas = []
        self.freio = None

    def buscar(self, artista, titulo, artistas=None):
        self.chamadas.append((artista, titulo))
        resposta = self._respostas.pop(0)
        if isinstance(resposta, BaseException):
            if self._freia:
                self.freio = resposta.codigo
            raise resposta
        return resposta

    def testar(self):
        pass


class ClienteQueQuebra:
    freio = None

    def buscar(self, *args):
        raise RuntimeError("sem rede de verdade nos testes")

    def testar(self):
        raise RuntimeError("sem rede de verdade nos testes")


if __name__ == "__main__":
    unittest.main()
