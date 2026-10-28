-- Subscription state is authoritative only when written by the RevenueCat
-- webhook, which uses the service role after validating the store event.
revoke execute on function public.sync_revenuecat_subscription(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text,
  text,
  public.subscription_plan,
  public.subscription_status,
  boolean,
  timestamptz,
  boolean,
  boolean
) from public, anon, authenticated;

grant execute on function public.sync_revenuecat_subscription(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text,
  text,
  public.subscription_plan,
  public.subscription_status,
  boolean,
  timestamptz,
  boolean,
  boolean
) to service_role;

-- The owner may still update normal salon settings, but never subscription
-- plan, status or dates directly through PostgREST.
revoke update on table public.workspaces from anon, authenticated;

grant update (
  slug,
  salon_name,
  owner_phone,
  activity_category,
  street_line,
  city,
  postal_code,
  cash_section_disabled,
  auto_accept_booking_requests,
  auto_accept_booking_requests_updated_at,
  customer_reminder_hours_before,
  notes,
  last_backup_at,
  updated_at
) on table public.workspaces to authenticated;
