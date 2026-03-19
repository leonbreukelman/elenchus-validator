import React, { useState } from 'react';
import { Theory } from '../services/validator';
import { Book, FlaskConical, Ghost, TrendingUp, Plus, X, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  theories: Theory[];
  onSelect: (theory: Theory) => void;
  onAdd: (theory: Omit<Theory, 'id'>) => void;
  selectedId?: string;
}

export const TheoryLibrary: React.FC<Props> = ({ theories, onSelect, onAdd, selectedId }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTheory, setNewTheory] = useState<Omit<Theory, 'id'>>({
    name: '',
    description: '',
    category: 'Scientific'
  });

  const getIcon = (category: Theory['category']) => {
    switch (category) {
      case 'Scientific': return <FlaskConical size={16} />;
      case 'Pseudo-scientific': return <Ghost size={16} />;
      case 'Mythological': return <Book size={16} />;
      case 'Economic': return <TrendingUp size={16} />;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTheory.name || !newTheory.description) return;
    onAdd(newTheory);
    setNewTheory({ name: '', description: '', category: 'Scientific' });
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Theory Library</h3>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
        >
          {isAdding ? <X size={14} /> : <Plus size={14} />}
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleSubmit}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 overflow-hidden"
          >
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Name</label>
              <input 
                type="text"
                value={newTheory.name}
                onChange={e => setNewTheory({ ...newTheory, name: e.target.value })}
                placeholder="e.g. Simulation Theory"
                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Description</label>
              <textarea 
                value={newTheory.description}
                onChange={e => setNewTheory({ ...newTheory, description: e.target.value })}
                placeholder="Briefly explain the core mechanism..."
                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50 min-h-[60px]"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Category</label>
                <select 
                  value={newTheory.category}
                  onChange={e => setNewTheory({ ...newTheory, category: e.target.value as any })}
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="Scientific">Scientific</option>
                  <option value="Pseudo-scientific">Pseudo-scientific</option>
                  <option value="Mythological">Mythological</option>
                  <option value="Economic">Economic</option>
                </select>
              </div>
              <button 
                type="submit"
                className="mt-5 p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
              >
                <Save size={16} />
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {theories.map((theory) => (
          <button
            key={theory.id}
            onClick={() => onSelect(theory)}
            className={cn(
              "group relative flex flex-col p-4 rounded-xl border transition-all text-left overflow-hidden",
              selectedId === theory.id 
                ? "bg-emerald-500/5 border-emerald-500/30 ring-1 ring-emerald-500/20" 
                : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "p-1.5 rounded-md",
                selectedId === theory.id ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"
              )}>
                {getIcon(theory.category)}
              </div>
              <span className="text-xs font-bold text-zinc-300 group-hover:text-zinc-100 transition-colors">
                {theory.name}
              </span>
              <span className="ml-auto text-[10px] text-zinc-600 font-mono uppercase">
                {theory.category}
              </span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
              {theory.description}
            </p>
            {selectedId === theory.id && (
              <div className="absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 bg-emerald-500/10 rounded-full blur-2xl" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
