-- Same 9-digit legacy mobile numbers as 20261029100000: the appearance guard
-- still required exactly 10 digits, so those customers could not load it.
CREATE OR REPLACE FUNCTION public.get_customer_appearance_preference_v1(p_salon_code text, p_customer_email text, p_customer_phone text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid; preference text;
BEGIN
  cid := salonpro_private.portal_customer(p_salon_code);
  IF cid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id=cid
    AND lower(trim(c.email::text))=lower(trim(p_customer_email))
    AND nullif(trim(p_customer_email),'') IS NOT NULL
    AND length(regexp_replace(coalesce(p_customer_phone,''),'\D','','g')) BETWEEN 9 AND 10
    AND right(regexp_replace(c.phone,'\D','','g'),10)=regexp_replace(p_customer_phone,'\D','','g')
  ) THEN RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='PT403'; END IF;
  SELECT appearance_mode INTO preference FROM salonpro_private.customer_appearance_preferences WHERE customer_id=cid;
  RETURN coalesce(preference,'system');
END $$;
