BEGIN;

-- Private presentation preference: no changes to booking or credential records.
CREATE TABLE salonpro_private.customer_appearance_preferences (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  appearance_mode text NOT NULL CHECK (appearance_mode IN ('system','day','night')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE salonpro_private.customer_appearance_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON salonpro_private.customer_appearance_preferences FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_customer_appearance_preference_v1(p_salon_code text, p_customer_email text, p_customer_phone text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid; preference text;
BEGIN
  cid := salonpro_private.portal_customer(p_salon_code);
  IF cid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id=cid
    AND lower(trim(c.email::text))=lower(trim(p_customer_email))
    AND nullif(trim(p_customer_email),'') IS NOT NULL
    AND length(regexp_replace(coalesce(p_customer_phone,''),'\D','','g'))=10
    AND right(regexp_replace(c.phone,'\D','','g'),10)=regexp_replace(p_customer_phone,'\D','','g')
  ) THEN RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='PT403'; END IF;
  SELECT appearance_mode INTO preference FROM salonpro_private.customer_appearance_preferences WHERE customer_id=cid;
  RETURN coalesce(preference,'system');
END $$;

CREATE FUNCTION public.set_customer_appearance_preference_v1(p_salon_code text, p_customer_email text, p_customer_phone text, p_mode text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid;
BEGIN
  -- Reuse the same proof/identity guard, including when portal rollout is disabled.
  PERFORM public.get_customer_appearance_preference_v1(p_salon_code,p_customer_email,p_customer_phone);
  cid := salonpro_private.portal_customer(p_salon_code);
  IF p_mode IS NULL OR p_mode NOT IN ('system','day','night') THEN
    RAISE EXCEPTION 'invalid_appearance_mode' USING ERRCODE='22023';
  END IF;
  INSERT INTO salonpro_private.customer_appearance_preferences(customer_id,appearance_mode)
  VALUES(cid,p_mode) ON CONFLICT(customer_id) DO UPDATE
  SET appearance_mode=excluded.appearance_mode,updated_at=now();
  RETURN p_mode;
END $$;
REVOKE ALL ON FUNCTION public.get_customer_appearance_preference_v1(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_customer_appearance_preference_v1(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_appearance_preference_v1(text,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_appearance_preference_v1(text,text,text,text) TO anon,authenticated;
COMMIT;
