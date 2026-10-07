"""Cria metadados minimos (dist-info) para pacotes que perguntam a propria versao
via importlib.metadata.version("<nome>") mas vieram na imagem base sem dist-info
(caso do httpx2/httpcore2 usados pelo pylast -> plugin lastgenre)."""
import os, re, sys

sp = sys.argv[1]
names = os.listdir(sp)
have = set()
for n in names:
    if n.endswith((".dist-info", ".egg-info")):
        base = n.rsplit(".", 1)[0]            # "Foo_Bar-1.2.dist-info" -> "Foo_Bar-1.2"
        have.add(re.sub(r"[-_.]+", "_", base.split("-")[0]).lower())

made = []
for n in sorted(names):
    pkg = os.path.join(sp, n)
    if n.startswith("_") or not os.path.isfile(os.path.join(pkg, "__init__.py")):
        continue
    if re.sub(r"[-_.]+", "_", n).lower() in have:
        continue
    pat = re.compile(r"""(version|distribution|metadata)\(\s*['"]%s['"]\s*\)""" % re.escape(n))
    asks = False
    for dp, _, files in os.walk(pkg):
        for f in files:
            if f.endswith(".py"):
                try:
                    if pat.search(open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read()):
                        asks = True
                        break
                except OSError:
                    pass
        if asks:
            break
    if not asks:
        continue
    d = os.path.join(sp, f"{n}-0.0.0.dist-info")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "METADATA"), "w") as fh:
        fh.write(f"Metadata-Version: 2.1\nName: {n}\nVersion: 0.0.0\n")
    with open(os.path.join(d, "INSTALLER"), "w") as fh:
        fh.write("soulbeet-dj\n")
    made.append(n)
print("dist-info criado para:", made or "nenhum")
