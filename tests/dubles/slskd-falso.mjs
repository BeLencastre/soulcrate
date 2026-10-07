#!/usr/bin/env node
// slskd falso para testes do baixar-lista.ps1 (e, depois, do app).
//
// Implementa só o pedaço da API v0 que o script usa: aplicação, compartilhamento,
// buscas e transferências. As buscas respondem com os arquivos de um catálogo JSON
// cujo caminho contém todas as palavras da busca; os downloads "terminam" na hora,
// gravando um arquivo vazio na pasta de downloads (como o slskd faz:
// downloads/<pasta remota>/<arquivo>).
//
// Uso:
//   node slskd-falso.mjs --catalogo catalogo.json --downloads ./downloads [--porta 0] [--chave chave-teste]
//
// Ao começar a ouvir, escreve uma linha JSON no stdout: {"porta": 12345}
//
// Formato do catálogo:
//   {
//     "arquivos": [ { "usuario": "u1", "arquivo": "@@a\\Music\\Azyr\\Azyr - No Escape.flac",
//                     "tamanho": 1000, "duracao": 300, "bitrate": 0 } ],
//     "usuariosLentos": ["lento"],   // downloads ficam para sempre em "Queued, Remotely"
//     "usuariosComErro": ["ruim"],   // downloads terminam em "Completed, Errored"
//     "compartilhados": 10           // arquivos que o slskd diz compartilhar
//   }

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : padrao;
}

const catalogo = JSON.parse(fs.readFileSync(argumento('catalogo'), 'utf8').replace(/^﻿/, ''));
const pastaDownloads = path.resolve(argumento('downloads', './downloads'));
const chave = argumento('chave', 'chave-teste');
const porta = Number(argumento('porta', '0'));

const arquivos = catalogo.arquivos ?? [];
const lentos = new Set(catalogo.usuariosLentos ?? []);
const comErro = new Set(catalogo.usuariosComErro ?? []);
const buscas = new Map(); // id -> { texto, respostas }
const transferencias = []; // { id, usuario, arquivo, estado, pedidoEm }

const normalizar = (s) =>
  s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function responder(texto) {
  const palavras = normalizar(texto).split(' ').filter(Boolean);
  const porUsuario = new Map();
  for (const a of arquivos) {
    const alvo = ` ${normalizar(a.arquivo)} `;
    if (!palavras.every((p) => alvo.includes(` ${p} `))) continue;
    if (!porUsuario.has(a.usuario)) porUsuario.set(a.usuario, []);
    porUsuario.get(a.usuario).push({
      filename: a.arquivo,
      size: a.tamanho ?? 1000,
      length: a.duracao ?? 300,
      bitRate: a.bitrate ?? 0,
      isVariableBitRate: false,
      isLocked: false,
    });
  }
  return [...porUsuario].map(([username, files]) => ({
    username,
    files,
    hasFreeUploadSlot: !lentos.has(username),
    queueLength: lentos.has(username) ? 50 : 0,
    uploadSpeed: 1000,
  }));
}

function gravarDownload(arquivoRemoto) {
  const partes = arquivoRemoto.split(/[\\/]/);
  const destino = path.join(pastaDownloads, partes.at(-2) ?? '', partes.at(-1));
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, '');
}

function enviar(res, status, corpo) {
  if (corpo === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const json = JSON.stringify(corpo);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}

async function lerCorpo(req) {
  let s = '';
  for await (const parte of req) s += parte;
  return s ? JSON.parse(s) : null;
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (req.headers['x-api-key'] !== chave) return enviar(res, 401, { error: 'Unauthorized' });
    const url = new URL(req.url, 'http://localhost');
    const rota = decodeURIComponent(url.pathname).replace(/^\/api\/v0/, '');
    const m = (re) => rota.match(re);
    let r;

    if (req.method === 'GET' && rota === '/application') {
      return enviar(res, 200, { shares: { files: catalogo.compartilhados ?? 10, scanning: false } });
    }
    if (req.method === 'PUT' && rota === '/shares') return enviar(res, 204);

    if (req.method === 'POST' && rota === '/searches') {
      const corpo = await lerCorpo(req);
      buscas.set(corpo.id, { texto: corpo.searchText, respostas: responder(corpo.searchText) });
      return enviar(res, 200, { id: corpo.id, searchText: corpo.searchText, state: 'InProgress' });
    }
    if ((r = m(/^\/searches\/([^/]+)$/))) {
      const b = buscas.get(r[1]);
      if (!b) return enviar(res, 404);
      if (req.method === 'GET') {
        return enviar(res, 200, { id: r[1], searchText: b.texto, state: 'Completed, Succeeded', isComplete: true, responseCount: b.respostas.length });
      }
      if (req.method === 'PUT') return enviar(res, 200);
      if (req.method === 'DELETE') {
        buscas.delete(r[1]);
        return enviar(res, 204);
      }
    }
    if (req.method === 'GET' && (r = m(/^\/searches\/([^/]+)\/responses$/))) {
      const b = buscas.get(r[1]);
      return b ? enviar(res, 200, b.respostas) : enviar(res, 404);
    }

    if (req.method === 'POST' && (r = m(/^\/transfers\/downloads\/([^/]+)$/))) {
      const usuario = r[1];
      for (const f of await lerCorpo(req)) {
        let estado = 'Completed, Succeeded';
        if (lentos.has(usuario)) estado = 'Queued, Remotely';
        else if (comErro.has(usuario)) estado = 'Completed, Errored';
        else gravarDownload(f.filename);
        transferencias.push({ id: randomUUID(), usuario, arquivo: f.filename, estado, pedidoEm: new Date().toISOString() });
      }
      return enviar(res, 201);
    }
    if (req.method === 'GET' && rota === '/transfers/downloads') {
      const porUsuario = new Map();
      for (const t of transferencias) {
        if (!porUsuario.has(t.usuario)) porUsuario.set(t.usuario, []);
        porUsuario.get(t.usuario).push({ id: t.id, filename: t.arquivo, state: t.estado, requestedAt: t.pedidoEm });
      }
      return enviar(res, 200, [...porUsuario].map(([username, files]) => ({ username, directories: [{ directory: '', files }] })));
    }
    if (req.method === 'DELETE' && (r = m(/^\/transfers\/downloads\/([^/]+)\/([^/]+)$/))) {
      const i = transferencias.findIndex((t) => t.usuario === r[1] && t.id === r[2]);
      if (i >= 0) transferencias.splice(i, 1);
      return enviar(res, 204);
    }

    return enviar(res, 404, { error: `rota desconhecida: ${req.method} ${rota}` });
  } catch (e) {
    return enviar(res, 500, { error: String(e) });
  }
});

servidor.listen(porta, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ porta: servidor.address().port }) + '\n');
});
