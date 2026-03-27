-- ============================================================
-- STEP 1: Drop all existing broken policies
-- ============================================================
DROP POLICY IF EXISTS "Users can read their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Everyone can read shipments by tracking" ON public.shipments;
DROP POLICY IF EXISTS "Staff can do everything" ON public.shipments;

-- ============================================================
-- STEP 2: Create a SECURITY DEFINER function to check role
-- This avoids infinite recursion by bypassing RLS when checking role
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE uid = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- STEP 3: Re-create users policies using the safe function
-- ============================================================

-- Any authenticated user can read their own row
CREATE POLICY "Users can read their own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = uid);

-- Any authenticated user can insert their own row
CREATE POLICY "Users can insert their own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = uid);

-- Any authenticated user can update their own row
CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = uid);

-- ============================================================
-- STEP 4: Re-create shipments policies using the safe function
-- ============================================================

-- Anyone can read shipments (public tracking)
CREATE POLICY "Everyone can read shipments"
  ON public.shipments FOR SELECT
  USING (true);

-- Only admin/staff can insert shipments
CREATE POLICY "Staff can insert shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'staff'));

-- Only admin/staff can update shipments
CREATE POLICY "Staff can update shipments"
  ON public.shipments FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'staff'));

-- Only admin/staff can delete shipments
CREATE POLICY "Staff can delete shipments"
  ON public.shipments FOR DELETE
  USING (public.get_my_role() IN ('admin', 'staff'));
