import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bot, LogOut, AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

interface NavbarProps {
  fullWidth?: boolean;
}

export function Navbar({ fullWidth }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  const handleConfirmSignOut = async () => {
    setShowConfirm(false);
    await signOut();
    navigate('/');
  };

  if (isAuthPage) return null;

  return (
    <>
      <nav className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-50">
        <div className={`${fullWidth ? 'px-5' : 'max-w-7xl mx-auto px-6'} h-full flex items-center justify-between`}>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 group"
          >
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:shadow-sky-500/40 transition-all duration-300">
              <Bot className="w-5 h-5 text-white" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-slate-900 font-bold text-base tracking-tight leading-none">
                Orchestrator
              </span>
              <span className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
                AI Support Engine
              </span>
            </div>
          </button>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
                  {user.email?.[0] ?? '?'}
                </div>
                <span className="text-xs text-slate-500 max-w-[120px] truncate hidden lg:block">
                  {user.email}
                </span>
                <button
                  onClick={() => setShowConfirm(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 rounded-lg transition-all duration-200 shadow-lg shadow-sky-500/25"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      {showConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-sm mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-11 h-11 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="text-base font-bold text-slate-900">Close session?</h3>
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                    You'll be signed out and returned to the login screen.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-200/80">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-200/70 transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSignOut}
                className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 rounded-lg shadow-lg shadow-red-500/25 transition-all duration-150"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
