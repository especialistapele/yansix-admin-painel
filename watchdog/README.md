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

## v0
A primeira versão é somente leitura. Ela pode ser executada manualmente no GitHub Actions sem nenhuma credencial configurada. Serviços sem configuração ficam como `configuration_error`, sem tentativa de recuperação.
