const SUPABASE_URL = "https://pjjvnibspbdhdzbzblsv.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_LkOhIx0ZbwXGzI0s9I6lbw_o9OiM-_R";

const VAPID_PUBLIC_KEY = "BAN0Yp7-nPKYAFbboyQVm-N9XTDZ9SgEWx2V5uWZxHOm9q-uhN7u6__v3POARai8lR40Yp_jNEqDlhOyeNDQMtM";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);