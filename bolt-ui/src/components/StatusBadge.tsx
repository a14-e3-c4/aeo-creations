import { CheckCircle2, AlertCircle, Info, Loader2, XCircle } from 'lucide-react';
import type { StatusResponse } from '@/lib/types';

const config = {
  idle: { icon: Info, color: 'text-gray-400', border: 'border-white/[0.06]', bg: 'bg-white/[0.02]' },
  loading: { icon: Loader2, color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
  ok: { icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
  err: { icon: XCircle, color: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5' },
  cached: { icon: AlertCircle, color: 'text-cyan-400', border: 'border-cyan-500/20', bg: 'bg-cyan-500/5' },
};

export function StatusBadge({ status }: { status: StatusResponse }) {
  const { icon: Icon, color, border, bg } = config[status.type];
  return (
    <div className={`mt-3 px-4 py-3 rounded-[10px] border ${border} ${bg} text-xs font-medium leading-relaxed min-h-[20px] flex items-center ${color}`}>
      <Icon size={14} className={`mr-2 flex-shrink-0 ${status.type === 'loading' ? 'animate-spin' : ''}`} />
      <span dangerouslySetInnerHTML={{ __html: status.message }} />
    </div>
  );
}
