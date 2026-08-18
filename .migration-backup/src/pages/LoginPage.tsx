import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Bot, Mail, Lock, Loader2, ArrowRight, UserPlus, LogIn, AlertCircle, Sparkles, ArrowLeft, Eye, EyeOff } from 'lucide-react';

interface LoginPageProps {
  mode?: 'login' | 'signup';
}

export function LoginPage({ mode: initialMode = 'login' }: LoginPageProps) {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) navigate('/admin', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setSignupSuccess(false);
  }, [initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const err = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password);

    if (err) {
      setError(err);
      setLoading(false);
    } else if (mode === 'signup') {
      setSignupSuccess(true);
      setLoading(false);
    }
  };

  const switchMode = (next: 'login' | 'signup') => {
    navigate(next === 'login' ? '/login' : '/register', { replace: true });
    setError(null);
    setSignupSuccess(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(56,189,248,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(14,165,233,0.12) 0%, transparent 50%)' }} />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center group cursor-pointer">
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-sky-500/30 group-hover:shadow-sky-500/50 transition-all duration-300 group-hover:scale-105">
              <Bot className="w-8 h-8 text-white" />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-slate-900" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-4 group-hover:text-sky-300 transition-colors duration-200">Orchestrator</h1>
            <p className="text-sm text-slate-400 mt-1">AI Support Engine</p>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 mt-3 group-hover:text-sky-400 transition-colors duration-200">
              <ArrowLeft className="w-3 h-3" />
              Back to Home
            </span>
          </Link>
        </div>

        <div className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            <button
              onClick={() => switchMode('login')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                mode === 'login' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
            <button
              onClick={() => switchMode('signup')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                mode === 'signup' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Create Account
            </button>
          </div>

          {signupSuccess ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Account created</h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-6">
                You can now sign in with your credentials.
              </p>
              <button
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-sky-500 to-blue-600 text-white text-sm font-semibold rounded-xl hover:from-sky-400 hover:to-blue-500 transition-all duration-200 shadow-lg shadow-sky-500/25"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@company.com"
                    className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500/40 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Min. 6 characters"
                    className="w-full pl-11 pr-11 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500/40 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          {mode === 'login' ? (
            <>Don't have an account? <Link to="/register" className="text-sky-400 hover:text-sky-300 transition-colors">Create one</Link></>
          ) : (
            <>Already have an account? <Link to="/login" className="text-sky-400 hover:text-sky-300 transition-colors">Sign in</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
