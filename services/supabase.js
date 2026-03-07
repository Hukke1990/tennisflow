const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:8000';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'dummy_key';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;
