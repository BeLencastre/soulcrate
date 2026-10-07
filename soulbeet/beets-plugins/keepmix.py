"""keepmix — plugin beets que preserva sufixos de mixagem no título.

Problema: no autotag, o beets troca o título pelo do MusicBrainz/Bandcamp.
Muitas vezes o banco não traz "(Original Mix)", ou casa com outra versão
("Radio Edit") e o DJ perde a informação mais importante da faixa.

Como funciona:
  1. import_task_created -> guarda o título ORIGINAL de cada arquivo.
  2. import_task_apply   -> (depois do autotag, antes de gravar/mover)
     se o original tinha sufixo(s) de mix e o novo título não tem os mesmos,
     remove sufixos divergentes do novo e reaplica os do original:
         "Track (Extended Mix)" + match "Track"              -> "Track (Extended Mix)"
         "Track - Dub Mix"      + match "Track (Radio Edit)" -> "Track (Dub Mix)"
Faixas importadas "as-is" não passam pelo autotag e mantêm o título intacto.
"""

import re

from beets.plugins import BeetsPlugin
from beets.util import syspath

try:
    from mediafile import MediaFile
except ImportError:  # beets antigos
    from beets.mediafile import MediaFile  # type: ignore

DEFAULT_KEYWORDS = [
    "mix", "remix", "dub", "edit", "rework", "re-edit", "version", "vip",
    "instrumental", "bootleg", "remaster", "remastered",
]


class KeepMixPlugin(BeetsPlugin):
    def __init__(self):
        super().__init__()
        self.config.add({"keywords": DEFAULT_KEYWORDS})
        kw = "|".join(re.escape(k) for k in self.config["keywords"].as_str_seq())
        # "(Extended Mix)" / "[Dub Mix]"
        self._paren = re.compile(
            r"\s*[\(\[]([^\(\)\[\]]*\b(?:%s)\b[^\(\)\[\]]*)[\)\]]" % kw, re.I
        )
        # "Track - Extended Mix" (sufixo com hífen no final)
        self._dash = re.compile(r"\s+-\s+([^-]*\b(?:%s)\b[^-]*)$" % kw, re.I)
        self._originals = {}
        self.register_listener("import_task_created", self.capture)
        self.register_listener("import_task_apply", self.restore)

    # ------------------------------------------------------------------ utils

    def _mixes(self, title):
        if not title:
            return []
        found = [m.group(1).strip() for m in self._paren.finditer(title)]
        dash = self._dash.search(self._paren.sub("", title))
        if dash:
            found.append(dash.group(1).strip())
        return [m for m in found if m]

    def _strip_mixes(self, title):
        base = self._paren.sub("", title)
        base = self._dash.sub("", base)
        return re.sub(r"\s+", " ", base).strip()

    # -------------------------------------------------------------- listeners
    def capture(self, session, task):
        for item in getattr(task, "items", None) or []:
            self._originals[item.path] = item.title or ""
        return None  # não altera a lista de tasks

    def restore(self, session, task):
        for item in task.imported_items():
            original = self._originals.pop(item.path, None)
            if original is None:
                try:  # arquivo ainda não foi regravado nesse estágio
                    original = MediaFile(syspath(item.path)).title or ""
                except Exception:
                    continue

            orig_mixes = self._mixes(original)
            if not orig_mixes:
                continue

            new_title = item.title or ""
            # Reconstrói sempre com os sufixos do arquivo original: corrige
            # versão divergente e também a grafia ("original mix" -> "Original Mix").
            orig_base = self._strip_mixes(original)
            base = self._strip_mixes(new_title) or orig_base
            # Mesmo nome com grafia diferente? Fica a grafia do arquivo original.
            if base.casefold() == orig_base.casefold():
                base = orig_base
            fixed = base + "".join(" (%s)" % m for m in orig_mixes)
            if fixed != new_title:
                self._log.info("título preservado: {!r} -> {!r}", new_title, fixed)
                item.title = fixed
