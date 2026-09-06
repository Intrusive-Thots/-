import React, { useState } from 'react';
import { ExecutionLog } from '../types';
import { Sparkles, Code2, Copy, Check, X, ArrowRight, Zap, Terminal, ShieldAlert, Bot } from 'lucide-react';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'generate' | 'analyze';
  setActiveTab: (tab: 'generate' | 'analyze') => void;
  onGenerateScript: (goal: string, language: 'bash' | 'python') => Promise<string>;
  onInsertCodeToEditor: (code: string) => void;
  logToAnalyze: ExecutionLog | null;
  onAnalyzeLogApi: (log: ExecutionLog) => Promise<string>;
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
}) => {
  const [goalPrompt, setGoalPrompt] = useState('');
  const [genLanguage, setGenLanguage] = useState<'bash' | 'python'>('bash');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGeneratedResult(null);

    try {
      const codeRes = await onGenerateScript(goalPrompt, genLanguage);
      setGeneratedResult(codeRes);
    } catch (err: any) {
      setGeneratedResult(`Error generating script: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalyzeClick = async () => {
    if (!logToAnalyze || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const res = await onAnalyzeLogApi(logToAnalyze);
      setAnalysisResult(res);
    } catch (err: any) {
      setAnalysisResult(`Error analyzing log: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleInsert = () => {
    if (!generatedResult) return;
    // Extract code block if markdown format
    let cleanCode = generatedResult;
    const match = generatedResult.match(/```(?:bash|python)?\n([\s\S]*?)```/);
    if (match && match[1]) {
      cleanCode = match[1].trim();
    }
    onInsertCodeToEditor(cleanCode);
    onClose();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                <span>Gemini AI Security Assistant</span>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                  Gemini 2.5
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Generate OpenWrt/Pineapple payloads or analyze execution stdout/stderr logs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-6 pt-3 space-x-4">
          <button
            onClick={() => setActiveTab('generate')}
            className={`pb-3 text-xs font-bold font-mono transition-colors border-b-2 flex items-center space-x-2 ${
              activeTab === 'generate'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>Generate Payload</span>
          </button>

          <button
            onClick={() => setActiveTab('analyze')}
            className={`pb-3 text-xs font-bold font-mono transition-colors border-b-2 flex items-center space-x-2 ${
              activeTab === 'analyze'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Analyze Log Output</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {activeTab === 'generate' ? (
            <div className="space-y-5">
              <form onSubmit={handleGenerateSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 font-mono">
                    Describe Payload Goal / Objective
                  </label>
                  <textarea
                    value={goalPrompt}
                    onChange={(e) => setGoalPrompt(e.target.value)}
                    rows={3}
                    placeholder="e.g., Write a script that checks wlan1mon, logs active client probe requests with timestamps to /sd/probes.csv, and triggers an alert if a specific MAC is detected..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
                    required
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-slate-400 font-mono">Target Language:</span>
                    <label className="inline-flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="lang"
                        value="bash"
                        checked={genLanguage === 'bash'}
                        onChange={() => setGenLanguage('bash')}
                        className="accent-amber-500"
                      />
                      <span>Bash / OpenWrt shell</span>
                    </label>
                    <label className="inline-flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="lang"
                        value="python"
                        checked={genLanguage === 'python'}
                        onChange={() => setGenLanguage('python')}
                        className="accent-amber-500"
                      />
                      <span>Python 3</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isGenerating || !goalPrompt.trim()}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition-all flex items-center space-x-2"
                  >
                    <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>{isGenerating ? 'Drafting Payload...' : 'Generate Payload'}</span>
                  </button>
                </div>
              </form>

              {/* Generated Result Box */}
              {generatedResult && (
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 font-mono">Generated Script Code:</span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(generatedResult)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 flex items-center space-x-1"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleInsert}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1 shadow"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Insert into Payload Runner</span>
                      </button>
                    </div>
                  </div>

                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-200/90 font-mono whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                    {generatedResult}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {logToAnalyze ? (
                <div className="space-y-4">
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono space-y-1">
                    <div className="text-amber-400 font-bold">Target Command: {logToAnalyze.command}</div>
                    <div className="text-slate-500 text-[11px]">
                      Exit Code: {logToAnalyze.exitCode} | Output length: {logToAnalyze.stdout.length} chars
                    </div>
                  </div>

                  {!analysisResult && (
                    <button
                      onClick={handleAnalyzeClick}
                      disabled={isAnalyzing}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition-all flex items-center justify-center space-x-2"
                    >
                      <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
                      <span>{isAnalyzing ? 'Analyzing Output with Gemini...' : 'Analyze Execution Output Now'}</span>
                    </button>
                  )}

                  {analysisResult && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400 font-mono">
                          Gemini Security & Intelligence Analysis:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(analysisResult)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono border border-slate-700 flex items-center space-x-1"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap max-h-96 overflow-y-auto">
                        {analysisResult}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs font-mono">
                  No execution output selected for analysis. Run a command or payload first, then click "Analyze with Gemini".
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
