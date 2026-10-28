-- Match the public booking portal: free internal testers retain access.
create or replace function public.booking_payment_customer_context(p_salon_code text,p_email text,p_phone text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid; c uuid; matches integer;
begin
 if length(trim(coalesce(p_email,'')))=0 or length(regexp_replace(coalesce(p_phone,''),'\D','','g'))=0 then return null; end if;
 select id into w from workspaces where slug=lower(trim(p_salon_code)) and (is_internal_tester = true or subscription_status in('demo','active'));
 if w is null then return null; end if;
 select count(*),(array_agg(id))[1] into matches,c from customers where workspace_id=w and is_active is not false
 and lower(trim(email::text))=lower(trim(p_email)) and regexp_replace(coalesce(phone,''),'\D','','g')=regexp_replace(p_phone,'\D','','g');
 if matches<>1 then return null; end if;
 return jsonb_build_object('workspaceId',w,'customerId',c,'policy',resolve_booking_payment_policy(w,c));
end $$;
revoke all on function public.booking_payment_customer_context(text,text,text) from public,anon,authenticated;
grant execute on function public.booking_payment_customer_context(text,text,text) to service_role;

