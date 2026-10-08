import { describe, expect, it } from 'vitest';
import { listaDoArgv } from '../../src/main/argv';

const existe =
  (...arquivos: string[]) =>
  (p: string) =>
    arquivos.includes(p);

describe('listaDoArgv ("Abrir com")', () => {
  it('acha o primeiro .txt ou .csv que existe', () => {
    expect(listaDoArgv(['C:\\App\\Soulcrate.exe', 'C:\\Users\\dj\\set.txt'], existe('C:\\Users\\dj\\set.txt'))).toBe(
      'C:\\Users\\dj\\set.txt',
    );
    expect(listaDoArgv(['x.exe', 'a.CSV', 'b.txt'], existe('a.CSV', 'b.txt'))).toBe('a.CSV');
  });

  it('o executável (argv[0]) nunca conta, mesmo que termine em .txt', () => {
    expect(listaDoArgv(['lista.txt'], existe('lista.txt'))).toBeNull();
  });

  it('ignora opções, arquivos que não existem e outras extensões', () => {
    const argv = ['x.exe', '--smoke-test', '--user-data-dir=C:\\x.txt', 'fantasma.txt', 'musica.mp3', 'ok.txt'];
    expect(listaDoArgv(argv, existe('musica.mp3', 'ok.txt'))).toBe('ok.txt');
    expect(listaDoArgv(['x.exe', 'fantasma.txt'], existe())).toBeNull();
    expect(listaDoArgv(['x.exe'], existe())).toBeNull();
  });
});
