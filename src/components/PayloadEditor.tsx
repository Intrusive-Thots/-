import React, { useState, useEffect } from 'react';
import { PayloadTemplate, ExecutionLog } from '../types';
import { INITIAL_PAYLOAD_TEMPLATES } from '../data/payloadTemplates';
import { PayloadSidebarList } from './PayloadSidebarList';
import { PayloadDocumentationPanel } from './PayloadDocumentationPanel';
import {
  Play,
  Sparkles,
  Save,
  Download,
  Upload,
  Copy,
  Check,
  FileCode,
  Terminal,
  Zap,
  Code2,
  CalendarClock,
  FileText,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Sidebar,
  Info,
} from 'lucide-react';
import { parseDocBlockFromCode } from '../utils/payloadDocUtils';

interface PayloadEditorProps {
  onRunPayload: (code: string, language: 'bash' | 'python' | 'uci', name: string) => void;
  onSchedulePayload?: (name: string, code: string, language: 'bash' | 'python' | 'uci') => void;
  isExecuting: boolean;
  lastLog: ExecutionLog | null;
  onOpenAiGenerator: () => void;
  onAnalyzeLog: (log: ExecutionLog) => void;
  injectedCode?: { code: string; language: 'bash' | 'python' | 'uci'; name?: string } | null;
  onClearInjectedCode?: () => void;
}

export const PayloadEditor: React.FC<PayloadEditorProps> = ({
  onRunPayload,
  onSchedulePayload,
  isExecuting,
  lastLog,
  onOpenAiGenerator,
  onAnalyzeLog,
  injectedCode,
  onClearInjectedCode,
}) => {
  // Saved and built-in templates
  const [templates, setTemplates] = useState<PayloadTemplate[]>(() => {
    try {
      const saved = localStorage.getItem('wifi_pineapple_custom_templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return [...parsed, ...INITIAL_PAYLOAD_TEMPLATES];
        }
      }
    } catch (e) {
      console.warn('Error reading saved custom templates', e);
    }
    return INITIAL_PAYLOAD_TEMPLATES;
  });

  // Current editor state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(INITIAL_PAYLOAD_TEMPLATES[0].id);
  const [scriptName, setScriptName] = useState<string>(INITIAL_PAYLOAD_TEMPLATES[0].name);
  const [description, setDescription] = useState<string>(INITIAL_PAYLOAD_TEMPLATES[0].description);
  const [author, setAuthor] = useState<string>(INITIAL_PAYLOAD_TEMPLATES[0].author || 'Hak5 Official');
  const [notes, setNotes] = useState<string>(INITIAL_PAYLOAD_TEMPLATES[0].notes || '');
  const [category, setCategory] = useState<'pineap' | 'recon' | 'interface' | 'system' | 'custom'>(
    INITIAL_PAYLOAD_TEMPLATES[0].category
  );
  const [language, setLanguage] = useState<'bash' | 'python' | 'uci'>(INITIAL_PAYLOAD_TEMPLATES[0].language);
  const [code, setCode] = useState<string>(INITIAL_PAYLOAD_TEMPLATES[0].code);

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showDocPanel, setShowDocPanel] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Handle injected code (from AI generator or external action)
  useEffect(() => {
    if (injectedCode) {
      setCode(injectedCode.code);
      if (injectedCode.language) {
        setLanguage(injectedCode.language);
      }
      if (injectedCode.name) {
        setScriptName(injectedCode.name);
      }
      // Attempt to parse any docblock comments from the injected code
      const parsed = parseDocBlockFromCode(injectedCode.code);
      if (parsed.description) {
        setDescription(parsed.description);
      }
      if (parsed.author) {
        setAuthor(parsed.author);
      }
      if (parsed.notes) {
        setNotes(parsed.notes);
      }
      setSelectedTemplateId('');
      setCategory('custom');
      setShowDocPanel(true);
      onClearInjectedCode?.();
    }
  }, [injectedCode, onClearInjectedCode]);

  // Synchronize custom templates to localStorage
  const persistCustomTemplates = (updatedList: PayloadTemplate[]) => {
    try {
      const customOnly = updatedList.filter((t) => t.isCustom);
      localStorage.setItem('wifi_pineapple_custom_templates', JSON.stringify(customOnly));
    } catch (e) {
      console.warn('Could not save custom templates to localStorage', e);
    }
  };

  // Select a template from sidebar list
  const handleSelectTemplate = (tmpl: PayloadTemplate) => {
    setSelectedTemplateId(tmpl.id);
    setScriptName(tmpl.name);
    setDescription(tmpl.description || '');
    setAuthor(tmpl.author || '');
    setNotes(tmpl.notes || '');
    setCategory(tmpl.category);
    setLanguage(tmpl.language);
    setCode(tmpl.code);
  };

  // Start new blank script
  const handleNewScript = () => {
    setSelectedTemplateId('');
    setScriptName('New Custom Payload');
    setDescription('Custom script execution on WiFi Pineapple');
    setAuthor('Operator');
    setNotes('');
    setCategory('custom');
    setLanguage('bash');
    setCode(`#!/bin/sh\n# Custom WiFi Pineapple payload\n\necho "[+] Running payload..."\n`);
    setShowDocPanel(true);
  };

  // Delete a saved custom script
  const handleDeleteCustomScript = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    persistCustomTemplates(updated);

    if (selectedTemplateId === id) {
      handleSelectTemplate(updated[0] || INITIAL_PAYLOAD_TEMPLATES[0]);
    }
  };

  // Duplicate an existing script as a custom payload
  const handleDuplicateScript = (tmpl: PayloadTemplate) => {
    const newId = `custom_${Date.now()}`;
    const duplicated: PayloadTemplate = {
      ...tmpl,
      id: newId,
      name: `${tmpl.name} (Copy)`,
      isCustom: true,
      category: 'custom',
      updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };

    const updated = [duplicated, ...templates];
    setTemplates(updated);
    persistCustomTemplates(updated);
    handleSelectTemplate(duplicated);

    setSaveStatus(`Duplicated as "${duplicated.name}"`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // Save current script (Update existing custom script or create new)
  const handleSavePayload = () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const isCurrentCustom = templates.some((t) => t.id === selectedTemplateId && t.isCustom);

    if (isCurrentCustom) {
      // Update existing
      const updated = templates.map((t) => {
        if (t.id === selectedTemplateId) {
          return {
            ...t,
            name: scriptName.trim() || 'Custom Payload',
            description: description.trim() || 'Saved user payload',
            author: author.trim() || 'Operator',
            notes: notes.trim(),
            category,
            language,
            code,
            updatedAt: timestamp,
          };
        }
        return t;
      });

      setTemplates(updated);
      persistCustomTemplates(updated);
      setSaveStatus('Updated saved payload with description!');
    } else {
      // Save as new custom template
      const newTmpl: PayloadTemplate = {
        id: `custom_${Date.now()}`,
        name: scriptName.trim() || 'Custom Payload',
        category: 'custom',
        description: description.trim() || 'Saved user payload',
        author: author.trim() || 'Operator',
        notes: notes.trim(),
        language,
        code,
        isCustom: true,
        updatedAt: timestamp,
      };

      const updated = [newTmpl, ...templates];
      setTemplates(updated);
      setSelectedTemplateId(newTmpl.id);
      persistCustomTemplates(updated);
      setSaveStatus('Saved new payload with description to library!');
    }

    setTimeout(() => setSaveStatus(null), 3500);
  };

  // Copy code to clipboard
  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download script file (.sh, .py)
  const handleDownloadScript = () => {
    const ext = language === 'python' ? 'py' : 'sh';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scriptName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Upload script file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCode(content);
        setScriptName(file.name.replace(/\.[^/.]+$/, ''));
        if (file.name.endsWith('.py')) {
          setLanguage('python');
        } else {
          setLanguage('bash');
        }
        // Extract any doc comments from uploaded script
        const parsed = parseDocBlockFromCode(content);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.author) setAuthor(parsed.author);
        if (parsed.notes) setNotes(parsed.notes);
        setSelectedTemplateId('');
        setCategory('custom');
      }
    };
    reader.readAsText(file);
  };

  const handleRun = () => {
    onRunPayload(code, language, scriptName);
  };

  const isCurrentCustom = templates.some((t) => t.id === selectedTemplateId && t.isCustom);

  return (
    <div className="space-y-6">
      {/* Top Header Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-slate-100 font-mono">WiFi Pineapple Code Runner & Library</h2>
              <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-full font-mono">
                v2.1
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Compose, document, and execute payloads with inline docstrings, saved descriptions, and autonomous scheduling
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* AI Generator Button */}
            <button
              onClick={onOpenAiGenerator}
              className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Generate with Gemini</span>
            </button>

            {/* Schedule Button */}
            {onSchedulePayload && (
              <button
                onClick={() => onSchedulePayload(scriptName || 'Custom Payload', code, language)}
                disabled={!code.trim()}
                className="flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm font-mono disabled:opacity-50"
                title="Schedule this payload to run on intervals or specific time"
              >
                <CalendarClock className="w-4 h-4 text-amber-400" />
                <span>Schedule Payload</span>
              </button>
            )}

            {/* Run Button */}
            <button
              onClick={handleRun}
              disabled={isExecuting || !code.trim()}
              className="flex items-center space-x-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg transition-all font-mono disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isExecuting ? 'Running on Hardware...' : 'Run on Pineapple'}</span>
            </button>
          </div>
        </div>

        {/* Save Status Notification Banner */}
        {saveStatus && (
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between font-mono animate-fadeIn">
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{saveStatus}</span>
            </div>
            <span className="text-[10px] text-amber-400/80">Visible in Sidebar List</span>
          </div>
        )}
      </div>

      {/* Main Two-Column Layout: Sidebar List View + Code Editor Area */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Sidebar List View */}
        <div className={`w-full ${isSidebarCollapsed ? 'lg:w-16' : 'lg:w-80 xl:w-96'} flex-shrink-0 transition-all duration-200`}>
          <PayloadSidebarList
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={handleSelectTemplate}
            onNewScript={handleNewScript}
            onDeleteCustomScript={handleDeleteCustomScript}
            onDuplicateScript={handleDuplicateScript}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          />
        </div>

        {/* Right Column: Editor Canvas & Documentation Panel */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          {/* Script Header Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <Code2 className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <input
                  type="text"
                  value={scriptName}
                  onChange={(e) => setScriptName(e.target.value)}
                  placeholder="Payload Name"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-100 font-mono focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="flex items-center space-x-2 flex-wrap">
                {/* Language Runtime */}
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                >
                  <option value="bash">Bash / Shell (/bin/sh)</option>
                  <option value="python">Python 3 (python3)</option>
                  <option value="uci">UCI Config Script</option>
                </select>

                {/* Category for custom scripts */}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                >
                  <option value="custom">Custom / Saved</option>
                  <option value="pineap">PineAP</option>
                  <option value="recon">Recon</option>
                  <option value="system">System</option>
                  <option value="interface">Interface</option>
                </select>

                {/* Documentation Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowDocPanel(!showDocPanel)}
                  className={`flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
                    showDocPanel
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Toggle Inline Documentation & Comments Panel"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Documentation</span>
                  {showDocPanel ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                </button>
              </div>
            </div>

            {/* Quick action strip: Save, Upload, Download, Copy */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs font-mono">
              <div className="flex items-center space-x-2 text-slate-400 text-[11px]">
                <span>Status:</span>
                <span className={`px-2 py-0.5 rounded font-bold ${isCurrentCustom ? 'bg-purple-950 text-purple-300 border border-purple-800/60' : 'bg-slate-800 text-slate-300'}`}>
                  {isCurrentCustom ? 'Saved Custom Script' : 'Built-in Template'}
                </span>
                {description && (
                  <span className="hidden md:inline text-slate-500 truncate max-w-xs">
                    "{description}"
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <label className="cursor-pointer px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] border border-slate-700 transition-colors flex items-center space-x-1">
                  <Upload className="w-3 h-3 text-slate-400" />
                  <span>Import</span>
                  <input type="file" onChange={handleFileUpload} accept=".sh,.py,.txt" className="hidden" />
                </label>

                <button
                  onClick={handleDownloadScript}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] border border-slate-700 transition-colors flex items-center space-x-1"
                  title="Download payload script file"
                >
                  <Download className="w-3 h-3 text-slate-400" />
                  <span>Export</span>
                </button>

                <button
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] border border-slate-700 transition-colors flex items-center space-x-1"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                {/* Save / Update button */}
                <button
                  onClick={handleSavePayload}
                  className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-[11px] font-bold border border-amber-500/40 transition-colors flex items-center space-x-1.5 shadow-sm"
                  title="Save payload with description and metadata to library"
                >
                  <Save className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isCurrentCustom ? 'Update Script' : 'Save as Custom'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Inline Documentation & Comments Panel */}
          {showDocPanel && (
            <PayloadDocumentationPanel
              description={description}
              onChangeDescription={setDescription}
              author={author}
              onChangeAuthor={setAuthor}
              notes={notes}
              onChangeNotes={setNotes}
              code={code}
              onUpdateCode={setCode}
              scriptName={scriptName}
              language={language}
              isCustomScript={isCurrentCustom}
            />
          )}

          {/* Editor Main Canvas */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Editor Top Status Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs font-mono text-slate-400">
              <div className="flex items-center space-x-3">
                <span className="text-amber-400 font-bold">{scriptName || 'untitled_payload'}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">{language}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-500">{code.split('\n').length} lines</span>
                <span className="text-slate-500">({code.length} chars)</span>
              </div>

              <div className="text-[11px] text-slate-500 font-mono">
                Tab indentation enabled
              </div>
            </div>

            {/* Code Textarea Area */}
            <div className="p-4 bg-slate-950 font-mono text-xs">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  // Support tab key indentation in textarea
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const target = e.target as HTMLTextAreaElement;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const newCode = code.substring(0, start) + '    ' + code.substring(end);
                    setCode(newCode);
                    setTimeout(() => {
                      target.selectionStart = target.selectionEnd = start + 4;
                    }, 0);
                  }
                }}
                rows={16}
                spellCheck={false}
                className="w-full bg-transparent text-amber-200/90 leading-relaxed focus:outline-none resize-none font-mono selection:bg-amber-500/30"
                placeholder="# Write your WiFi Pineapple script here..."
              />
            </div>
          </div>

          {/* Execution Output Console Box */}
          {lastLog && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-2 rounded-xl border ${
                      lastLog.status === 'success'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border-rose-800'
                    }`}
                  >
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                      <span>Execution Output</span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                          lastLog.status === 'success' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
                        }`}
                      >
                        Exit Code: {lastLog.exitCode ?? 'N/A'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {lastLog.timestamp} | Duration: {lastLog.durationMs}ms
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onAnalyzeLog(lastLog)}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all font-mono"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Analyze Output with Gemini</span>
                </button>
              </div>

              {/* STDOUT View */}
              {lastLog.stdout && (
                <div className="space-y-1">
                  <span className="text-[11px] font-mono text-slate-400 font-bold uppercase">STDOUT:</span>
                  <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-72">
                    {lastLog.stdout}
                  </pre>
                </div>
              )}

              {/* STDERR View */}
              {lastLog.stderr && (
                <div className="space-y-1">
                  <span className="text-[11px] font-mono text-slate-400 font-bold uppercase text-rose-400">STDERR:</span>
                  <pre className="p-4 bg-slate-950 border border-rose-950 rounded-xl font-mono text-xs text-rose-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-48">
                    {lastLog.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
