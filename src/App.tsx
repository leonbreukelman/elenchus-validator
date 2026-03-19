import React, { useState, useEffect } from 'react';
import { TheoryLibrary } from './components/TheoryLibrary';
import { StressTestConsole } from './components/StressTestConsole';
import { ValidationReport } from './components/ValidationReport';
import { DeveloperDocs } from './components/DeveloperDocs';
import { Theory, ProbeResult, AttackResult, THEORIES } from './services/validator';
import { 
  Shield, 
  Activity, 
  Zap, 
  Github, 
  ExternalLink,
  ChevronRight,
  Info,
  Code2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Tab = 'validator' | 'developer';

const STORAGE_KEY = 'elenchus_custom_theories';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('validator');
  const [theories, setTheories] = useState<Theory[]>(THEORIES);
  const [selectedTheory, setSelectedTheory] = useState<Theory | null>(null);
  const [testResult, setTestResult] = useState<{ probe: ProbeResult; attack: AttackResult } | null>(null);

  // Load custom theories on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const custom = JSON.parse(saved);
        setTheories([...THEORIES, ...custom]);
      } catch (e) {
        console.error('Failed to load custom theories', e);
      }
    }
  }, []);

  const handleTheorySelect = (theory: Theory) => {
    setSelectedTheory(theory);
    setTestResult(null);
  };

  const handleAddTheory = (newTheory: Omit<Theory, 'id'>) => {
    const theory: Theory = {
      ...newTheory,
      id: `custom-${Date.now()}`
    };
    const updated = [...theories, theory];
    setTheories(updated);
    
    // Save only custom ones to localStorage
    const custom = updated.filter(t => t.id.startsWith('custom-'));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  };

  const handleTestComplete = (probe: ProbeResult, attack: AttackResult) => {
    setTestResult({ probe, attack });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-400 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Header */}
      <header className="h-16 border-b border-zinc-900 bg-black/50 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-900/20">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-sm font-black text-zinc-100 tracking-tighter uppercase italic leading-none">Elenchus Validator</h1>
            <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold mt-1">Meta-Validation Engine v1.0</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800">
            <button 
              onClick={() => setActiveTab('validator')}
              className={cn(
                "px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                activeTab === 'validator' ? "bg-emerald-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Validator
            </button>
            <button 
              onClick={() => setActiveTab('developer')}
              className={cn(
                "px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all",
                activeTab === 'developer' ? "bg-emerald-600 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Developer
            </button>
          </nav>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Node Active</span>
            </div>
            <a 
              href="https://github.com/leonbreukelman/atlas-elenchus" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:text-zinc-200 transition-colors"
            >
              <Github size={12} />
              <span>Source</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 lg:p-10">
        <AnimatePresence mode="wait">
          {activeTab === 'validator' ? (
            <motion.div 
              key="validator"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-10"
            >
              {/* Left Column: Library */}
              <div className="lg:col-span-4 space-y-8">
                <section>
                  <TheoryLibrary 
                    theories={theories}
                    onSelect={handleTheorySelect} 
                    onAdd={handleAddTheory}
                    selectedId={selectedTheory?.id} 
                  />
                </section>

                <section className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-zinc-400 mb-3">
                    <Info size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Validation Logic</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    The validator runs two parallel agents. The <span className="text-zinc-300">Probe Agent</span> evaluates the theory using standard Deutsch criteria. The <span className="text-zinc-300">Saboteur Agent</span> attempts to find plausible variations. Concordance is achieved if the Probe correctly identifies a theory's vulnerability to variation.
                  </p>
                </section>
              </div>

              {/* Right Column: Execution & Report */}
              <div className="lg:col-span-8 space-y-10">
                <AnimatePresence mode="wait">
                  {!testResult ? (
                    <motion.div
                      key="console"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      <div className="mb-6">
                        <h2 className="text-2xl font-black text-zinc-100 tracking-tighter uppercase italic mb-2">
                          {selectedTheory ? `Testing: ${selectedTheory.name}` : 'Select a Theory'}
                        </h2>
                        <p className="text-xs text-zinc-500 max-w-xl">
                          {selectedTheory 
                            ? selectedTheory.description 
                            : 'Choose an explanation from the library to initiate the stress-test and variability attack sequence.'}
                        </p>
                      </div>
                      <StressTestConsole 
                        theory={selectedTheory} 
                        onComplete={handleTestComplete} 
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="report"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-black text-zinc-100 tracking-tighter uppercase italic">Validation Report</h2>
                        <button 
                          onClick={() => setTestResult(null)}
                          className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                        >
                          Run New Test <ChevronRight size={12} />
                        </button>
                      </div>
                      {selectedTheory && (
                        <ValidationReport 
                          theory={selectedTheory} 
                          probe={testResult.probe} 
                          attack={testResult.attack} 
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="developer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <DeveloperDocs />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Background Accents */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[10%] left-[10%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>
    </div>
  );
}

const cn = (...inputs: any[]) => inputs.filter(Boolean).join(' ');
