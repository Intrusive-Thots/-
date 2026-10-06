import React, { useEffect, useState } from 'react';
import { ExecutionLog } from '../types';
import { AiFixSuggestion, blockedSuggestionReason } from '../utils/aiFix';
import { Sparkles, Code2, Copy, Check, X, Zap, Terminal, Bot, Wrench } from 'lucide-react';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'generate' | 'analyze' | 'fix';
  setActiveTab: (tab: 'generate' | 'analyze' | 'fix') => void;
  onGenerateScript: (goal: string, language: 'bash' | 'python') => Promise<string>;
  onInsertCodeToEditor: (code: string) => void;
  logToAnalyze: ExecutionLog | null;
  onAnalyzeLogApi: (log: ExecutionLog) => Promise<string>;
  onFixLog: (log: ExecutionLog) => Promise<AiFixSuggestion>;
  onRunSuggested: (command: string) => void;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  onGenerateScript,
  onInsertCodeToEditor,
  logToAnalyze,
  onAnalyzeLogApi,
  onFixLog,
  onRunSuggested,
}) => {
  const [goalPrompt, setGoalPrompt] = useState('');
  const [genLanguage, setGenLanguage] = useState<'bash' | 'python'>('bash');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [fixResult, setFixResult] = useState<AiFixSuggestion | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFixResult(null);
    setFixError(null);
    setAnalysisResult(null);
  }, [isOpen, logToAnalyze?.id, activeTab]);

  if (!isOpen) return null;

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGeneratedResult(null);
    try {
      setGeneratedResult(await onGenerateScript(goalPrompt, genLanguage));
    } catch (err: unknown) {
      setGeneratedResult(`Error generating script: ${err instanceof Error ? err.message : 'request failed'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalyzeClick = async () => {
    if (!logToAnalyze || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      setAnalysisResult(await onAnalyzeLogApi(logToAnalyze));
    } catch (err: unknown) {
      setAnalysisResult(`Error analyzing log: ${err instanceof Error ? err.message : 'request failed'}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFixClick = async () => {
    if (!logToAnalyze || isFixing) return;
    setIsFixing(true);
    setFixResult(null);
    setFixError(null);
    try {
      setFixResult(await onFixLog(logToAnalyze));
    } catch (err: unknown) {
      setFixError(err instanceof Error ? err.message : 'The AI request failed.');
    } finally {
      setIsFixing(false);
    }
  };

  const handleInsert = () => {
    if (!generatedResult) return;
    let cleanCode = generatedResult;
    const match = generatedResult.match(/```(?:bash|sh|python)?\n([\s\S]*?)```/);
    if (match?.[1]) cleanCode = match[1].trim();
    onInsertCodeToEditor(cleanCode);
    onClose();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const blocked = fixResult ? blockedSuggestionReason(fixResult.command) : null;
  const tabClass = (tab: 'generate' | 'analyze' | 'fix') =>
    `min-h-11 min-w-0 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 ${
      activeTab === tab ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-1.5rem))] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Bot className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="truncate">AI assistant</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Uses the provider and key saved in Config. The key is not stored in this project.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-2 border-b border-slate-800 shrink-0">
          <button type="button" onClick={() => setActiveTab('generate')} className={tabClass('generate')}>
            <Code2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Generate</span>
          </button>
          <button type="button" onClick={() => setActiveTab('analyze')} className={tabClass('analyze')}>
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Analyze</span>
          </button>
          <button type="button" onClick={() => setActiveTab('fix')} className={tabClass('fix')}>
            <Wrench className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Fix</span>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto min-h-0">
          {activeTab === 'generate' && (
            <form onSubmit={handleGenerateSubmit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">What should the script do?</span>
                <textarea
                  value={goalPrompt}
                  onChange={(e) => setGoalPrompt(e.target.value)}
                  rows={4}
                  placeholder="For example: show firmware, uptime, and whether the SD card is mounted."
                  className="w-full min-h-28 bg-slate-950 border border-slate-800 rounded-xl p-3 text-base text-slate-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <label className="inline-flex items-center gap-2 min-h-11">
                    <input type="radio" name="lang" checked={genLanguage === 'bash'} onChange={() => setGenLanguage('bash')} className="accent-amber-500" />
                    Shell
                  </label>
                  <label className="inline-flex items-center gap-2 min-h-11">
                    <input type="radio" name="lang" checked={genLanguage === 'python'} onChange={() => setGenLanguage('python')} className="accent-amber-500" />
                    Python 3
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={isGenerating || !goalPrompt.trim()}
                  className="min-h-11 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                  {isGenerating ? 'Drafting…' : 'Generate'}
                </button>
              </div>
              {generatedResult && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleCopy(generatedResult)} className="min-h-11 px-3 rounded-xl border border-slate-700 text-sm text-slate-200 inline-flex items-center gap-1">
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button type="button" onClick={handleInsert} className="min-h-11 px-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm inline-flex items-center gap-1">
                      <Zap className="w-4 h-4" />
                      Insert into editor
                    </button>
                  </div>
                  <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-200/90 font-mono whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                    {generatedResult}
                  </pre>
                </div>
              )}
            </form>
          )}

          {activeTab === 'analyze' && (
            logToAnalyze ? (
              <div className="space-y-4">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono space-y-1 break-all">
                  <div className="text-amber-300 font-bold">{logToAnalyze.command}</div>
                  <div className="text-slate-500">Exit {logToAnalyze.exitCode ?? 'n/a'}</div>
                </div>
                <button
                  type="button"
                  onClick={handleAnalyzeClick}
                  disabled={isAnalyzing}
                  className="w-full min-h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  {isAnalyzing ? 'Analyzing…' : 'Analyze this output'}
                </button>
                {analysisResult && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {analysisResult}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Run a command or payload first, then open Analyze.</p>
            )
          )}

          {activeTab === 'fix' && (
            logToAnalyze ? (
              <div className="space-y-4">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono space-y-2">
                  <div className="text-amber-300 font-bold break-all">{logToAnalyze.command}</div>
                  <div className="text-slate-500">Exit {logToAnalyze.exitCode ?? 'n/a'}</div>
                  {logToAnalyze.stderr && (
                    <pre className="text-rose-300 whitespace-pre-wrap max-h-32 overflow-y-auto">{logToAnalyze.stderr}</pre>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleFixClick}
                  disabled={isFixing}
                  className="w-full min-h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Wrench className={`w-4 h-4 ${isFixing ? 'animate-spin' : ''}`} />
                  {isFixing ? 'Asking your provider…' : 'Ask AI to fix this'}
                </button>
                {fixError && <p className="text-sm text-rose-300">{fixError}</p>}
                {fixResult && (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-200">{fixResult.explanation}</p>
                    {fixResult.command ? (
                      <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-200 font-mono whitespace-pre-wrap">{fixResult.command}</pre>
                    ) : (
                      <p className="text-sm text-slate-400">No command was suggested. The explanation above is the result.</p>
                    )}
                    {blocked && <p className="text-sm text-rose-300">{blocked}</p>}
                    <button
                      type="button"
                      disabled={!fixResult.command || Boolean(blocked)}
                      onClick={() => onRunSuggested(fixResult.command)}
                      className="w-full min-h-11 rounded-xl bg-slate-100 text-slate-950 font-bold text-sm disabled:opacity-40"
                    >
                      Run suggested fix
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">When a command fails, tap AI Fix on that result.</p>
            )
          )}
        </div>
      </div>
    </div>
  );
};
