-- ============================================================
-- JWT-Based Admin Auth — custom_access_token_hook
-- This adds `is_admin` to the user's JWT at login time.
-- The frontend reads it from session.user.app_metadata.is_admin
-- with NO extra DB query and NO RLS involvement.
-- ============================================================

-- 1. Create the hook function
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
    is_admin boolean := false;
BEGIN
    -- Read is_admin from profiles table (runs as postgres, bypasses RLS)
    SELECT p.is_admin INTO is_admin
    FROM public.profiles p
    WHERE p.id = (event->>'user_id')::uuid;

    -- Merge is_admin into the app_metadata claim
    RETURN jsonb_set(
        event,
        '{claims,app_metadata}',
        COALESCE(event->'claims'->'app_metadata', '{}') 
        || jsonb_build_object('is_admin', COALESCE(is_admin, false))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Grant execute to the auth admin role (required by Supabase)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- 3. Grant SELECT on profiles to supabase_auth_admin for the hook to read
GRANT SELECT ON public.profiles TO supabase_auth_admin;

-- 4. Simplify RLS on profiles — remove recursive admin policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Keep only own-row read (normal users can see their own profile)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- Verify grant
SELECT grantee, privilege_type 
FROM information_schema.role_routine_grants 
WHERE routine_name = 'custom_access_token_hook';
