'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { AuthError } from '@supabase/supabase-js'

// The Supabase client stringifies the raw fetch Response for 5xx errors,
// which always yields the literal string "{}" instead of a real message.
function authErrorMessage(error: AuthError): string {
  if (!error.message || error.message === '{}') {
    return 'Something went wrong on our end. Please try again in a moment.'
  }
  return error.message
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return redirect(`/login?error=${encodeURIComponent(authErrorMessage(error))}`)
  }

  revalidatePath('/', 'layout')
  return redirect('/sermons')
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    return redirect(`/register?error=${encodeURIComponent(authErrorMessage(error))}`)
  }

  revalidatePath('/', 'layout')
  return redirect('/sermons')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  return redirect('/login')
}
