-- Revert the immediately preceding saved-composition update contract.
-- No composition or appointment data is changed.

drop function if exists public.save_service_composition_v3(
  text,
  text,
  jsonb,
  boolean,
  uuid
);

notify pgrst, 'reload schema';
