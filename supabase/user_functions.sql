-- Create a database function to handle admin user setup
-- This function will run with SECURITY DEFINER (elevated privileges)
-- allowing it to bypass RLS when necessary

CREATE OR REPLACE FUNCTION create_user_profile(
    user_id uuid DEFAULT auth.uid(),
    user_email text DEFAULT NULL,
    user_name text DEFAULT NULL,
    user_role text DEFAULT 'user'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- This allows the function to bypass RLS
SET search_path = public
AS $$
DECLARE
    result_user public.users;
    auth_user_email text;
BEGIN
    -- Get email from auth.users if not provided
    IF user_email IS NULL THEN
        SELECT email INTO auth_user_email FROM auth.users WHERE id = user_id;
        user_email := auth_user_email;
    END IF;
    
    -- Set default name if not provided
    IF user_name IS NULL THEN
        user_name := COALESCE(user_email, 'User');
    END IF;
    
    -- Insert or update user profile
    INSERT INTO public.users (id, email, name, role, created_at, updated_at)
    VALUES (
        user_id,
        user_email,
        user_name,
        user_role,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) 
    DO UPDATE SET 
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        updated_at = NOW()
    RETURNING * INTO result_user;
    
    -- Return the user data as JSON
    RETURN row_to_json(result_user);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_profile TO authenticated;

-- Create a function specifically for admin setup
CREATE OR REPLACE FUNCTION setup_admin_user(
    admin_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result_user public.users;
    auth_user_id uuid;
BEGIN
    -- Get the user ID from auth.users
    SELECT id INTO auth_user_id FROM auth.users WHERE email = admin_email LIMIT 1;
    
    IF auth_user_id IS NULL THEN
        RAISE EXCEPTION 'No auth user found with email: %. Please create the auth user first.', admin_email;
    END IF;
    
    -- Insert or update user profile with admin role
    INSERT INTO public.users (id, email, name, role, created_at, updated_at)
    VALUES (
        auth_user_id,
        admin_email,
        'Admin User',
        'admin',
        NOW(),
        NOW()
    )
    ON CONFLICT (id) 
    DO UPDATE SET 
        role = 'admin',
        updated_at = NOW()
    RETURNING * INTO result_user;
    
    -- Return the user data as JSON
    RETURN row_to_json(result_user);
END;
$$;

-- Grant execute permission to authenticated users (could be restricted further if needed)
GRANT EXECUTE ON FUNCTION setup_admin_user TO authenticated;

-- Function to delete user's location data (for sign out)
CREATE OR REPLACE FUNCTION delete_user_location(
  user_id_param uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete the user's location record
  DELETE FROM public.user_locations 
  WHERE user_id = user_id_param;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Return result
  RETURN json_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'message', 'Location data deleted successfully'
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_location TO authenticated;
