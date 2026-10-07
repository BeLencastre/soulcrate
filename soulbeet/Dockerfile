# =============================================================================
# Soulbeet "DJ edition"
#   base: soulbeet:full (beets 2.11.0, fetchart, embedart, scrub, lastgenre, chroma...)
#   + autobpm   -> BPM automático (librosa + resampy)
#   + keyfinder -> tom harmônico (keyfinder-cli + libkeyfinder compilados aqui)
#   + beetcamp  -> metadados do Bandcamp
#
# A imagem final do Soulbeet é DISTROLESS (gcr.io/distroless/python3-debian12):
# não tem shell nem apt. Por isso tudo é preparado em estágios Debian 12
# (bookworm, mesma glibc 2.36) e só os artefatos prontos são copiados.
# Receita validada: libkeyfinder 2.2.6 + keyfinder-cli compilam, e
# beets 2.11.0 + librosa + resampy + beetcamp importam/analisam faixas.
#
# Versões FIXAS (build reproduzível). Para atualizar, troque aqui e teste:
#   - imagem do Soulbeet: tag "full" travada pelo digest (não há tag de versão
#     tão nova quanto ela). Digest atual: docker buildx imagetools inspect docccccc/soulbeet:full
#   - libkeyfinder (tag) e keyfinder-cli (commit)
#   - pacotes Python: PLUGIN_PINS
# =============================================================================

# --- Base do Soulbeet (usada nos estágios 2 e 3) -----------------------------
FROM docker.io/docccccc/soulbeet:full@sha256:c419f11ee1476deb74ff5ddb9531f6fbe802e927ea4fe691545ec5bdc3332c1f AS soulbeet-base

# --- Stage 1: libkeyfinder + keyfinder-cli -----------------------------------
FROM debian:bookworm-slim AS keyfinder-builder
ARG LIBKEYFINDER_VERSION=v2.2.6
ARG KEYFINDER_CLI_COMMIT=c8a0c6f188f2d9cf4e07aa5196bfedff5dc288e1
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git ca-certificates pkg-config patchelf \
        libfftw3-dev libavcodec-dev libavformat-dev libavutil-dev libswresample-dev \
    && rm -rf /var/lib/apt/lists/*

# libkeyfinder não é empacotada no Debian/Ubuntu -> compila do fonte
RUN git clone --depth 1 --branch ${LIBKEYFINDER_VERSION} https://github.com/mixxxdj/libkeyfinder.git /src/libkeyfinder \
 && cmake -S /src/libkeyfinder -B /build/libkeyfinder -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF \
 && cmake --build /build/libkeyfinder -j"$(nproc)" \
 && cmake --install /build/libkeyfinder \
 && ldconfig

RUN git init -q /src/keyfinder-cli \
 && git -C /src/keyfinder-cli fetch -q --depth 1 https://github.com/evanpurkhiser/keyfinder-cli.git ${KEYFINDER_CLI_COMMIT} \
 && git -C /src/keyfinder-cli checkout -q FETCH_HEAD \
 && cmake -S /src/keyfinder-cli -B /build/keyfinder-cli -DCMAKE_BUILD_TYPE=Release \
 && cmake --build /build/keyfinder-cli -j"$(nproc)"

# Empacota binário + todas as .so necessárias (menos a glibc, que vem da base)
# e grava o RPATH para que funcione sem shell/wrapper/LD_LIBRARY_PATH.
RUN mkdir -p /out/bin /out/lib \
 && cp /build/keyfinder-cli/keyfinder-cli /out/bin/ \
 && ldd /out/bin/keyfinder-cli \
    | awk '/=> \//{print $3}' \
    | grep -Ev '/(libc|libm|libpthread|libdl|librt|ld-linux[^/]*)\.so' \
    | xargs -r -I{} cp -L {} /out/lib/ \
 && patchelf --force-rpath --set-rpath /opt/keyfinder/lib /out/bin/keyfinder-cli \
 && for l in /out/lib/*.so*; do patchelf --force-rpath --set-rpath '$ORIGIN' "$l"; done

# --- Stage 2: pacotes Python no venv do Soulbeet -----------------------------
# O venv do Soulbeet não tem um pip/python utilizável aqui (ele é ajustado para
# rodar no distroless). Por isso usamos o pip DESTE estágio, enxergando o venv
# via PYTHONPATH e instalando com --prefix: só os pacotes novos são gravados,
# o que já existe (beets, numpy, lap...) fica intocado.
FROM python:3.11-slim-bookworm AS plugin-builder
COPY --from=soulbeet-base /opt/venv /opt/venv
ARG SP=/opt/venv/lib/python3.11/site-packages
ARG PLUGIN_PINS="beetcamp==0.25.0 librosa==0.11.0 resampy==0.4.3"
# Obs.: a imagem base traz httpx2/httpcore2 (usados pelo pylast -> lastgenre) sem metadados
# de pacote, e eles chamam importlib.metadata.version("<nome>") ao serem importados -> o
# lastgenre nao carregava. fix-metadata.py cria um dist-info minimo para esses casos.
COPY fix-metadata.py /tmp/fix-metadata.py
RUN set -eux; \
    python -m pip freeze --path "$SP" | grep -iE '^(beets|numpy|lap)==' > /tmp/constraints.txt || true; \
    [ -s /tmp/constraints.txt ] || printf 'beets==2.11.0\nnumpy==2.2.6\nlap==0.5.13\n' > /tmp/constraints.txt; \
    cat /tmp/constraints.txt; \
    PYTHONPATH="$SP" python -m pip install --no-cache-dir --prefix /tmp/pfx \
        -c /tmp/constraints.txt "beets[autobpm]" $PLUGIN_PINS; \
    NEW="$(find /tmp/pfx -type d \( -name site-packages -o -name dist-packages \) | head -n1)"; \
    mkdir -p "$SP"; cp -a "$NEW"/. "$SP"/; \
    python /tmp/fix-metadata.py "$SP"; \
    PYTHONPATH="$SP" python -c "import librosa, resampy, beetsplug.bandcamp, beets; print('plugins ok - beets', beets.__version__)"; \
    PYTHONPATH="$SP" python -c "import pylast, beetsplug.lastgenre; print('lastgenre ok')" || echo "AVISO: lastgenre ainda nao importa"

# --- Stage 3: imagem final (distroless) --------------------------------------
FROM soulbeet-base
COPY --from=plugin-builder    /opt/venv               /opt/venv
COPY --from=keyfinder-builder /out/lib/               /opt/keyfinder/lib/
COPY --from=keyfinder-builder /out/bin/keyfinder-cli  /usr/local/bin/keyfinder-cli
