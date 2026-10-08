// Fase 2, ponta a ponta: o assistente de configuração e a tela Configurações no app de verdade (Electron), contra o
// dublê do docker e um Navidrome e um Soulbeet falsos (as rotas dos spikes SP5 e SP6). Nada toca na stack real.
// Critérios de aceite (§5, Fase 2): da instalação à stack no ar sem abrir arquivo; um .env com valores de exemplo mostra
// exatamente o que falta; os arquivos gerados passam na conferência do subir.bat (essa parte está em
// tests/main/config-powershell.test.ts).
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  iniciarNavidromeFalso,
  iniciarSoulbeetFalso,
  type NavidromeFalso,
  type SoulbeetFalso,
} from '../dubles/servicos-falsos';
import { abrirApp, criarAmbiente, TODOS_NO_AR, type Ambiente, type AppAberto } from './ajudantes';

const CAPTURAS = join(import.meta.dirname, '..', '..', 'test-results', 'capturas');
mkdirSync(CAPTURAS, { recursive: true });
const capturar = (janela: Page, nome: string) => janela.screenshot({ path: join(CAPTURAS, `${nome}.png`) });

let amb: Ambiente;
let aberto: AppAberto | null = null;
let navidrome: NavidromeFalso;
let soulbeet: SoulbeetFalso;

test.afterEach(async () => {
  await aberto?.app.close().catch(() => undefined);
  aberto = null;
  await navidrome?.fechar().catch(() => undefined);
  await soulbeet?.fechar().catch(() => undefined);
  amb?.limpar();
});

async function abrirComServicos(
  opcoes: Parameters<typeof criarAmbiente>[0] = {},
  admin?: { usuario: string; senha: string },
): Promise<AppAberto> {
  amb = criarAmbiente(opcoes);
  navidrome = await iniciarNavidromeFalso(admin ? { adminExistente: admin } : {});
  soulbeet = await iniciarSoulbeetFalso(navidrome);
  aberto = await abrirApp(amb, {
    SOULCRATE_SETUP_URLS: JSON.stringify({ navidrome: navidrome.url, soulbeet: soulbeet.url }),
  });
  return aberto;
}

const lerEnv = (arquivo: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(arquivo, 'utf8')
      .split(/\r?\n/)
      .flatMap((l) => {
        const m = /^([A-Z_]+)=(.*)$/.exec(l);
        return m?.[1] ? [[m[1], (m[2] ?? '').replace(/^'|'$/g, '')]] : [];
      }),
  );

const titulo = (janela: Page) => janela.getByRole('heading', { level: 1 });
const avancar = (janela: Page) => janela.getByTestId('avancar').click();
const rotulo = (janela: Page, nome: string) => janela.getByLabel(nome, { exact: true });

test('instalação limpa até a stack no ar, sem abrir nenhum arquivo', async () => {
  const { janela } = await abrirComServicos({ semProjeto: true });
  const pasta = join(amb.raiz, 'Soulcrate');

  // Início: sem pasta, o caminho é o assistente
  await expect(titulo(janela)).toHaveText('Vamos configurar o Soulcrate');
  await janela.getByRole('button', { name: 'Abrir o assistente' }).first().click();
  await expect(titulo(janela)).toHaveText('Onde fica o Soulcrate?');
  await expect(janela.getByRole('navigation', { name: 'Principal' })).toHaveCount(0); // tela cheia
  await expect(janela.getByTestId('campo-pasta')).toHaveValue(pasta);
  await capturar(janela, 'f2-01-pasta');

  // passo 1: copia a stack para a pasta nova
  await avancar(janela);
  await expect(titulo(janela)).toHaveText('Pastas das músicas');
  expect(existsSync(join(pasta, 'docker-compose.yml'))).toBe(true);
  expect(existsSync(join(pasta, '.soulcrate', 'manifesto.json'))).toBe(true);

  // passo 2: as pastas propostas ficam dentro da pasta do Soulcrate; ainda não existem
  await expect(janela.getByRole('textbox', { name: 'Biblioteca' })).toHaveValue(
    join(pasta, 'music').replace(/\\/g, '/'),
  );
  await expect(janela.locator('[data-pasta="music"]')).toContainText('Será criada');
  await expect(janela.locator('[data-pasta="downloads"]')).toContainText('Mesmo disco da biblioteca');
  await capturar(janela, 'f2-02-pastas');
  await avancar(janela);

  // passo 3: Avançar sem preencher revela o que falta, em vez de ficar mudo
  await expect(titulo(janela)).toHaveText('Sua conta no Soulseek');
  await avancar(janela);
  await expect(titulo(janela)).toHaveText('Sua conta no Soulseek');
  await expect(janela.getByText('Informe o seu usuário do Soulseek.')).toBeVisible();
  await capturar(janela, 'f2-03-soulseek-erro');
  await rotulo(janela, 'Usuário').fill('dj_e2e');
  await rotulo(janela, 'Senha').fill('senha-slsk-e2e');
  await avancar(janela);

  // passo 4: gera a senha da Web UI (visível uma vez, com a dica para copiar)
  await expect(titulo(janela)).toHaveText('Acesso à interface do slskd');
  await janela.getByRole('button', { name: 'Gerar senha' }).click();
  const senhaWeb = await rotulo(janela, 'Senha').inputValue();
  expect(senhaWeb).toMatch(/^[A-Za-z0-9]{20}$/);
  await expect(janela.locator('[data-senha-gerada]')).toContainText('Anote ou copie esta senha agora');
  await capturar(janela, 'f2-04-webui');
  await avancar(janela);

  // passo 5: as chaves nascem na gravação; o usuário não as vê
  await expect(titulo(janela)).toHaveText('Chaves');
  await expect(janela.getByText('Será gerada')).toHaveCount(2);
  await capturar(janela, 'f2-05-chaves');
  await avancar(janela);

  // passo 6: ajustes finos com o fuso do sistema
  await expect(titulo(janela)).toHaveText('Ajustes finos');
  await expect(rotulo(janela, 'Fuso horário')).not.toHaveValue('');
  await capturar(janela, 'f2-06-ajustes');
  await avancar(janela);

  // passo 7: a revisão não mostra senha nenhuma
  await expect(titulo(janela)).toHaveText('Revisar e gravar');
  const revisao = janela.getByTestId('revisao');
  await expect(revisao).toContainText('dj_e2e · senha configurada');
  await expect(revisao).toContainText('geradas · iguais nos dois arquivos');
  await expect(janela.locator('body')).not.toContainText('senha-slsk-e2e');
  await expect(janela.locator('body')).not.toContainText(senhaWeb);
  await expect(janela.getByTestId('pastas-a-criar')).toBeVisible();
  await capturar(janela, 'f2-07-revisao');

  // gravar e ligar: o app termina sozinho o que antes se fazia à mão nas interfaces web
  await janela.getByRole('button', { name: 'Gravar e ligar a stack' }).click();
  const fim = janela.getByTestId('tela-fim');
  await expect(fim).toBeVisible();
  await expect(fim).toHaveAttribute('data-terminou', 'true', { timeout: 45_000 });
  for (const t of ['gravar', 'stack', 'navidrome', 'soulbeet']) {
    await expect(janela.locator(`[data-tarefa="${t}"]`)).toHaveAttribute('data-estado', 'feito');
  }
  // a porta 2234 nunca bloqueia: sem nada atendendo, vira aviso
  await expect(janela.locator('[data-tarefa="porta"]')).toHaveAttribute('data-estado', /^(aviso|feito)$/);
  await expect(titulo(janela)).toHaveText(/Tudo pronto/);
  await capturar(janela, 'f2-08-fim');

  // o que ficou no disco
  const env = lerEnv(join(pasta, '.env'));
  expect(env.SLSK_USERNAME).toBe('dj_e2e');
  expect(env.SLSKD_WEB_PASSWORD).toBe(senhaWeb);
  expect(env.MUSIC_DIR).toBe(join(pasta, 'music').replace(/\\/g, '/'));
  expect(env.SLSKD_API_KEY_SOULBEET).toMatch(/^[0-9a-f]{64}$/);
  expect(readFileSync(join(pasta, 'slskd', 'slskd.yml'), 'utf8')).toContain(env.SLSKD_API_KEY_SOULBEET ?? 'x');
  for (const p of ['music', 'downloads', 'incomplete']) expect(existsSync(join(pasta, p))).toBe(true);

  // o Navidrome e o Soulbeet foram configurados com o que o assistente gerou
  expect(navidrome.usuarios.get('admin')).toBe(senhaWeb);
  expect(soulbeet.config).toEqual({ slskd_url: 'http://slskd:5030', slskd_api_key: env.SLSKD_API_KEY_SOULBEET });
  expect(soulbeet.pastas.map((p) => p.path)).toEqual(['/music']);
  expect(amb.chamadas().some((c) => c.includes('up -d --build'))).toBe(true);

  await janela.getByRole('button', { name: 'Ir para o Início' }).click();
  await expect(janela.getByTestId('resumo-stack')).toHaveText('No ar · 3/3 saudáveis', { timeout: 30_000 });
});

test('um .env com valores de exemplo mostra exatamente o que falta', async () => {
  const { janela } = await abrirComServicos({
    env: {
      SLSK_USERNAME: 'seu_usuario_soulseek',
      SLSK_PASSWORD: 'sua_senha_soulseek',
      SLSKD_WEB_PASSWORD: 'troque-esta-senha',
      SOULBEET_SECRET_KEY: 'troque-por-uma-string-aleatoria-longa',
    },
  });

  await expect(janela.locator('[data-etapa="configuracao"]')).toHaveAttribute('data-estado', 'erro');
  await janela.locator('[data-etapa="configuracao"]').getByRole('button', { name: 'Abrir o assistente' }).click();
  // a pasta que o app já usa vem escolhida
  await expect(janela.getByTestId('campo-pasta')).toHaveValue(amb.projeto);
  await avancar(janela);
  await avancar(janela); // pastas: já estão boas
  await expect(titulo(janela)).toHaveText('Sua conta no Soulseek');
  // o usuário de exemplo volta em branco e o que falta aparece de cara
  await expect(rotulo(janela, 'Usuário')).toHaveValue('');
  await expect(janela.getByText('Informe o seu usuário do Soulseek.')).toBeVisible();
  await expect(janela.getByText('Informe a senha.')).toBeVisible();
  await capturar(janela, 'f2-09-env-de-exemplo');

  await rotulo(janela, 'Usuário').fill('dj_novo');
  await rotulo(janela, 'Senha').fill('senha-nova-123');
  await avancar(janela);
  await expect(titulo(janela)).toHaveText('Acesso à interface do slskd');
  // o usuário da Web UI já era de verdade; a senha era de exemplo e pede uma nova
  await expect(rotulo(janela, 'Usuário')).toHaveValue('admin');
  await expect(janela.getByText('Informe a senha.')).toBeVisible();
});

test('refazer a configuração faz backup, mantém senhas e chaves boas e preserva o resto do .env', async () => {
  const { janela } = await abrirComServicos({ mundo: { containers: TODOS_NO_AR } });
  const antes = lerEnv(join(amb.projeto, '.env'));

  await janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
  await janela.getByRole('button', { name: 'Conferência', exact: true }).click();
  await janela.getByRole('button', { name: 'Refazer pelo assistente' }).click();
  await avancar(janela); // 1 → 2
  await avancar(janela); // 2 → 3
  await expect(janela.getByText('Senha já configurada. Deixe em branco para manter.')).toHaveCount(0); // cartão "Configurada"
  await expect(janela.getByText('Configurada', { exact: true })).toBeVisible();
  await avancar(janela); // 3 → 4
  await avancar(janela); // 4 → 5
  await expect(janela.getByText('Mantida')).toHaveCount(2);
  await avancar(janela); // 5 → 6
  await avancar(janela); // 6 → 7
  await expect(janela.getByTestId('backup')).toContainText('.env.bak-');
  await capturar(janela, 'f2-10-refazer-revisao');
  await janela.getByRole('button', { name: 'Gravar e ligar a stack' }).click();
  await expect(janela.getByTestId('tela-fim')).toHaveAttribute('data-terminou', 'true', { timeout: 45_000 });

  const depois = lerEnv(join(amb.projeto, '.env'));
  expect(depois.SLSK_PASSWORD).toBe(antes.SLSK_PASSWORD);
  expect(depois.SLSKD_API_KEY_SOULBEET).toBe(antes.SLSKD_API_KEY_SOULBEET);
  expect(depois.SOULBEET_SECRET_KEY).toBe(antes.SOULBEET_SECRET_KEY);
  const arquivos = (await import('node:fs')).readdirSync(amb.projeto);
  expect(arquivos.some((a) => a.startsWith('.env.bak-'))).toBe(true);
});

test('o Navidrome já tem outro administrador: o assistente pede o login em vez de falhar', async () => {
  const { janela } = await abrirComServicos({}, { usuario: 'antigo', senha: 'senha-antiga' });

  await janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
  await janela.getByRole('button', { name: 'Conferência', exact: true }).click();
  await janela.getByRole('button', { name: 'Refazer pelo assistente' }).click();
  for (let i = 0; i < 6; i++) await avancar(janela);
  await janela.getByRole('button', { name: 'Gravar e ligar a stack' }).click();

  const login = janela.locator('[data-login-navidrome]');
  await expect(login).toBeVisible({ timeout: 45_000 });
  await expect(janela.locator('[data-tarefa="navidrome"]')).toHaveAttribute('data-estado', 'precisa-login');
  await capturar(janela, 'f2-11-precisa-login');

  await login.getByLabel('Usuário do Navidrome').fill('antigo');
  await login.getByLabel('Senha do Navidrome').fill('senha-antiga');
  await login.getByRole('button', { name: 'Continuar' }).click();
  await expect(janela.getByTestId('tela-fim')).toHaveAttribute('data-terminou', 'true', { timeout: 30_000 });
  await expect(janela.locator('[data-tarefa="soulbeet"]')).toHaveAttribute('data-estado', 'feito');
  expect(soulbeet.config.slskd_url).toBe('http://slskd:5030');
});

test('Configurações: alterar uma pasta mostra o banner; Aplicar e reiniciar grava e recria os contêineres', async () => {
  const { janela } = await abrirComServicos({ mundo: { containers: TODOS_NO_AR } });
  await janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();
  await janela.getByRole('button', { name: 'Pastas', exact: true }).click();
  await expect(janela.getByTestId('alteracoes-pendentes')).toHaveCount(0);

  const novo = join(amb.raiz, 'outro-disco', 'incompletos').replace(/\\/g, '/');
  await janela.getByRole('textbox', { name: 'Incompletos' }).fill(novo);
  const banner = janela.getByTestId('alteracoes-pendentes');
  await expect(banner).toContainText('Há alterações não gravadas');
  await expect(banner).toContainText('Valem depois de reiniciar a stack');
  await capturar(janela, 'f2-12-banner');

  // Descartar volta ao que estava
  await banner.getByRole('button', { name: 'Descartar' }).click();
  await expect(banner).toHaveCount(0);
  await expect(janela.getByRole('textbox', { name: 'Incompletos' })).toHaveValue('./incomplete');

  await janela.getByRole('textbox', { name: 'Incompletos' }).fill(novo);
  await janela.getByTestId('alteracoes-pendentes').getByRole('button', { name: 'Aplicar e reiniciar' }).click();
  await expect(janela.getByTestId('painel-aplicar')).toBeVisible();
  await expect(janela.locator('[data-tarefa="stack"]')).toHaveAttribute('data-estado', 'feito', { timeout: 45_000 });
  await expect(janela.locator('[data-tarefa="soulbeet"]')).toHaveAttribute('data-estado', 'feito', { timeout: 30_000 });
  await capturar(janela, 'f2-13-aplicado');

  expect(lerEnv(join(amb.projeto, '.env')).INCOMPLETE_DIR).toBe(novo);
  expect(existsSync(novo)).toBe(true);
  expect(amb.chamadas().some((c) => c.includes('--force-recreate'))).toBe(true);
});

test('Configurações: Soulseek e Web UI nunca mostram senha; a porta 2234 é testada sem travar nada', async () => {
  const { janela } = await abrirComServicos({ mundo: { containers: TODOS_NO_AR } });
  await janela.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Configurações' }).click();

  await janela.getByRole('button', { name: 'Conta Soulseek' }).click();
  await expect(janela.getByRole('textbox', { name: 'Usuário' })).toHaveValue('dj_teste');
  await expect(janela.getByText('Configurada', { exact: true })).toBeVisible();
  await expect(janela.locator('body')).not.toContainText('senha-teste-123');
  await janela.getByRole('button', { name: 'Trocar senha' }).click();
  await expect(rotulo(janela, 'Senha')).toHaveValue('');
  await capturar(janela, 'f2-14-soulseek');

  await janela.getByRole('button', { name: 'Web UI do slskd' }).click();
  await expect(janela.locator('body')).not.toContainText('outra-senha-456');
  await expect(janela.getByText('Iguais', { exact: true })).toBeVisible();
  await janela.getByRole('button', { name: 'Gerar nova chave' }).click();
  await expect(janela.getByText('Será trocada')).toBeVisible();
  await expect(janela.getByTestId('alteracoes-pendentes')).toBeVisible();
  await janela.getByTestId('alteracoes-pendentes').getByRole('button', { name: 'Descartar' }).click();

  await janela.getByRole('button', { name: 'Rede', exact: true }).click();
  await janela.getByRole('button', { name: 'Testar', exact: true }).click();
  await expect(janela.locator('[data-porta]')).toHaveAttribute('data-porta', /^(livre|escutando)$/);
  await expect(janela.getByText('Porta 2234 (Soulseek)')).toBeVisible();
  await capturar(janela, 'f2-15-rede');
});

test('o renderer nunca recebe senha nem chave: nem na leitura da configuração, nem no estado da pós-configuração', async () => {
  const { janela } = await abrirComServicos({ mundo: { containers: TODOS_NO_AR } });
  const env = lerEnv(join(amb.projeto, '.env'));
  const segredos = [
    env.SLSK_PASSWORD,
    env.SLSKD_WEB_PASSWORD,
    env.SOULBEET_SECRET_KEY,
    env.SLSKD_API_KEY_SOULBEET,
  ] as string[];
  expect(segredos.every((s) => s.length > 8)).toBe(true);

  const lido = await janela.evaluate(async () => {
    const api = (
      window as unknown as {
        soulcrate: { config: { read(): Promise<unknown> }; setup: { status(): Promise<unknown> } };
      }
    ).soulcrate;
    return JSON.stringify({ config: await api.config.read(), setup: await api.setup.status() });
  });
  expect(lido).toContain('dj_teste'); // o usuário não é segredo
  for (const s of segredos) expect(lido).not.toContain(s);

  // nem depois de gravar (o resultado da gravação e o do setup)
  const gravado = await janela.evaluate(async () => {
    const api = (
      window as unknown as {
        soulcrate: {
          config: {
            read(): Promise<{ pastas: unknown; tz: string; puid: string; pgid: string } | null>;
            write(e: unknown): Promise<unknown>;
          };
        };
      }
    ).soulcrate;
    const c = await api.config.read();
    if (!c) return '';
    const r = await api.config.write({
      pastas: c.pastas,
      slskUsuario: 'dj_teste',
      slskSenha: '',
      webUsuario: 'admin',
      webSenha: '',
      regenerarChaves: true,
      tz: c.tz,
      puid: c.puid,
      pgid: c.pgid,
      musicbrainzContato: '',
      abrirParaRede: false,
    });
    return JSON.stringify(r);
  });
  expect(gravado).toContain('"ok":true');
  const novo = lerEnv(join(amb.projeto, '.env'));
  expect(novo.SLSKD_API_KEY_SOULBEET).not.toBe(env.SLSKD_API_KEY_SOULBEET); // trocou de verdade
  for (const s of [...segredos, novo.SLSKD_API_KEY_SOULBEET, novo.SOULBEET_SECRET_KEY] as string[]) {
    expect(gravado).not.toContain(s);
  }
});
