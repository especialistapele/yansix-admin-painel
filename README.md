# YANSIX — Painel Central de CRMs

Painel administrativo único (só você acessa) — **estatístico/monitoramento**,
não gerencia o ciclo de vida dos CRMs. Ele registra quais CRMs existem
(pra saber o que consultar) e mostra números: storage usado e quantidade
de administradores/gestores/vendedores de cada cliente.

Publicado em: **https://admin.yansix.tech**
Repositório: `especialistapele/yansix-admin-painel`

---

## Status desta instalação

| Item | Status |
|---|---|
| Domínio `admin.yansix.tech` (GitHub Pages + HTTPS) | ✅ Pronto |
| `js/config.js` preenchido com o Supabase do painel | ✅ Pronto |
| Schema SQL (`clientes`, `crms`, `crm_metrica_snapshot`, `alertas`) | ✅ Aplicado |
| Usuário administrador do painel | ✅ Criado (`yansix.tech@gmail.com`) |

**Projeto Supabase do painel** (nunca usar isso para nenhum CRM de cliente):
- Project URL: `https://mwjkvtuvnzzyuddzjbnu.supabase.co`
- Chave usada no `config.js`: publicável (`anon` / `publishable`) — nunca a `service_role`.

Acesse `https://admin.yansix.tech` e entre com o e-mail/senha cadastrados
em Authentication → Users desse projeto.

## O que o painel faz

- Login único (Supabase Auth), sem cadastro de outros perfis.
- **Clientes** — cadastro simples (nome, responsável, e-mail), só pra
  organizar a quem cada CRM pertence.
- **CRMs** — cadastro simples (cliente, identificador, URL pública, URL +
  anon key do Supabase daquele cliente). Isso só registra o que existe
  pra o painel poder consultar — não cria, não publica, não configura
  nada em lugar nenhum.
- **Monitoramento** — por CRM, botão **"Verificar agora"**: consulta ao
  vivo o Supabase daquele cliente (usando só a `anon key` já cadastrada,
  sem login, sem `service_role`) e traz:
  - Storage usado (%)
  - Administradores (♔), Gestores (♗), Vendedores (♙) cadastrados
  Depende da função `obter_status_operacional()` existir no Supabase do
  cliente — ver `sql/status_operacional.sql` no pacote do CRM.
  Alternativa manual ("Inserir manualmente") para CRMs que ainda não têm
  essa função instalada.
- Alerta automático quando o storage de algum CRM passa de 70%
  (atenção), 85% (crítico) ou 95% (ação necessária).
- **Dashboard** — visão consolidada: total de CRMs monitorados, soma de
  usuários em todos os CRMs, storage médio entre eles, e alertas em
  aberto.

## O que o painel NÃO faz (de propósito)

- Não cria conta/projeto Supabase de cliente nenhum — isso é feito por
  você, fora do painel.
- Não gera pasta, `config.js` de CRM novo, nem faz commit/push em
  repositório nenhum.
- Não tem botão de suspender/reativar/ativar um CRM — o campo de status
  existe no banco só como metadado, sem ação de gestão associada por
  enquanto.
- Não roda verificação sozinho em intervalo (sem cron/agendamento, já
  que é um site estático) — cada "Verificar agora" é uma consulta feita
  na hora que você clica.

Esse escopo é proposital: por enquanto o painel é só o "contabilizador".
A parte de gestão ativa (criar/suspender/republicar um CRM pelo painel)
fica pra quando formos usar o seu próprio CRM como piloto.

## Estrutura de arquivos
```
index.html
css/style.css
js/config.js     <- já preenchido com os dados do Supabase do painel
js/api.js
js/app.js
sql/schema_painel_central.sql   <- já aplicado; fica aqui como referência
```

## Segurança
- A `service_role` do Supabase do painel **nunca** entra em nenhum arquivo
  deste repositório — só a chave publicável.
- O mesmo vale para os CRMs de cliente: o painel só guarda e usa a
  `anon key` de cada um, nunca a `service_role`.
- A função `obter_status_operacional()` (no Supabase de cada cliente) só
  devolve números agregados — nunca nomes, e-mails ou qualquer registro
  individual.
- Sessão do painel expira automaticamente após 30 minutos de inatividade.
- RLS habilitado em todas as tabelas do painel: exige usuário autenticado
  neste projeto, e como só existe um usuário cadastrado, isso já
  restringe o acesso a você.
