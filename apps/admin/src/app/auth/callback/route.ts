import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/** Completes a magic-link sign-in (PKCE code, or token_hash from a custom template). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const supabase = await supabaseServer();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  const dest = url.clone();
  dest.search = '';
  dest.pathname = ok ? '/events' : '/login';
  if (!ok) dest.searchParams.set('error', 'link');
  return NextResponse.redirect(dest);
}
