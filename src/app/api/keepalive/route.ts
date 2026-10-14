import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Supabase pauses free-tier projects after ~7 days without database activity.
// Vercel Cron (see vercel.json) hits this route on a schedule; the lightweight
// query below reaches Postgres through the REST API, which counts as activity.
// RLS means the anon key sees zero rows, but the request still hits the DB.
export async function GET(request: Request) {
  // Vercel sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  const { error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })

  if (error) {
    console.error('Supabase keepalive failed:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() })
}
