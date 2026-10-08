-- Fase 17: endurece o formulário público de chamados.
-- A aplicação principal usa public.abrir_chamado_publico(jsonb) como única
-- porta de entrada pública; ela executa com privilégios do proprietário e
-- valida o produto antes de inserir.
begin;

-- Impede consultas públicas que revelavam o UUID do cliente e vínculo de produto.
revoke all on function public.resolver_cliente_para_chamado(text, text, text)
  from public, anon, authenticated;

-- Não permitir INSERT direto na tabela: o formulário deve passar pela RPC validada.
drop policy if exists "publico abre chamado" on public.chamados;
revoke insert on table public.chamados from anon, authenticated;

-- Limites de anexos do formulário público: 10 MiB por arquivo e tipos esperados.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv'
    ]
where id = 'chamados-anexos';

commit;
