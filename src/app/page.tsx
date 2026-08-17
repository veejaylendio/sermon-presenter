import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/sermons')
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    }}>
      {/* Header */}
      <header className="glass" style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        borderBottom: '1px solid var(--border-color)',
        padding: '1rem 0'
      }}>
        <div className="container" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            fontFamily: 'var(--font-serif)',
            color: 'var(--primary)',
            letterSpacing: '-0.02em'
          }}>
            SermonPresenter
          </span>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link href="/login" className="btn btn-secondary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}>
              Sign In
            </Link>
            <Link href="/register" className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '4rem 0' }}>
        <div className="container" style={{ textAlign: 'center', maxWidth: '800px' }}>
          <h1 className="animate-fade-in" style={{
            fontSize: '3.5rem',
            marginBottom: '1.5rem',
            lineHeight: '1.15',
            color: 'var(--text-primary)'
          }}>
            Preach with Power. <br />
            <span style={{ color: 'var(--primary)' }}>Slides, Simplified.</span>
          </h1>
          
          <p className="animate-fade-in delay-1" style={{
            fontSize: '1.25rem',
            color: 'var(--text-secondary)',
            marginBottom: '2.5rem',
            lineHeight: '1.6'
          }}>
            SermonPresenter instantly parses your raw notes using clean breaks, generating beautifully designed presentations for your sermon. Present fullscreen with multi-screen controls, timers, draw tools, and local sync.
          </p>

          <div className="animate-fade-in delay-2" style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            marginBottom: '4rem'
          }}>
            <Link href="/register" className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.125rem' }}>
              Create Your First Sermon
            </Link>
            <Link href="/login" className="btn btn-secondary" style={{ padding: '1rem 2rem', fontSize: '1.125rem' }}>
              Access Account
            </Link>
          </div>

          {/* Features Grid */}
          <div className="animate-fade-in delay-3" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem',
            textAlign: 'left'
          }}>
            <div className="glass-card">
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✍️</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Paste & Parse</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Paste raw sermon notes. The app automatically groups text block-by-block and splits into clean slides based on blank lines.
              </p>
            </div>
            <div className="glass-card">
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎨</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>AI Styling Previews</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Explore three distinct design aesthetics generated dynamically based on your content. Choose the perfect theme for your message.
              </p>
            </div>
            <div className="glass-card">
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🖥️</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Dual-Screen Presenter</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Show the sermon fullscreen on the church projector while controlling progress from your tablet or laptop with a timer, drawer, and notes.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-color)',
        padding: '2rem 0',
        textAlign: 'center',
        fontSize: '0.875rem',
        color: 'var(--text-muted)'
      }}>
        <div className="container">
          © {new Date().getFullYear()} SermonPresenter. All rights reserved. Built with Next.js and Supabase.
        </div>
      </footer>
    </div>
  )
}
