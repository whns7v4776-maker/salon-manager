-- Legacy Italian mobile numbers (e.g. old TIM 335 lines) have 9 digits. The
-- portal session required exactly 10, so those customers could never sign in.
CREATE OR REPLACE FUNCTION public.create_customer_portal_session_v1(p_salon_code text,p_customer_email text,p_customer_phone text,p_customer_password text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE cid uuid; credential text; matches integer; token text; expiry timestamptz:=now()+interval '7 days';
BEGIN
 IF nullif(trim(p_customer_email),'') IS NULL OR length(regexp_replace(coalesce(p_customer_phone,''),'\D','','g')) NOT BETWEEN 9 AND 10
 OR length(coalesce(p_customer_password,''))=0 OR length(p_customer_password)>1024 THEN RAISE EXCEPTION 'customer_password_required'; END IF;
 SELECT count(*) INTO matches FROM public.customers c JOIN public.workspaces w ON w.id=c.workspace_id
 WHERE w.slug=lower(trim(p_salon_code)) AND c.is_active IS NOT FALSE
 AND (w.is_internal_tester OR w.subscription_status IN ('demo','active'))
 AND lower(trim(c.email::text))=lower(trim(p_customer_email))
 AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10);
 SELECT c.id,k.password_hash INTO cid,credential FROM public.customers c JOIN public.workspaces w ON w.id=c.workspace_id
 JOIN public.customer_login_credentials k ON k.customer_id=c.id
 WHERE w.slug=lower(trim(p_salon_code)) AND c.is_active IS NOT FALSE
 AND lower(trim(c.email::text))=lower(trim(p_customer_email))
 AND right(regexp_replace(c.phone,'\D','','g'),10)=right(regexp_replace(p_customer_phone,'\D','','g'),10);
 IF matches<>1 OR cid IS NULL OR credential IS NULL OR extensions.crypt(p_customer_password,credential) IS DISTINCT FROM credential THEN RAISE EXCEPTION 'invalid_customer_password'; END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.customer_payment_sessions(token_hash,customer_id,credential_hash,expires_at)
 VALUES(encode(extensions.digest(token,'sha256'),'hex'),cid,credential,expiry);
 RETURN jsonb_build_object('token',token,'expiresAt',expiry);
END $$;
REVOKE ALL ON FUNCTION public.create_customer_portal_session_v1(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_customer_portal_session_v1(text,text,text,text) TO anon,authenticated,service_role;
