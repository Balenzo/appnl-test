const SUPABASE_URL = "https://pjjvnibspbdhdzbzblsv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LkOhIx0ZbwXGzI0s9I6lbw_o9OiM-_R";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);