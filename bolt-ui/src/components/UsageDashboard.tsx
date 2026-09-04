import { useState, useEffect } from 'react';
import {
  BarChart3, Zap, Image, Film, Mic, Clock, TrendingUp,
  Loader2, Crown, Star, ChevronRight, X,
} from 'lucide-react';
import { useAuth, type UsageSummary } from '@/lib/auth';

interface UsageDashboardProps {
  onOpenPlans: () => void;
  onClose: () => void;
}

export function UsageDashboard({ onOpenPlans, onClose }: UsageDashboardProps) {
  const { authFetch, user } = useAuth();
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsage();
  }, []);

  async function loadUsage() {
    setLoading(true);
    try {
      const resp = await authFetch('/api/usage?months=1');
      if (resp.ok) {
        const data = await resp.json();
        setSummary(data.summary);
      }
    } catch {} finally { setLoading(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="text-cyan-400 animate-spin" />
      </div>
    );
  }

  const plan = summary?.plan;
  const creditsTotal = summary?.credits_total || 50;
  const creditsUsed = summary?.credits_used || 0;
  const creditsRemaining = summary?.credits_remaining || 0;
  const usagePercent = creditsTotal > 0 ? Math.round((creditsUsed / creditsTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel rounded-2xl p-6 w-full max-w-lg border border-white/[0.08] max-h-[90vh] overflow-y-auto z-10">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={18} /></button>
        <h2 className="text-lg font-bold mb-4">Usage Dashboard</h2>
    <div className="space-y-5">
      {/* Plan card */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown size={18} className={plan?.id === 'pro' ? 'text-yellow-400' : plan?.id === 'creator' ? 'text-purple-400' : 'text-gray-400'} />
            <h3 className="text-base font-bold">{plan?.name || 'Free'} Plan</h3>
          </div>
          {plan?.id !== 'pro' && (
            <button onClick={onOpenPlans}
              className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              Upgrade <ChevronRight size={12} />
            </button>
          )}
        </div>

        {/* Credit bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Credits used: {creditsUsed}</span>
            <span>{creditsRemaining} remaining / {creditsTotal} total</span>
          </div>
          <div className="w-full h-2.5 bg-surface-3 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${
              usagePercent > 80 ? 'bg-rose-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-cyan-500'
            }`} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-surface-3/50 rounded-lg p-2">
            <p className="text-lg font-bold text-cyan-400">{creditsRemaining}</p>
            <p className="text-[10px] text-gray-500">Credits Left</p>
          </div>
          <div className="bg-surface-3/50 rounded-lg p-2">
            <p className="text-lg font-bold text-white">{summary?.events_this_month || 0}</p>
            <p className="text-[10px] text-gray-500">Generations</p>
          </div>
          <div className="bg-surface-3/50 rounded-lg p-2">
            <p className="text-lg font-bold text-emerald-400">
              {plan?.price_monthly === 0 ? 'Free' : `$${plan?.price_monthly}`}
            </p>
            <p className="text-[10px] text-gray-500">/month</p>
          </div>
        </div>
      </div>

      {/* Plan features */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <Star size={14} className="text-amber-400" /> Plan Features
        </h3>
        <div className="space-y-2">
          {plan?.features?.slice(0, 6).map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      {/* Usage breakdown */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <BarChart3 size={14} className="text-purple-400" /> Usage This Month
        </h3>
        {summary?.by_action && Object.keys(summary.by_action).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(summary.by_action).map(([action, count]) => (
              <div key={action} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-gray-400">
                  {action.includes('image') ? <Image size={12} /> :
                   action.includes('video') ? <Film size={12} /> :
                   action.includes('voice') ? <Mic size={12} /> :
                   action.includes('hook') || action.includes('script') ? <Zap size={12} /> :
                   <Clock size={12} />}
                  <span className="capitalize">{action.replace(/-/g, ' ')}</span>
                </div>
                <span className="font-medium text-white">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600 text-center py-4">No usage yet this month</p>
        )}
      </div>

      {/* Account info */}
      <div className="glass-panel rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-emerald-400" /> Account
        </h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Email</span>
            <span className="text-white">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Member since</span>
            <span className="text-white">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Billing cycle</span>
            <span className="text-white">
              {user?.billing_cycle_start ? new Date(user.billing_cycle_start).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
    </div>
    </div>
  );
}
