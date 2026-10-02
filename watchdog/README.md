# YANSIX Watchdog de Infraestrutura — v0

Módulo independente de monitoramento de infraestrutura.

## Princípios
- monitoramento separado de prevenção e recuperação;
- nenhuma credencial real no código;
- execução independente do painel;
- falhas de autenticação não são tratadas como indisponibilidade;
- nenhuma ação de recuperação nesta versão;
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
5. produzir eventos/alertas;
6. gerar resumo da execução;
7. futuramente persistir no painel e acionar prevenção/recuperação autorizadas.

## Supabase
Quando houver um token de Management API configurado, o Watchdog usa o endpoint oficial de health do projeto para consultar o estado da infraestrutura. Isso permite separar o estado operacional do projeto de uma simples requisição HTTP.

Cada grupo de projetos pode usar um Secret diferente, permitindo aplicar tokens com escopo mínimo. Os tokens nunca ficam no arquivo de configuração.

Sem Management API token, o adapter mantém um fallback HTTP usando a URL e a chave pública configuradas para o projeto. Esse fallback é útil para disponibilidade, mas não deve ser interpretado como equivalente à leitura do estado de infraestrutura pela Management API.

Os projetos Supabase cadastrados no inventário são referências públicas de projeto; nenhuma chave ou token é armazenado no repositório.

## v0
A primeira versão é somente leitura. Ela pode ser executada manualmente no GitHub Actions sem nenhuma credencial configurada. Serviços sem configuração ficam como `configuration_error`, sem tentativa de recuperação.

Ainda não configuramos Secrets reais nem habilitamos execução agendada.
