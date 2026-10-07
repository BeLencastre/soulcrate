import { describe, expect, it } from 'vitest';
import { criarErro, erroInesperado } from '../../src/shared/erros';
import { juntar, msg, rotuloResumo } from '../../src/shared/mensagens';
import {
  acoesDisponiveis,
  derivarEtapas,
  resumirStack,
  servicoSaudavel,
  statusInicial,
  type ContainerEstado,
  type Saude,
  type StackStatus,
} from '../../src/shared/stack';

/** Estado base: Docker de pé, pasta e configuração ok, stack desligada. */
function status(parcial: Partial<StackStatus> = {}): StackStatus {
  const base = statusInicial();
  return {
    ...base,
    atualizadoEm: 1,
    projeto: { dir: 'C:\\Soulcrate', origem: 'configurada' },
    docker: {
      instalacao: 'ok',
      desktop: 'aberto',
      engine: true,
      versaoServidor: '29.0.0',
      compose: '5.0.0',
      abrindo: null,
    },
    configuracao: { estado: 'valida', erros: 0, avisos: 0, achados: [] },
    ...parcial,
  };
}

function comServicos(
  estados: Partial<
    Record<'slskd' | 'soulbeet' | 'navidrome', { c?: ContainerEstado; s?: Saude; http?: boolean | null }>
  >,
  resto: Partial<StackStatus> = {},
): StackStatus {
  const base = status(resto);
  return {
    ...base,
    servicos: base.servicos.map((s) => {
      const e = estados[s.id];
      return e
        ? { ...s, container: e.c ?? 'running', saude: e.s ?? 'healthy', http: e.http === undefined ? true : e.http }
        : s;
    }),
  };
}

const TODOS = { slskd: {}, soulbeet: {}, navidrome: {} };

describe('antes da primeira sondagem', () => {
  it('não afirma nada: "verificando", sem alarme de Docker fechado e sem ações', () => {
    const inicial = statusInicial();
    expect(inicial.atualizadoEm).toBe(0);
    const r = resumirStack(inicial);
    expect(r).toMatchObject({ estado: 'verificando', nivel: 'cinza', motivo: 'verificando' });
    expect(rotuloResumo(r)).toBe('Verificando…');
    expect(derivarEtapas(inicial).map((e) => [e.estado, e.detalhe, e.acao])).toEqual(
      Array(5).fill(['aguardando', 'verificando', null]),
    );
    expect(acoesDisponiveis({ ...status(), atualizadoEm: 0 })).toEqual({
      ligar: false,
      desligar: false,
      reconstruir: false,
    });
  });

  it('depois da primeira sondagem vale o que foi medido (Docker fechado volta a ser Docker fechado)', () => {
    const fechado = status({ atualizadoEm: 5, docker: { ...status().docker, engine: false } });
    expect(resumirStack(fechado).motivo).toBe('docker-fechado');
  });
});

describe('resumirStack', () => {
  it('desligada: nenhum contêiner', () => {
    const r = resumirStack(status());
    expect(r).toMatchObject({ estado: 'desligada', nivel: 'cinza', motivo: 'desligada' });
    expect(rotuloResumo(r)).toBe('Desligada');
  });

  it('no ar: os três saudáveis → verde, "3/3 saudáveis"', () => {
    const r = resumirStack(comServicos(TODOS));
    expect(r).toMatchObject({ estado: 'no-ar', nivel: 'verde', saudaveis: 3, total: 3 });
    expect(rotuloResumo(r)).toBe('No ar · 3/3 saudáveis');
  });

  it('Docker ausente e Docker fechado são erro (vermelho)', () => {
    expect(
      rotuloResumo(resumirStack(status({ docker: { ...status().docker, instalacao: 'ausente', engine: false } }))),
    ).toBe('Docker não encontrado');
    const fechado = resumirStack(status({ docker: { ...status().docker, engine: false, desktop: 'fechado' } }));
    expect(fechado).toMatchObject({ estado: 'erro', nivel: 'vermelho', motivo: 'docker-fechado' });
    expect(rotuloResumo(fechado)).toBe('Docker fechado');
  });

  it('abrindo o Docker Desktop e operações em curso são "ligando" (amarelo)', () => {
    const abrindo = resumirStack(status({ docker: { ...status().docker, engine: false, abrindo: { desdeMs: 1 } } }));
    expect(abrindo).toMatchObject({ estado: 'ligando', nivel: 'amarelo', motivo: 'docker-abrindo' });
    expect(rotuloResumo(resumirStack(status({ operacao: 'ligando' })))).toBe('Ligando…');
    expect(rotuloResumo(resumirStack(status({ operacao: 'desligando' })))).toBe('Desligando…');
    expect(rotuloResumo(resumirStack(status({ operacao: 'reconstruindo' })))).toBe('Reconstruindo…');
  });

  it('sem pasta do Soulcrate: atenção', () => {
    const r = resumirStack(status({ projeto: { dir: null, origem: null } }));
    expect(r).toMatchObject({ estado: 'atencao', nivel: 'amarelo', motivo: 'sem-projeto' });
  });

  it('docker stop slskd por fora: erro, citando o serviço (critério de aceite da Fase 1)', () => {
    const r = resumirStack(
      comServicos({ slskd: { c: 'exited', s: 'nenhuma', http: null }, soulbeet: {}, navidrome: {} }),
    );
    expect(r).toMatchObject({ estado: 'erro', nivel: 'vermelho', motivo: 'servico-parou', servicos: ['slskd'] });
    expect(rotuloResumo(r)).toBe('slskd parou');
  });

  it('vários parados usam o plural e a lista em português', () => {
    const r = resumirStack(
      comServicos({
        slskd: { c: 'exited', s: 'nenhuma', http: null },
        soulbeet: { c: 'exited', s: 'nenhuma', http: null },
        navidrome: {},
      }),
    );
    expect(rotuloResumo(r)).toBe('slskd e Soulbeet pararam');
  });

  it('de pé mas sem responder: erro "não responde"', () => {
    const unhealthy = resumirStack(comServicos({ slskd: { s: 'unhealthy' }, soulbeet: {}, navidrome: {} }));
    expect(unhealthy).toMatchObject({ motivo: 'servico-nao-responde', servicos: ['slskd'], nivel: 'vermelho' });
    expect(rotuloResumo(unhealthy)).toBe('slskd não responde');
    const semHttp = resumirStack(comServicos({ slskd: {}, soulbeet: { http: false }, navidrome: {} }));
    expect(semHttp.motivo).toBe('servico-nao-responde');
  });

  it('subindo (healthcheck "starting") é amarelo, e HTTP fora do ar durante o start não é erro', () => {
    const r = resumirStack(
      comServicos({
        slskd: { s: 'starting', http: false },
        soulbeet: { s: 'starting', http: false },
        navidrome: { s: 'starting', http: false },
      }),
    );
    expect(r).toMatchObject({ estado: 'ligando', nivel: 'amarelo', motivo: 'iniciando' });
  });

  it('um serviço saudável exige contêiner rodando, healthcheck ok e HTTP respondendo', () => {
    const base = {
      ...status().servicos[0],
      id: 'slskd' as const,
      container: 'running' as const,
      saude: 'healthy' as const,
      http: true,
      statusTexto: null,
    };
    expect(servicoSaudavel({ ...base, container: 'running', saude: 'healthy', http: true })).toBe(true);
    expect(servicoSaudavel({ ...base, container: 'running', saude: 'nenhuma', http: true })).toBe(true);
    expect(servicoSaudavel({ ...base, container: 'running', saude: 'healthy', http: false })).toBe(false);
    expect(servicoSaudavel({ ...base, container: 'exited', saude: 'nenhuma', http: null })).toBe(false);
  });
});

describe('derivarEtapas', () => {
  const por = (s: StackStatus) => Object.fromEntries(derivarEtapas(s).map((e) => [e.id, e]));

  it('tudo no ar: as cinco etapas ok, sem ação', () => {
    const e = derivarEtapas(comServicos(TODOS));
    expect(e.map((x) => x.estado)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(e.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5]);
    expect(e.every((x) => x.acao === null)).toBe(true);
  });

  it('Docker ausente: baixar o Docker; o resto aguarda', () => {
    const e = por(status({ docker: { ...status().docker, instalacao: 'ausente', engine: false } }));
    expect(e.docker).toMatchObject({ estado: 'erro', detalhe: 'docker-ausente', acao: 'baixarDocker' });
    expect(e.desktop?.estado).toBe('aguardando');
    expect(e.stack?.estado).toBe('aguardando');
  });

  it('Docker instalado fora do PATH tem explicação própria', () => {
    expect(
      por(status({ docker: { ...status().docker, instalacao: 'fora-do-path', engine: false } })).docker?.detalhe,
    ).toBe('docker-fora-do-path');
  });

  it('Docker Desktop fechado oferece abrir; abrindo mostra o progresso (sem ação)', () => {
    const fechado = por(status({ docker: { ...status().docker, engine: false, desktop: 'fechado' } }));
    expect(fechado.desktop).toMatchObject({ estado: 'erro', acao: 'abrirDockerDesktop', detalhe: 'desktop-fechado' });
    expect(fechado.stack?.estado).toBe('aguardando');
    const abrindo = por(status({ docker: { ...status().docker, engine: false, abrindo: { desdeMs: 1 } } }));
    expect(abrindo.desktop).toMatchObject({ estado: 'trabalhando', acao: null, detalhe: 'desktop-abrindo' });
  });

  it('configuração: sem pasta, inválida (leva ao assistente) e com avisos', () => {
    expect(
      por(
        status({
          projeto: { dir: null, origem: null },
          configuracao: { estado: 'sem-projeto', erros: 0, avisos: 0, achados: [] },
        }),
      ).configuracao,
    ).toMatchObject({
      estado: 'erro',
      acao: 'escolherPasta',
    });
    expect(
      por(status({ configuracao: { estado: 'invalida', erros: 2, avisos: 0, achados: [] } })).configuracao,
    ).toMatchObject({
      estado: 'erro',
      acao: 'abrirConfiguracoes',
      detalhe: 'config-invalida',
    });
    expect(
      por(status({ configuracao: { estado: 'valida', erros: 0, avisos: 1, achados: [] } })).configuracao,
    ).toMatchObject({ estado: 'atencao', detalhe: 'config-ok-avisos' });
  });

  it('stack desligada oferece Ligar; ligando não oferece nada', () => {
    expect(por(status()).stack).toMatchObject({ estado: 'desligada', acao: 'ligar' });
    expect(por(status({ operacao: 'ligando' })).stack).toMatchObject({ estado: 'trabalhando', acao: null });
  });

  it('stack parcial (docker stop por fora): etapa 4 e 5 com erro', () => {
    const e = por(comServicos({ slskd: { c: 'exited', s: 'nenhuma', http: null }, soulbeet: {}, navidrome: {} }));
    expect(e.stack).toMatchObject({ estado: 'erro', detalhe: 'stack-parcial', acao: 'ligar' });
    expect(e.servicos).toMatchObject({ estado: 'erro', acao: 'verServicos' });
  });

  it('serviços subindo: etapa 5 "trabalhando"', () => {
    const e = por(
      comServicos({
        slskd: { s: 'starting', http: false },
        soulbeet: { s: 'starting', http: false },
        navidrome: { s: 'starting', http: false },
      }),
    );
    expect(e.servicos?.estado).toBe('trabalhando');
  });
});

describe('acoesDisponiveis', () => {
  it('desligada: só Ligar e Reconstruir', () => {
    expect(acoesDisponiveis(status())).toEqual({ ligar: true, desligar: false, reconstruir: true });
  });
  it('no ar: Desligar e Reconstruir; Ligar não faz nada', () => {
    expect(acoesDisponiveis(comServicos(TODOS))).toEqual({ ligar: false, desligar: true, reconstruir: true });
  });
  it('parcial: Ligar sobe o que falta', () => {
    expect(
      acoesDisponiveis(comServicos({ slskd: { c: 'exited', s: 'nenhuma', http: null }, soulbeet: {}, navidrome: {} }))
        .ligar,
    ).toBe(true);
  });
  it('nada vale sem Docker, sem pasta ou durante uma operação', () => {
    const nada = { ligar: false, desligar: false, reconstruir: false };
    expect(acoesDisponiveis(status({ docker: { ...status().docker, engine: false } }))).toEqual(nada);
    expect(acoesDisponiveis(status({ projeto: { dir: null, origem: null } }))).toEqual(nada);
    expect(acoesDisponiveis(status({ operacao: 'ligando' }))).toEqual(nada);
  });
});

describe('catálogo de erros e mensagens', () => {
  it('cada erro tem título, explicação e uma ação primária', () => {
    const codigos = [
      'docker.ausente',
      'docker.fora-do-path',
      'docker.fechado',
      'docker.timeout',
      'compose.ausente',
      'projeto.ausente',
      'config.invalida',
      'porta.em-uso',
      'servico.inacessivel',
      'operacao.falhou',
      'inesperado',
    ] as const;
    for (const c of codigos) {
      const e = criarErro(c, { porta: '5030', servico: 'slskd', problemas: 2 });
      expect(e.titulo.length, c).toBeGreaterThan(3);
      expect(e.mensagem.length, c).toBeGreaterThan(10);
      expect(
        e.acoes.filter((a) => a.primaria),
        c,
      ).toHaveLength(1);
      expect(msg.erro.categoria[c]).toBeTruthy();
    }
  });

  it('porta em uso cita a porta; configuração inválida concorda o número', () => {
    expect(criarErro('porta.em-uso', { porta: '2234' }).titulo).toBe('A porta 2234 já está em uso');
    expect(criarErro('config.invalida', { problemas: 1 }).mensagem).toContain('tem 1 problema');
    expect(criarErro('config.invalida', { problemas: 3 }).mensagem).toContain('têm 3 problemas');
  });

  it('erro inesperado oferece copiar detalhes e abrir o log, nunca só a pilha', () => {
    const e = erroInesperado(new Error('boom'));
    expect(e.acoes.map((a) => a.id)).toEqual(['copiarDetalhes', 'abrirLog']);
    expect(e.detalhes).toContain('boom');
    expect(e.mensagem).not.toContain('boom');
  });

  it('lista em português', () => {
    expect(juntar(['a', 'b'])).toBe('a e b');
    expect(juntar(['a', 'b', 'c'])).toBe('a, b e c');
  });
});
