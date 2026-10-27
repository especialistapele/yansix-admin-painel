# YANSIX Watchdog de Infraestrutura

Módulo de monitoramento e recuperação controlada da infraestrutura do ecossistema YANSIX. O workflow roda pelo GitHub Actions, publica um artefato de relatório e persiste o histórico no Supabase central do painel.

## Monitoramento

- Verifica os projetos Supabase habilitados usando a Management API quando há token configurado.
- Verifica o estado da instância KALATRACE Neo4j Aura.
- Registra estado, latência, motivo, eventos e resumo por execução.
- A execução agendada ocorre a cada 30 minutos.
- Estados como `configuration_error` podem indicar um serviço intencionalmente desativado; isso não significa necessariamente indisponibilidade.

## Política de recuperação automática

A recuperação exige **todas** as proteções aplicáveis: o serviço deve estar habilitado, sua configuração individual deve permitir recuperação, o projeto precisa constar na lista individual de projetos autorizados e o identificador do serviço precisa estar na allowlist do workflow.

A allowlist atual do workflow autoriza:
- Supabase: Especialista em Pele, YansixPainelCRM, Banco Cashback, Sistema ENEM, YANSIX CRM, Fazendinha, Hora do Pão e KALATRACE Supabase.
- Neo4j Aura: KALATRACE Neo4j.

Para os serviços Supabase autorizados, o fluxo permite no máximo uma tentativa por execução e verifica o estado após a solicitação. O KALATRACE Neo4j tem política própria, com até seis tentativas e verificação do estado operacional. A recuperação só deve ser considerada concluída após a verificação posterior confirmar que o serviço está operacional.

**Exceções explícitas:**
- **Buscador CNPJ:** monitorado normalmente, mas recuperação automática desabilitada, com zero tentativas e sem projetos permitidos.
- **Buscador_site:** serviço desabilitado e excluído do monitoramento ativo e da recuperação.

Tokens de Management API, credenciais Neo4j e a chave privilegiada do Supabase central ficam somente nos GitHub Actions Secrets. Nunca coloque segredos no repositório, no frontend ou nos relatórios.

## Histórico no painel

O painel `admin.yansix.tech` lê as últimas 20 execuções de `public.watchdog_runs` no projeto Supabase central `mwjkvtuvnzzyuddzjbnu`. A persistência usa o segredo `WATCHDOG_PANEL_SUPABASE_SERVICE_ROLE`; se estiver indisponível, o workflow ainda publica o relatório como artefato do GitHub Actions, mas a execução não aparecerá no histórico do painel.

Os registros do banco e os artefatos têm retenção alvo de 60 dias. O workflow remove registros antigos do banco a cada persistência e tem uma rotina periódica de limpeza das execuções antigas do GitHub Actions.

## Acionamento manual

O botão **Verificar agora** chama a Edge Function `watchdog-dispatch`, que exige sessão autenticada, valida o e-mail do operador autorizado e aceita apenas a ação fixa `run-checks`. O token do GitHub fica no segredo `WATCHDOG_GITHUB_TOKEN` da Edge Function.

O acionamento manual inicia o mesmo workflow que contém a política de recuperação; portanto, serviços pausados que estejam na allowlist podem ser recuperados. O botão exige confirmação e a mensagem de aceite significa apenas que o GitHub aceitou a solicitação. Depois, confirme o término e o resultado da execução no GitHub Actions e no histórico do painel.
