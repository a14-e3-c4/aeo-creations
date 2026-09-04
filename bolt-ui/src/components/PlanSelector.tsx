import { useState, useEffect } from 'react';
import {
  X, Check, Zap, Crown, Star, Loader2, CreditCard, AlertCircle, Sparkles,
} from 'lucide-react';
import { useAuth, type Plan } from '@/lib/auth';

interface PlanSelectorProps {
  onClose: () => void;
  onUpgraded?: () => void;
}

export function PlanSelector({ onClose, onUpgraded }: PlanSelectorProps) {
  const { user, authFetch, refreshUser } = useAuth();
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/plans')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || 'Could not load plans');
        setPlans(data.plans || {});
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load plans'))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(planId: string) {
    if (planId === 'free' || planId === user?.plan) return;

    setUpgrading(planId);
    setError('');
    setSuccess('');
    try {
      // This endpoint is deliberately named as a mock/demo flow in the current
      // backend. It must NOT be treated as a real payment until a payment
      // provider is connected server-side.
      const url = new URL('/api/plans/mock-checkout', window.location.origin);
      url.searchParams.set('plan_id', planId);
      const resp = await authFetch(url.toString(), { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Upgrade failed');
      setSuccess(`Demo upgrade complete: ${data.user?.plan || planId}. No payment was charged.`);
      await refreshUser();
      onUpgraded?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpgrading(null);
    }
  }

  const planOrder = ['free', 'creator', 'pro'];
  const planIcons: Record<string, typeof Zap> = { free: Zap, creator: Crown, pro: Star };
  const planColors: Record<string, string> = { free: 'text-gray-400', creator: 'text-purple-400', pro: 'text-yellow-400' };
  const planBorder: Record<string, string> = { free: 'border-gray-500/20', creator: 'border-purple-500/20', pro: 'border-yellow-500/20' };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70" onClick={onClose} />
        <div className="relative"><Loader2 size={32} className="text-cyan-400 animate-spin" /></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel rounded-2xl p-6 w-full max-w-4xl border border-white/[0.08] max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white z-10"><X size={18} /></button>

        <div className="text-center mb-6">
          <h2 className="text-xl font-bold">Choose Your Plan</h2>
          <p className="text-xs text-gray-500 mt-1">Unlock more credits, higher quality, and premium features</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={() => setBillingCycle('monthly')}
              className={`text-xs px-3 py-1 rounded-lg transition-all ${billingCycle === 'monthly' ? 'bg-cyan-500/15 text-cyan-400' : 'text-gray-500'}`}>
              Monthly
            </button>
            <button onClick={() => setBillingCycle('yearly')}
              className={`text-xs px-3 py-1 rounded-lg transition-all ${billingCycle === 'yearly' ? 'bg-cyan-500/15 text-cyan-400' : 'text-gray-500'}`}>
              Yearly <span className="text-emerald-400 font-bold">Save 17%</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 mb-4">
            <AlertCircle size={14} className="text-rose-400" />
            <span className="text-xs text-rose-300">{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Sparkles size={14} className="text-emerald-400" />
            <span className="text-xs text-emerald-300">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {planOrder.map(planId => {
            const plan = plans[planId];
            if (!plan) return null;
            const Icon = planIcons[planId] || Zap;
            const isCurrent = user?.plan === planId;
            const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
            const monthlyEquivalent = billingCycle === 'yearly' ? Math.round(plan.price_yearly / 12) : plan.price_monthly;
            const isPopular = planId === 'creator';

            return (
              <div key={planId}
                className={`glass-panel rounded-2xl p-5 border transition-all ${isCurrent ? 'border-cyan-500/40 bg-cyan-500/5' : planBorder[planId]} ${isPopular ? 'ring-1 ring-purple-500/30' : ''}`}>
                {isPopular && <div className="text-center mb-2"><span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">MOST POPULAR</span></div>}
                <div className="text-center mb-4">
                  <Icon size={28} className={`mx-auto ${planColors[planId]}`} />
                  <h3 className="text-lg font-bold mt-2">{plan.name}</h3>
                  <div className="mt-2"><span className="text-3xl font-bold">${monthlyEquivalent}</span><span className="text-xs text-gray-500">/mo</span></div>
                  {billingCycle === 'yearly' && plan.price_yearly > 0 && <p className="text-[10px] text-gray-600">${plan.price_yearly}/year</p>}
                  <p className="text-xs text-gray-500 mt-1">{plan.credits_per_month} credits/month</p>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-gray-400"><Check size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" />{feature}</li>
                  ))}
                </ul>
                {isCurrent ? (
                  <div className="w-full py-2.5 rounded-xl text-center text-xs font-medium text-gray-500 border border-white/[0.06]">Current Plan</div>
                ) : (
                  <button onClick={() => handleUpgrade(planId)} disabled={upgrading !== null}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${planId === 'pro' ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/25' : 'bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25'} disabled:opacity-50`}>
                    {upgrading === planId ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                    {upgrading === planId ? 'Processing...' : 'Try Demo Upgrade'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-[10px] text-amber-500/70 mt-4">
          Demo billing only — no real charges are made. Connect a payment provider before accepting money.
        </p>
      </div>
    </div>
  );
}
