import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { SessionUser } from '@shared/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function AppShell() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .session()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
  }, [])

  async function onAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    const name = String(form.get('name') ?? 'Listener')
    setError(null)
    try {
      const data = mode === 'in' ? await api.signIn(email, password) : await api.signUp(name, email, password)
      setUser(data.user)
      setAuthOpen(false)
      navigate('/library')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-leather/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="font-display text-2xl text-gold">
            Sunderplace
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <NavItem to="/catalog">Catalog</NavItem>
            <NavItem to="/library">Library</NavItem>
            <NavItem to="/ecosystem">Ecosystem</NavItem>
            <NavItem to="/feedback">Feedback</NavItem>
            {user ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await api.signOut()
                  setUser(null)
                  navigate('/')
                }}
              >
                Sign out
              </Button>
            ) : (
              <Button size="sm" onClick={() => setAuthOpen(true)}>
                Sign in
              </Button>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet context={{ user }} />
      </main>
      {authOpen ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4" role="dialog" aria-labelledby="auth-title">
          <form className="w-full max-w-md space-y-3 rounded-xl border border-line bg-panel p-6" onSubmit={onAuth}>
            <h2 id="auth-title" className="font-display text-3xl">
              {mode === 'in' ? 'Sign in' : 'Create account'}
            </h2>
            {mode === 'up' ? <Input name="name" placeholder="Name" required aria-label="Name" /> : null}
            <Input name="email" type="email" placeholder="Email" required aria-label="Email" />
            <Input name="password" type="password" placeholder="Password" required minLength={8} aria-label="Password" />
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit">{mode === 'in' ? 'Sign in' : 'Create account'}</Button>
              <Button type="button" variant="ghost" onClick={() => setAuthOpen(false)}>
                Cancel
              </Button>
            </div>
            <button type="button" className="text-sm text-gold" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
              {mode === 'in' ? 'Need an account?' : 'Already have an account?'}
            </button>
            <a className="block text-sm text-muted hover:text-gold" href="/api/auth/github">
              Continue with GitHub
            </a>
          </form>
        </div>
      ) : null}
    </div>
  )
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'text-gold' : 'text-muted hover:text-ink')}>
      {children}
    </NavLink>
  )
}
