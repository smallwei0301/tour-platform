import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()

    try {
      // Exchange code for session
      const { data: { user }, error: authError } = await supabase.auth.exchangeCodeForSession(code)

      if (authError) {
        console.error('Auth error:', authError)
        return NextResponse.redirect(
          new URL('/auth/error?message=Authentication failed', requestUrl.origin)
        )
      }

      if (!user) {
        console.error('No user returned from auth')
        return NextResponse.redirect(
          new URL('/auth/error?message=No user found', requestUrl.origin)
        )
      }

      // Verify user exists in public.users (trigger should have created it)
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 is "not found" error
        console.error('Profile check error:', profileError)
      }

      // If profile doesn't exist (shouldn't happen with trigger, but safety check)
      if (!profile) {
        console.warn('Profile not found for user, creating manually:', user.id)
        
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: user.email!,
            name: user.user_metadata?.full_name || user.user_metadata?.name || null,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          })

        if (insertError) {
          console.error('Failed to create profile:', insertError)
          // Continue anyway - user is authenticated
        }
      }

      // Successful authentication - redirect to next page
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    } catch (error) {
      console.error('Unexpected error in auth callback:', error)
      return NextResponse.redirect(
        new URL('/auth/error?message=Unexpected error occurred', requestUrl.origin)
      )
    }
  }

  // No code present - redirect to home
  return NextResponse.redirect(new URL('/', requestUrl.origin))
}
