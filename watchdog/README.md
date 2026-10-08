# YANSIX Watchdog de Infraestrutura — v0

Módulo independente de monitoramento de infraestrutura.

## Princípios
- monitoramento separado de prevenção e recuperação;
- nenhuma credencial real no código;
- execução independente do painel;
- falhas de autenticação não são tratadas como indisponibilidade;
- recuperação ainda não conectada ao fluxo principal; o adapter existe somente como camada isolada e testável;
- resultados devem ser verificáveis e auditáveis;
- configuração por ambiente/Secrets, nunca por código.

## Estados canônicos
- healthy
- unavailable
- paused
- authentication_error
- timeout
- configuration_error
- unknown

## Fluxo
1. carregar definição dos serviços;
2. executar checks;
3. normalizar resultado;
4. classificar estado;
5. avaliar política de recovery (quando habilitada);
6. produzir eventos/alertas;
7. gerar resumo da execução;
8. futuramente persistir no painel e acionar recuperação autorizada após verificação do endpoint do provedor.

## Supabase
Quando houver um token de Management API configurado, o Watchdog usa o endpoint oficial de health do projeto para consultar o estado da infraestrutura. Isso permite separar o estado operacional do projeto de uma simples requisição HTTP.

Cada grupo de projetos pode usar um Secret diferente, permitindo aplicar tokens com escopo mínimo. Os tokens nunca ficam no arquivo de configuração.

Sem Management API token, o adapter mantém um fallback HTTP usando a URL e a chave pública configuradas para o projeto. Esse fallback é útil para disponibilidade, mas não deve ser interpretado como equivalente à leitura do estado de infraestrutura pela Management API.

Os projetos Supabase cadastrados no inventário são referências públicas de projeto; nenhuma chave ou token é armazenado no repositório.

## v0
A primeira versão é somente leitura. Ela pode ser executada manualmente no GitHub Actions sem nenhuma credencial configurada. O resolvedor de configuração identifica cada serviço como `ready` ou `credentials_pending` sem imprimir valores sensíveis; serviços pendentes aparecem como `configuration_error` apenas para registrar a ausência de configuração, não como falha da infraestrutura. Não há tentativa de recuperação.

Ainda não configuramos Secrets reais nem habilitamos execução agendada.


## Recovery v0 — segurança

A recuperação possui duas camadas de autorização:

1. o serviço precisa estar explicitamente habilitado;
2. `recovery.enabled` precisa estar explicitamente habilitado.

Além disso, a política pode restringir a recuperação por `projectRef`.

Nesta etapa, somente o projeto Cashback está configurado para recovery na configuração de exemplo. O ENEM permanece desabilitado e com recovery desabilitado, mesmo compartilhando o mesmo token de conta.

O adapter de recovery **não está conectado ao `main.mjs`**. A documentação pública atual da Supabase confirma a retomada pelo Dashboard, mas não confirma o endpoint `POST /v1/projects/{ref}/restore` previsto no desenho inicial. Portanto, nenhum restore real é executado nesta etapa. citeturn0search11turn0search0
