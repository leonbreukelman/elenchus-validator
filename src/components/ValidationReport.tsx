import React from 'react';
import { ProbeResult, AttackResult, Theory } from '../services/validator';
import { ShieldCheck, ShieldAlert, Target, Zap, Info, BarChart, Bug } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface Props {
  theory: Theory;
  probe: ProbeResult;
  attack: AttackResult;
}

export const ValidationReport: React.FC<Props> = ({ theory, probe, attack }) => {
  // Concordance: If probe says Good and attack failed, or probe says Bad and attack succeeded
  const isConcordant = (probe.verdict === 'Good' && !attack.success) || (probe.verdict === 'Bad' && attack.success);
  const concordanceScore = isConcordant ? 100 : 0;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
          <div className={cn(
            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
            isConcordant ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
          )}>
            {isConcordant ? 'Probe Validated' : 'Probe Mismatch'}
          </div>
        </div>

        <h2 className="text-xl font-bold text-zinc-100 mb-1">{theory.name}</h2>
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-6">{theory.category} Validation Report</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Probe Verdict */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <ShieldCheck size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Probe Verdict</span>
            </div>
            <div className={cn(
              "text-3xl font-mono font-black italic",
              probe.verdict === 'Good' ? "text-emerald-500" : "text-rose-500"
            )}>
              {probe.verdict.toUpperCase()}
            </div>
            <div className="text-[10px] text-zinc-500 leading-relaxed">
              Score: {probe.score}/100
            </div>
          </div>

          {/* Attack Outcome */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <Zap size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Attack Outcome</span>
            </div>
            <div className={cn(
              "text-3xl font-mono font-black italic",
              attack.success ? "text-rose-500" : "text-emerald-500"
            )}>
              {attack.success ? 'BREACHED' : 'RESILIENT'}
            </div>
            <div className="text-[10px] text-zinc-500 leading-relaxed">
              {attack.variations.length} variations found
            </div>
          </div>

          {/* Concordance */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-zinc-400">
              <Target size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Concordance</span>
            </div>
            <div className="text-3xl font-mono font-black italic text-zinc-100">
              {concordanceScore}%
            </div>
            <div className="text-[10px] text-zinc-500 leading-relaxed">
              Meta-validation accuracy
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 text-zinc-400 mb-4">
            <BarChart size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Probe Analysis</span>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[10px] text-zinc-600 uppercase mb-1">Variability Analysis</div>
              <p className="text-xs text-zinc-400 leading-relaxed italic">"{probe.variability}"</p>
            </div>
            <div>
              <div className="text-[10px] text-zinc-600 uppercase mb-1">Explanatory Reach</div>
              <p className="text-xs text-zinc-400 leading-relaxed italic">"{probe.reach}"</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 text-zinc-400 mb-4">
            <Bug size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Attack Analysis</span>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-[10px] text-zinc-600 uppercase mb-1">Saboteur's Critique</div>
              <p className="text-xs text-zinc-400 leading-relaxed italic">"{attack.explanation}"</p>
            </div>
            {attack.variations.length > 0 && (
              <div>
                <div className="text-[10px] text-zinc-600 uppercase mb-1">Alternative Explanations</div>
                <ul className="space-y-2">
                  {attack.variations.map((v, i) => (
                    <li key={i} className="text-[10px] text-zinc-500 bg-black/30 p-2 rounded border border-zinc-800/50">
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
