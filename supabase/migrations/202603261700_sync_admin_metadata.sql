-- Sync public.profiles.is_admin to auth.users.raw_app_meta_data
-- This allows instant role checks via JWT without hitting the database

CREATE OR REPLACE FUNCTION public.handle_admin_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the auth.users table's raw_app_meta_data for the corresponding user
  UPDATE auth.users
  SET raw_app_meta_data = 
    coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object('is_admin', NEW.is_admin)
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Trigger on public.profiles
DROP TRIGGER IF EXISTS on_admin_change ON public.profiles;
CREATE TRIGGER on_admin_change
  AFTER INSERT OR UPDATE OF is_admin ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_admin_sync();

-- Manually sync existing admins
UPDATE auth.users
SET raw_app_meta_data = 
  coalesce(auth.users.raw_app_meta_data, '{}'::jsonb) || 
  jsonb_build_object('is_admin', p.is_admin)
FROM public.profiles p
WHERE auth.users.id = p.id;
