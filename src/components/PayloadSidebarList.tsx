import React from 'react';
import { PayloadTemplate } from '../types';
import {
  FolderOpen,
  Plus,
  Search,
  X,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileCode,
  Shield,
  Radio,
  Sliders,
  Cpu,
  Bookmark,
  Info,
} from 'lucide-react';

interface PayloadSidebarListProps {
  templates: PayloadTemplate[];
  selectedTemplateId: string | null;
  onSelectTemplate: (template: PayloadTemplate) => void;
  onNewScript: () => void;
  onDeleteCustomScript: (id: string) => void;
  onDuplicateScript: (template: PayloadTemplate) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Saved / Custom' },
  { id: 'pineap', label: 'PineAP' },
  { id: 'recon', label: 'Recon' },
  { id: 'system', label: 'System' },
  { id: 'interface', label: 'Interface' },
];

export const PayloadSidebarList: React.FC<PayloadSidebarListProps> = ({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onNewScript,
  onDeleteCustomScript,
  onDuplicateScript,
  searchTerm,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  isCollapsed,
  onToggleCollapse,
}) => {
  // Filter templates based on category and search query
  const filteredTemplates = templates.filter((tmpl) => {
    // Category check
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'custom' && !tmpl.isCustom) return false;
      if (categoryFilter !== 'custom' && tmpl.category !== categoryFilter) return false;
    }

    // Search query check (search in name, description, code, notes, author, tags)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const inName = tmpl.name.toLowerCase().includes(q);
      const inDesc = (tmpl.description || '').toLowerCase().includes(q);
      const inAuthor = (tmpl.author || '').toLowerCase().includes(q);
      const inNotes = (tmpl.notes || '').toLowerCase().includes(q);
      const inTags = (tmpl.tags || []).some((t) => t.toLowerCase().includes(q));
      return inName || inDesc || inAuthor || inNotes || inTags;
    }

    return true;
  });

  const customCount = templates.filter((t) => t.isCustom).length;

  if (isCollapsed) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2.5 flex flex-col items-center justify-between shadow-xl min-h-[480px]">
        <div className="flex flex-col items-center space-y-3">
          <button
            onClick={onToggleCollapse}
            className="p-2 text-slate-400 hover:text-amber-400 bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors"
            title="Expand Script Library Sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={onNewScript}
            className="p-2 text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 rounded-xl transition-colors border border-amber-500/30"
            title="Create New Blank Script"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="writing-vertical-lr transform rotate-180 text-[11px] font-mono font-bold text-slate-500 tracking-wider py-4">
          SCRIPTS ({templates.length})
        </div>

        <div className="text-[10px] font-mono text-amber-400/80 bg-amber-500/10 px-1.5 py-1 rounded">
          {customCount}★
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col shadow-xl space-y-3.5">
      {/* Header with Title, Count & Collapse */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
            <FolderOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
              <span>Script Library</span>
              <span className="text-[10px] bg-slate-800 text-amber-400 px-1.5 py-0.2 rounded-full font-mono border border-slate-700">
                {templates.length}
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">
              {customCount} saved custom • {templates.length - customCount} built-in
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={onNewScript}
            className="flex items-center space-x-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-sm"
            title="Create a new custom payload script"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>

          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 rounded-lg transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by title, description, notes..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500 transition-colors"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center space-x-1 overflow-x-auto pb-1 scrollbar-none text-[11px] font-mono">
        {CATEGORY_TABS.map((tab) => {
          const isActive = categoryFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onCategoryFilterChange(tab.id)}
              className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                  : 'bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
              }`}
            >
              {tab.label}
              {tab.id === 'custom' && customCount > 0 && ` (${customCount})`}
            </button>
          );
        })}
      </div>

      {/* Script Items List */}
      <div className="space-y-2 overflow-y-auto max-h-[640px] pr-1">
        {filteredTemplates.length === 0 ? (
          <div className="p-6 text-center bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
            <Info className="w-6 h-6 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400 font-mono">No matching scripts found</p>
            {searchTerm && (
              <button
                onClick={() => onSearchChange('')}
                className="text-[11px] text-amber-400 hover:underline font-mono"
              >
                Clear search filter
              </button>
            )}
          </div>
        ) : (
          filteredTemplates.map((tmpl) => {
            const isSelected = selectedTemplateId === tmpl.id;

            return (
              <div
                key={tmpl.id}
                onClick={() => onSelectTemplate(tmpl)}
                className={`group relative p-3 rounded-xl border transition-all cursor-pointer text-left space-y-1.5 ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500/60 shadow-md shadow-amber-950/20'
                    : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Active Indicator Accent Bar */}
                {isSelected && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 bg-amber-400 rounded-r" />
                )}

                {/* Top Row: Title & Badges */}
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                    <FileCode
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-400'
                      }`}
                    />
                    <h4
                      className={`text-xs font-bold truncate ${
                        isSelected ? 'text-amber-300' : 'text-slate-200 group-hover:text-white'
                      }`}
                      title={tmpl.name}
                    >
                      {tmpl.name}
                    </h4>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {/* Custom indicator */}
                    {tmpl.isCustom && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">
                        SAVED
                      </span>
                    )}

                    {/* Language Badge */}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                        tmpl.language === 'python'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                          : tmpl.language === 'uci'
                          ? 'bg-sky-950/80 text-sky-300 border border-sky-800/60'
                          : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                      }`}
                    >
                      {tmpl.language}
                    </span>
                  </div>
                </div>

                {/* Description View - prominent display */}
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {tmpl.description || 'No description provided.'}
                </p>

                {/* Footer Row: Metadata & Quick Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono">
                  <div className="flex items-center space-x-2 truncate">
                    {tmpl.author && (
                      <span className="truncate" title={`Author: ${tmpl.author}`}>
                        By {tmpl.author}
                      </span>
                    )}
                    {tmpl.notes && (
                      <span
                        className="text-amber-400/80 hover:text-amber-300 flex items-center space-x-0.5"
                        title={tmpl.notes}
                      >
                        <Bookmark className="w-2.5 h-2.5" />
                        <span>notes</span>
                      </span>
                    )}
                  </div>

                  {/* Actions (Duplicate, Delete) */}
                  <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateScript(tmpl);
                      }}
                      className="p-1 hover:text-amber-300 rounded hover:bg-slate-800 transition-colors"
                      title="Duplicate script as a new copy"
                    >
                      <Copy className="w-3 h-3" />
                    </button>

                    {tmpl.isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete saved script "${tmpl.name}"?`)) {
                            onDeleteCustomScript(tmpl.id);
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                        title="Delete this saved script"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
