import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const Logo = () => (
  <div className="flex items-center gap-2.5">
    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </div>
    <span className="text-xl font-bold text-white tracking-tight">FlowShift</span>
  </div>
);

export function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'register' | 'signin'>('register');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await api.register(email.trim(), name.trim() || undefined);
      localStorage.setItem('flowshift_auth', JSON.stringify({
        userId: user.id,
        apiKey: (user as unknown as Record<string, string>).api_key,
        email: user.email,
        name: user.name,
      }));
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const trimmed = apiKey.trim();
    localStorage.setItem('flowshift_auth', JSON.stringify({ apiKey: trimmed, userId: '', email: '', name: null }));
    try {
      const user = await api.getMe();
      localStorage.setItem('flowshift_auth', JSON.stringify({
        userId: user.id,
        apiKey: trimmed,
        email: user.email,
        name: user.name,
      }));
      navigate('/');
    } catch (err) {
      localStorage.removeItem('flowshift_auth');
      setError(err instanceof Error ? err.message : 'Sign in failed — check your API key');
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/70 transition-colors text-sm';
  const btnCls =
    'w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2';

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left — branding */}
      <div className="hidden lg:flex flex-col justify-center px-16 w-[55%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-violet-950/30" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent" />
        <div className="relative z-10 max-w-lg">
          <Logo />
          <h1 className="mt-10 text-5xl font-bold text-white leading-[1.15] tracking-tight">
            Migrate your<br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              iPaaS workflows
            </span><br />
            in minutes.
          </h1>
          <p className="mt-5 text-slate-400 text-lg leading-relaxed">
            Describe your automation. Get a full migration playbook and ready-to-import workflow file — powered by Claude.
          </p>
          <div className="mt-10 flex flex-wrap gap-2">
            {['n8n', 'Make', 'Zapier', 'Tray', 'Boomi', 'Workato', 'Celigo'].map(p => (
              <span key={p} className="px-3.5 py-1.5 bg-white/5 border border-white/8 rounded-full text-slate-400 text-sm font-medium">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8 border-l border-white/5">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Logo /></div>

          {/* Tab switcher */}
          <div className="flex bg-slate-900 border border-white/8 rounded-xl p-1 mb-8">
            {(['register', 'signin'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  tab === t ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t === 'register' ? 'Register' : 'Sign In'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {tab === 'register' ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="you@example.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">
                  Name <span className="text-slate-600 font-normal">— optional</span>
                </label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name" className={inputCls} />
              </div>
              <button type="submit" disabled={loading} className={btnCls}>
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating account…</>
                  : 'Create account →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">API Key</label>
                <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)}
                  required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={inputCls + ' font-mono'} />
              </div>
              <button type="submit" disabled={loading} className={btnCls}>
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in…</>
                  : 'Sign in →'}
              </button>
            </form>
          )}

          <p className="mt-6 text-xs text-slate-600 text-center">
            {tab === 'register'
              ? 'Your API key is shown once after registration — save it.'
              : 'Your API key was returned when you first registered.'}
          </p>
        </div>
      </div>
    </div>
  );
}
