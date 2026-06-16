-- 0026_panel_grafik_delete.sql
-- Usuwanie wcześniejszych/niepotrzebnych grafików (availability_request) z panelu.
-- Kasuje też tokeny i odpowiedzi pracowników dzięki FK ON DELETE CASCADE.
-- Menedżer może usuwać tylko własne grafiki; admin — dowolne (jak filtr widoczności w panelu).

create or replace function public.delete_availability_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text; v_me text; v_owner text;
begin
  v_role := public.current_app_role();
  if v_role is null then raise exception 'Brak uprawnień.'; end if;
  select name into v_me from public.app_accounts where user_id = auth.uid();
  select created_by into v_owner from public.availability_requests where id = p_request_id;
  if v_owner is null then return; end if; -- już usunięty / nie istnieje
  if v_role <> 'admin' and coalesce(v_owner,'') <> coalesce(v_me,'') then
    raise exception 'Możesz usuwać tylko własne grafiki.';
  end if;
  delete from public.availability_requests where id = p_request_id; -- kaskada tokens/entries
  perform public.log_action('grafik_usuniety', format('Usunął grafik %s', p_request_id), null);
end $$;

grant execute on function public.delete_availability_request(uuid) to authenticated;
