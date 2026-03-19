import React from 'react';
import { Terminal, Copy, Check, ExternalLink, Code2, Cpu, Info } from 'lucide-react';
import { useState } from 'react';

export const DeveloperDocs: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const appUrl = window.location.origin;
  const mcpUrl = `${appUrl}/mcp/sse`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const configExample = `{
  "mcpServers": {
    "elenchus-validator": {
      "url": "${mcpUrl}"
    }
  }
}`;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Cpu size={120} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-500">
              <Code2 size={24} />
            </div>
            <h2 className="text-2xl font-black text-zinc-100 tracking-tighter uppercase italic">Agentic Integration</h2>
          </div>
          
          <p className="text-zinc-400 max-w-2xl leading-relaxed mb-8">
            The Elenchus Validator is exposed as a <span className="text-zinc-100 font-bold">Model Context Protocol (MCP)</span> server. 
            This allows AI agents to autonomously call the Deutsch Probe and Variability Attack tools during their own reasoning cycles.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Connection Endpoint (SSE)</h3>
              <div className="flex items-center gap-2 bg-black border border-zinc-800 rounded-xl p-3 group">
                <code className="text-[11px] text-emerald-500 font-mono truncate flex-1">
                  {mcpUrl}
                </code>
                <button 
                  onClick={copyToClipboard}
                  className="p-2 hover:bg-zinc-800 rounded-md transition-colors text-zinc-500 hover:text-zinc-200"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                Use this URL in any MCP-compatible client (Claude Desktop, Cursor, etc.) to give your agent the ability to validate its own explanations.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Available Tools</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="mt-1 p-1 bg-zinc-800 rounded text-zinc-400">
                    <Terminal size={10} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-zinc-300 font-mono">run_deutsch_probe</div>
                    <div className="text-[10px] text-zinc-500">Evaluates explanation quality vs Deutsch criteria.</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1 p-1 bg-zinc-800 rounded text-zinc-400">
                    <Terminal size={10} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-zinc-300 font-mono">run_variability_attack</div>
                    <div className="text-[10px] text-zinc-500">Stress-tests a theory for variability.</div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Claude Desktop Configuration</h3>
        <div className="relative group">
          <pre className="bg-black p-6 rounded-xl border border-zinc-800 font-mono text-[11px] text-zinc-400 overflow-x-auto">
            {configExample}
          </pre>
          <button 
            onClick={() => navigator.clipboard.writeText(configExample)}
            className="absolute top-4 right-4 p-2 bg-zinc-900 border border-zinc-800 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:text-emerald-500"
          >
            <Copy size={14} />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-600">
          <Info size={12} />
          <span>Add this to your <code className="text-zinc-400">claude_desktop_config.json</code> to enable the tools.</span>
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener" className="ml-auto text-emerald-500 hover:underline flex items-center gap-1">
            MCP Docs <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
};
