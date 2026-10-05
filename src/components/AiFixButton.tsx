import React from 'react';
import { Sparkles } from 'lucide-react';

export const AiFixButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'AI Fix' }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-200"
  >
    <Sparkles className="w-3.5 h-3.5 shrink-0" />
    <span>{label}</span>
  </button>
);
