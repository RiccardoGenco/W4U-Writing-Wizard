-- ============================================================
-- ADMIN AUTHORIZATION SYSTEM MIGRATION
-- Run this in Supabase SQL Editor if the MCP auto-apply fails
-- ============================================================

-- STEP 1: Reset all admins, promote only the 2 authorized accounts
UPDATE public.profiles SET is_admin = false;
UPDATE public.profiles SET is_admin = true
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE email IN ('genco.riccardotp@gmail.com', 'dev02.mamaind@gmail.com')
);

-- STEP 2: TRIGGER — New users are NEVER created as admin
CREATE OR REPLACE FUNCTION enforce_new_user_not_admin()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_admin := false;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_new_user_not_admin ON public.profiles;
CREATE TRIGGER trigger_new_user_not_admin
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION enforce_new_user_not_admin();

-- STEP 3: TRIGGER — Only admins (or Editor SQL with null auth.uid()) can change is_admin
CREATE OR REPLACE FUNCTION protect_is_admin_column()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.is_admin IS DISTINCT FROM NEW.is_admin) AND
       (auth.uid() IS NOT NULL) AND
       NOT (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.is_admin = TRUE)) THEN
        RAISE EXCEPTION 'Non-autorizzato: solo gli amministratori possono modificare il campo is_admin.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_protect_is_admin ON public.profiles;
CREATE TRIGGER trigger_protect_is_admin
BEFORE UPDATE OF is_admin ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION protect_is_admin_column();

-- STEP 4: RLS — Users can see own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- STEP 5: RLS — Admins can see ALL profiles (for user management UI)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.is_admin = TRUE)
    );

-- STEP 6: RLS — Admins can UPDATE any profile
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.is_admin = TRUE)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.is_admin = TRUE)
    );

-- VERIFY: Check current admin status
SELECT au.email, p.is_admin
FROM public.profiles p
JOIN auth.users au ON p.id = au.id
ORDER BY p.is_admin DESC;
