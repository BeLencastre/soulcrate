// Modo DJ e Modo Dev: qual vale, o que o assistente propõe, as seções de Configurações de cada um e as regras do
// Início e de Serviços no Modo DJ (protótipos "modos-dev-dj").
import { describe, expect, it } from 'vitest';
import type { HealthCheckResult } from '../../src/shared/ipc';
import { msgDj } from '../../src/shared/mensagens-dj';
import {
  ehSecaoConfig,
  MODO_RECOMENDADO,
  MODO_SEM_ESCOLHA,
  modoEfetivo,
  modoProposto,
  outroModo,
  secaoExisteNoModo,
  secaoNoModo,
  SECOES_DO_MODO,
} from '../../src/shared/modo';
import {
  cartoesDeServicoDj,
  numeroDoPasso,
  precisaAtencao,
  situacaoDj,
  type CartaoServicoDj,
} from '../../src/shared/painel-dj';
import { statusInicial, type ContainerEstado, type Saude, type StackStatus } from '../../src/shared/stack';

function status(parcial: Partial<StackStatus> = {}): StackStatus {
  return {
    ...statusInicial(),
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

type Estados = Partial<Record<'slskd' | 'soulbeet' | 'navidrome', { c?: ContainerEstado; s?: Saude; http?: boolean }>>;

/** Todos no ar e saudáveis, com as exceções dadas. */
function noAr(excecoes: Estados = {}, resto: Partial<StackStatus> = {}): StackStatus {
  const base = status(resto);
  return {
    ...base,
    servicos: base.servicos.map((s) => {
      const e = excecoes[s.id] ?? {};
      const container = e.c ?? 'running';
      return {
        ...s,
        container,
        saude: e.s ?? 'healthy',
        http: e.http ?? (container === 'running' ? true : null),
        statusTexto: 'Up',
      };
    }),
  };
}

describe('qual modo vale', () => {
  it('sem escolha registrada vale o Modo Dev (quem já usava o app não vê nada mudar)', () => {
    expect(MODO_SEM_ESCOLHA).toBe('dev');
    expect(modoEfetivo({ modo: null })).toBe('dev');
    expect(modoEfetivo(undefined)).toBe('dev');
    expect(modoEfetivo({ modo: 'dj' })).toBe('dj');
    expect(modoEfetivo({ modo: 'dev' })).toBe('dev');
  });

  it('o assistente propõe o Modo DJ a quem nunca escolheu, e repete a escolha de quem já escolheu', () => {
    expect(MODO_RECOMENDADO).toBe('dj');
    expect(modoProposto({ modo: null })).toBe('dj');
    expect(modoProposto(undefined)).toBe('dj');
    expect(modoProposto({ modo: 'dev' })).toBe('dev');
  });

  it('outroModo alterna', () => {
    expect(outroModo('dj')).toBe('dev');
    expect(outroModo('dev')).toBe('dj');
  });
});

describe('seções de Configurações', () => {
  it('o Modo DJ só tem "Suas coisas" e as do app; o Dev mantém as seis da stack', () => {
    expect(SECOES_DO_MODO.dj.stack).toEqual(['pastas', 'soulseek', 'compartilhamento']);
    expect(SECOES_DO_MODO.dev.stack).toEqual(['conferencia', 'pastas', 'soulseek', 'webui', 'rede', 'avancado']);
    expect(SECOES_DO_MODO.dj.app).toEqual(SECOES_DO_MODO.dev.app);
  });

  it('seção que o modo não tem cai na equivalente ou volta para a inicial (null)', () => {
    expect(secaoNoModo('pastas', 'dj')).toBe('pastas');
    expect(secaoNoModo('rede', 'dj')).toBe('compartilhamento');
    expect(secaoNoModo('compartilhamento', 'dev')).toBe('rede');
    expect(secaoNoModo('conferencia', 'dj')).toBeNull();
    expect(secaoNoModo('avancado', 'dj')).toBeNull();
    expect(secaoNoModo('webui', 'dj')).toBeNull();
    expect(secaoNoModo('sobre', 'dj')).toBe('sobre');
    expect(secaoExisteNoModo('compartilhamento', 'dev')).toBe(false);
  });

  it('só aceita seções conhecidas vindas do endereço', () => {
    expect(ehSecaoConfig('compartilhamento')).toBe(true);
    expect(ehSecaoConfig('rede')).toBe(true);
    expect(ehSecaoConfig('xpto')).toBe(false);
    expect(ehSecaoConfig(null)).toBe(false);
  });
});

describe('Início no Modo DJ: a situação do cabeçalho', () => {
  it('cada estado da stack vira uma situação com o único botão que resolve', () => {
    expect(situacaoDj(statusInicial()).tipo).toBe('verificando');
    expect(situacaoDj(noAr()).tipo).toBe('ligado');
    expect(situacaoDj(status()).tipo).toBe('desligado');
    expect(situacaoDj(status({ docker: { ...status().docker, engine: false } })).tipo).toBe('docker-fechado');
    expect(situacaoDj(status({ docker: { ...status().docker, instalacao: 'ausente' } })).tipo).toBe('docker-ausente');
    expect(situacaoDj(status({ projeto: { dir: null, origem: null } })).tipo).toBe('sem-projeto');
    expect(situacaoDj(status({ operacao: 'desligando' })).tipo).toBe('desligando');
  });

  it('configuração inválida com a stack desligada: completar, e diz quando o que falta é a senha', () => {
    const achado = { id: 'x', nivel: 'erro' as const, arquivo: '.env' as const, mensagem: 'falta' };
    const semSenha = status({
      configuracao: { estado: 'invalida', erros: 1, avisos: 0, achados: [{ ...achado, variavel: 'SLSK_PASSWORD' }] },
    });
    expect(situacaoDj(semSenha)).toEqual({ tipo: 'config-incompleta', faltaSenha: true });
    const outra = status({
      configuracao: { estado: 'invalida', erros: 1, avisos: 0, achados: [{ ...achado, variavel: 'TZ' }] },
    });
    expect(situacaoDj(outra)).toEqual({ tipo: 'config-incompleta', faltaSenha: false });
  });

  it('ligando: Docker abrindo (1), preparando (2), contêineres subindo (3) e esperando responder (4)', () => {
    const abrindo = status({ docker: { ...status().docker, engine: false, abrindo: { desdeMs: 0 } } });
    expect(situacaoDj(abrindo)).toEqual({ tipo: 'ligando', passo: 'docker' });
    expect(situacaoDj(status({ operacao: 'ligando' }), ['#5 building'])).toEqual({
      tipo: 'ligando',
      passo: 'preparando',
    });
    expect(situacaoDj(status({ operacao: 'reconstruindo' }), [' Container soulcrate-slskd  Started'])).toEqual({
      tipo: 'ligando',
      passo: 'subindo',
    });
    expect(situacaoDj(noAr({ navidrome: { s: 'starting' } }))).toEqual({ tipo: 'ligando', passo: 'respondendo' });
    expect(['docker', 'preparando', 'subindo', 'respondendo'].map((p) => numeroDoPasso(p as never))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('serviço parado ou sem resposta: diz qual, pelo que ele faz', () => {
    const sit = situacaoDj(noAr({ navidrome: { s: 'unhealthy' } }));
    expect(sit).toEqual({ tipo: 'com-problema', servicos: ['navidrome'] });
    expect(msgDj.inicio.cabecalho(sit, { baixarFunciona: true })).toEqual({
      titulo: 'O player não está respondendo',
      subtitulo: 'Baixar continua funcionando. Reiniciar costuma resolver em menos de 1 minuto.',
    });
    const dois = situacaoDj(noAr({ slskd: { c: 'exited' }, navidrome: { c: 'exited' } }));
    expect(msgDj.inicio.cabecalho(dois, { baixarFunciona: false }).titulo).toBe(
      'A busca e o player não estão respondendo',
    );
  });
});

describe('Serviços no Modo DJ: um cartão por coisa que a pessoa usa', () => {
  const check = (id: HealthCheckResult['id'], estado: HealthCheckResult['estado']): HealthCheckResult => ({
    id,
    estado,
    itens: [],
    nota: null,
  });
  const estados = (cs: CartaoServicoDj[]) => Object.fromEntries(cs.map((c) => [c.id, c.estado]));

  it('tudo funcionando: cinco cartões ok, nenhum pede atenção', () => {
    const cs = cartoesDeServicoDj(noAr(), [check('plugins', 'ok'), check('pastas', 'ok')], 10);
    expect(cs.map((c) => c.id)).toEqual(['soulbeet', 'slskd', 'navidrome', 'compartilhamento', 'pastas']);
    expect(cs.every((c) => c.estado === 'ok')).toBe(true);
    expect(cs.filter(precisaAtencao)).toHaveLength(0);
  });

  it('organizador lento, player parado, nada compartilhado e pastas que não batem pedem atenção', () => {
    const cs = cartoesDeServicoDj(
      noAr({ soulbeet: { http: false }, navidrome: { c: 'exited' } }),
      [check('pastas', 'erro')],
      0,
    );
    expect(estados(cs)).toEqual({
      soulbeet: 'lento',
      slskd: 'ok',
      navidrome: 'parado',
      compartilhamento: 'zero',
      pastas: 'problema',
    });
    expect(cs.filter(precisaAtencao)).toHaveLength(4);
  });

  it('organizador sem plugins é "incompleto"; sem verificações ainda, pastas e compartilhamento ficam sem informação', () => {
    const cs = cartoesDeServicoDj(noAr(), [check('plugins', 'erro')], undefined);
    expect(estados(cs)).toMatchObject({
      soulbeet: 'incompleto',
      compartilhamento: 'desconhecido',
      pastas: 'desconhecido',
    });
    const comBuscaFora = cartoesDeServicoDj(noAr({ slskd: { s: 'starting' } }), [], 12);
    expect(estados(comBuscaFora)).toMatchObject({ slskd: 'ligando', compartilhamento: 'desconhecido' });
    expect(precisaAtencao({ id: 'slskd', estado: 'ligando' })).toBe(false);
  });

  it('o título conta o que precisa de atenção', () => {
    expect(msgDj.servicos.titulo.atencao(1)).toBe('Uma coisa precisa de atenção');
    expect(msgDj.servicos.titulo.atencao(3)).toBe('3 coisas precisam de atenção');
    expect(msgDj.servicos.subtitulo(1, 1)).toBe('Conferido há 1 s. O resto está funcionando normalmente.');
  });
});

describe('barra lateral no Modo DJ', () => {
  it('uma frase no lugar dos serviços e das portas', () => {
    expect(msgDj.barraLateral.estado({ ...base(), motivo: 'no-ar' })).toEqual({
      titulo: 'Ligado',
      detalhe: 'Pronto para baixar e ouvir',
    });
    expect(msgDj.barraLateral.estado({ ...base(), motivo: 'servico-parou', servicos: ['soulbeet'] }).detalhe).toBe(
      'O organizador não está respondendo',
    );
    expect(msgDj.barraLateral.estado({ ...base(), motivo: 'operacao', operacao: 'desligando' }).titulo).toBe(
      'Desligando…',
    );
  });

  function base() {
    return {
      estado: 'no-ar' as const,
      nivel: 'verde' as const,
      servicos: [],
      operacao: null,
      saudaveis: 3,
      total: 3,
    };
  }
});
