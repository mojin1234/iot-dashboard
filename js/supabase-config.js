const SUPABASE_CONFIG = {
    url: 'https://fjzcojrasiztlhtqbsot.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqemNvanJhc2l6dGxodHFic290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MDgyMjAsImV4cCI6MjA5MjE4NDIyMH0.Ps_hM7iU_gDGVGlldfyQP2I1TEJN9F120Kemzgy-av0'
};

const supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
