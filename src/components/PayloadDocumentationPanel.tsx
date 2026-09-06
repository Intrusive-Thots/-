import React, { useState } from 'react';
import {
  FileText,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Tag,
  User,
  AlertCircle,
  HelpCircle,
  Code,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  INLINE_COMMENT_SNIPPETS,
  parseDocBlockFromCode,
  injectOrUpdateDocBlock,
} from '../utils/payloadDocUtils';

interface PayloadDocumentationPanelProps {
  description: string;
  onChangeDescription: (desc: string) => void;
  author: string;
  onChangeAuthor: (author: string) => void;
  notes: string;
  onChangeNotes: (notes: string) => void;
  code: string;
  onUpdateCode: (newCode: string) => void;
  scriptName: string;
  language: 'bash' | 'python' | 'uci';
  isCustomScript: boolean;
}

export const PayloadDocumentationPanel: React.FC<PayloadDocumentationPanelProps> = ({
  description,
  onChangeDescription,
  author,
  onChangeAuthor,
  notes,
  onChangeNotes,
  code,
  onUpdateCode,
  scriptName,
  language,
  isCustomScript,
}) => {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showSnippetMenu, setShowSnippetMenu] = useState(false);

  // Syncs current UI metadata into the code's docblock comments header
  const handleSyncToCode = () => {
    const updated = injectOrUpdateDocBlock(code, {
      name: scriptName || 'Custom Payload',
      description: description.trim() || 'Custom WiFi Pineapple payload execution',
      author: author.trim() || 'Operator',
      notes: notes.trim(),
      language,
    });
    onUpdateCode(updated);
    setSyncStatus('Docblock synced to code comments!');
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // Extracts metadata from existing code comments into the UI fields
  const handleExtractFromCode = () => {
    const parsed = parseDocBlockFromCode(code);
    let extractedCount = 0;
    if (parsed.description) {
      onChangeDescription(parsed.description);
      extractedCount++;
    }
    if (parsed.author) {
      onChangeAuthor(parsed.author);
      extractedCount++;
    }
    if (parsed.notes) {
      onChangeNotes(parsed.notes);
      extractedCount++;
    }

    if (extractedCount > 0) {
      setSyncStatus(`Extracted ${extractedCount} fields from code comments!`);
    } else {
      setSyncStatus('No tagged comments found in the script.');
    }
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // Inserts a specific inline comment snippet into code
  const handleInsertSnippet = (snippet: typeof INLINE_COMMENT_SNIPPETS[0]) => {
    const commentCode = language === 'python' ? snippet.codePython : snippet.codeBash;
    // Append or insert at the end of the docblock
    const updatedCode = code + '\n\n' + commentCode;
    onUpdateCode(updatedCode);
    setShowSnippetMenu(false);
    setSyncStatus(`Inserted "${snippet.label}" comment snippet`);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
      {/* Panel Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
            Inline Documentation & Script Comments
          </h3>
          <span className="text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono">
            Syncs with Sidebar List
          </span>
        </div>

        <div className="flex items-center space-x-1.5 flex-wrap">
          {/* Sync UI fields into code docblock */}
          <button
            type="button"
            onClick={handleSyncToCode}
            className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-mono transition-colors"
            title="Inject or update docblock header comment at top of script"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-amber-400" />
            <span>Sync To Code</span>
          </button>

          {/* Extract docblock from code comments */}
          <button
            type="button"
            onClick={handleExtractFromCode}
            className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-mono transition-colors"
            title="Scan code comments (# Description:, # Notes:) to populate documentation fields"
          >
            <ArrowUpFromLine className="w-3.5 h-3.5 text-slate-400" />
            <span>Extract From Code</span>
          </button>

          {/* Quick Comment Snippets Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSnippetMenu(!showSnippetMenu)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-mono transition-colors"
            >
              <Code className="w-3.5 h-3.5 text-slate-400" />
              <span>Insert Comment</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showSnippetMenu && (
              <div className="absolute right-0 mt-1 w-64 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-30 space-y-0.5">
                <div className="px-3 py-1 text-[10px] font-mono text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  Inline Comment Snippets
                </div>
                {INLINE_COMMENT_SNIPPETS.map((snippet, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleInsertSnippet(snippet)}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800/80 transition-colors flex flex-col space-y-0.5"
                  >
                    <span className="text-xs font-bold text-slate-200 font-mono">
                      {snippet.label}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {snippet.description}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div className="p-2 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-[11px] text-emerald-300 flex items-center space-x-1.5 font-mono animate-fadeIn">
          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>{syncStatus}</span>
        </div>
      )}

      {/* Form Fields: Description, Author, Notes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Description Field (Takes 2 cols) */}
        <div className="md:col-span-2 space-y-1">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between font-mono">
            <span className="flex items-center space-x-1">
              <span>Script Description (Visible in Sidebar List)</span>
              <span className="text-amber-400">*</span>
            </span>
            <span className="text-[10px] text-slate-500 font-normal">
              {description.length} chars
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => onChangeDescription(e.target.value)}
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-sans focus:outline-none focus:border-amber-500 transition-colors leading-relaxed"
            placeholder="Describe what this script accomplishes, target parameters, and expected outcome..."
          />
        </div>

        {/* Author & Notes */}
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1 font-mono">
              <User className="w-3 h-3 text-slate-400" />
              <span>Author / Operator</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => onChangeAuthor(e.target.value)}
              placeholder="e.g. Hak5 / Operator"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1 font-mono">
              <Tag className="w-3 h-3 text-slate-400" />
              <span>Prerequisites / Notes</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => onChangeNotes(e.target.value)}
              placeholder="e.g. Requires wlan1mon monitor mode"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
