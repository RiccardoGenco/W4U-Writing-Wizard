import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        if (!supabaseUrl || !serviceRoleKey || !anonKey) {
            return new Response(
                JSON.stringify({ error: 'Missing server configuration' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Verify the caller's JWT and check they are an admin
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Use anon client to verify the caller's session
        const callerClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser();
        if (callerError || !callerUser) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: invalid session' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check caller is admin via their JWT app_metadata
        const callerIsAdmin = callerUser.app_metadata?.is_admin === true;
        if (!callerIsAdmin) {
            return new Response(
                JSON.stringify({ error: 'Forbidden: caller is not an admin' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Parse request body
        const { userId, isAdmin } = await req.json();
        if (!userId || typeof isAdmin !== 'boolean') {
            return new Response(
                JSON.stringify({ error: 'Missing userId or isAdmin in request body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Use service role client to bypass RLS and update the profile
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { error: updateError } = await adminClient
            .from('profiles')
            .update({ is_admin: isAdmin })
            .eq('id', userId);

        if (updateError) {
            return new Response(
                JSON.stringify({ error: updateError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, userId, is_admin: isAdmin }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
