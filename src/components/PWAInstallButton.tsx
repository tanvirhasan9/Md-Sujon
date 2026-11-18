import React from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { canInstall, isInstalled, promptInstall, dismiss } = usePWAInstall();

  if (isInstalled || !canInstall) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 border border-emerald-400/60 px-2.5 py-1.5">
      <button
        type="button"
        onClick={promptInstall}
        className="flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 text-xs font-mono font-bold tracking-wider uppercase cursor-pointer"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <Download className="w-3.5 h-3.5" />
        INSTALL ANDROID APP
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="p-0.5 text-slate-400 hover:text-slate-200 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
