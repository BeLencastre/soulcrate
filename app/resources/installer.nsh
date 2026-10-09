; Soulcrate: regras do instalador e do desinstalador (Fase 7, §5). O electron-builder inclui este arquivo sozinho.
;
; Desinstalar NUNCA apaga a pasta do Soulcrate (o .env, as listas, os relatórios em lotes/, a biblioteca e os downloads).
; Ela é do usuário, pode estar em outro disco, e o desinstalador não tem como saber o que mais mora ali. O que ele
; pergunta é se também remove os dados do PRÓPRIO app (preferências e logs, em %APPDATA%\Soulcrate), com o padrão em
; "Não" (manter). Em desinstalação silenciosa (/S) nada é perguntado e nada é apagado, a menos que se passe
; --delete-app-data (um recurso do próprio electron-builder).
; Quando o instalador novo troca a versão antiga (atualização), o desinstalador roda com --updated: não pergunta nada.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Remover também as preferências e os logs do app?$\r$\n$\r$\n($APPDATA\Soulcrate)$\r$\n$\r$\nA pasta do Soulcrate (o .env, as listas, os relatórios e a biblioteca) NÃO será apagada: ela continua no seu PC." /SD IDNO IDYES soulcrateApagarDadosDoApp IDNO soulcrateManterDadosDoApp
    soulcrateApagarDadosDoApp:
      RMDir /r "$APPDATA\Soulcrate"
    soulcrateManterDadosDoApp:
  ${endIf}
!macroend
