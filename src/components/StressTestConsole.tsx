import React, { useState, useEffect, useRef } from 'react';
import { Theory, runDeutschProbe, runVariabilityAttack, ProbeResult, AttackResult } from '../services/validator';
import { Terminal, Shield, Zap, Bug, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Props {
  theory: Theory | null;
  onComplete: (probe: ProbeResult, attack: AttackResult) => void;
}

export const StressTestConsole: React.FC<Props> = ({ theory, onComplete }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<{ msg: string; type: 'info' | 'probe' | 'attack' | 'success' | 'error' }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string, type: 'info' | 'probe' | 'attack' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { msg, type }]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const startTest = async () => {
    if (!theory) return;
    setIsRunning(true);
    setLogs([]);
    addLog(`Initializing Stress Test for: ${theory.name}`, 'info');
    
    try {
      // Phase 1: Standard Probe
      addLog('PHASE 1: Running Standard Deutsch Probe...', 'probe');
      const probe = await runDeutschProbe(theory.description);
      addLog(`Probe Verdict: ${probe.verdict} (Score: ${probe.score}/100)`, 'probe');
      
      await new Promise(r => setTimeout(r, 1000));

      // Phase 2: Variability Attack
      addLog('PHASE 2: Launching Variability Attack...', 'attack');
      addLog('Agent "Saboteur" is attempting to find plausible alternatives...', 'attack');
      const attack = await runVariabilityAttack(theory.description);
      
      if (attack.success) {
        addLog(`ATTACK SUCCESS: Found ${attack.variations.length} plausible variations.`, 'error');
        attack.variations.forEach((v, i) => addLog(`Variation ${i+1}: ${v.substring(0, 60)}...`, 'attack'));
      } else {
        addLog('ATTACK FAILED: Theory is resilient to variation.', 'success');
      }

      addLog('Stress test complete. Generating meta-analysis...', 'info');
      onComplete(probe, attack);
    } catch (error) {
      addLog(`CRITICAL ERROR: ${(error as Error).message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[500px] shadow-2xl">
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-emerald-500" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Stress Test Console</span>
        </div>
        <button
          onClick={startTest}
          disabled={isRunning || !theory}
          className="flex items-center gap-2 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white text-[10px] font-bold rounded-md transition-all uppercase tracking-wider"
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          {isRunning ? 'Running...' : 'Execute Test'}
        </button>
      </div>

      <div className="flex-1 p-4 font-mono text-[11px] overflow-y-auto space-y-1.5 scrollbar-hide" ref={scrollRef}>
        <AnimatePresence initial={false}>
          {logs.map((log, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex gap-3"
            >
              <span className={cn(
                "shrink-0 w-16 font-bold uppercase",
                log.type === 'info' && "text-zinc-600",
                log.type === 'probe' && "text-blue-500",
                log.type === 'attack' && "text-amber-500",
                log.type === 'success' && "text-emerald-500",
                log.type === 'error' && "text-rose-500",
              )}>
                {log.type}
              </span>
              <span className={cn(
                "text-zinc-300",
                log.type === 'error' && "text-rose-400"
              )}>
                {log.msg}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {isRunning && (
          <div className="flex items-center gap-2 text-zinc-600 animate-pulse mt-2">
            <RefreshCw size={10} className="animate-spin" />
            <span>Processing meta-data...</span>
          </div>
        )}
        {!theory && logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-zinc-800 space-y-4">
            <Shield size={48} strokeWidth={1} />
            <p className="text-xs uppercase tracking-widest">Select a theory to begin validation</p>
          </div>
        )}
      </div>
    </div>
  );
};
