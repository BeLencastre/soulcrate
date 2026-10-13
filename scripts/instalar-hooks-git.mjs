#!/usr/bin/env node
// Aponta o git deste clone para os hooks versionados em .githooks/ (pre-commit e commit-msg).
// Roda sozinho no `npm ci`/`npm install` do app (script "prepare"). Fora de um repositório git, não faz nada.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => spawnSync('git', args, { cwd: raiz, encoding: 'utf8', windowsHide: true });

if (git('rev-parse', '--is-inside-work-tree').stdout?.trim() !== 'true') process.exit(0);
if (git('config', '--get', 'core.hooksPath').stdout?.trim() === '.githooks') process.exit(0);
const r = git('config', 'core.hooksPath', '.githooks');
console.log(r.status === 0 ? 'Git hooks ativados (.githooks/).' : `Não consegui ativar os git hooks: ${r.stderr}`);
