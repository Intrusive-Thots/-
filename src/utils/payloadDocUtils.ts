import { PayloadTemplate } from '../types';

export interface ParsedDocBlock {
  name?: string;
  description?: string;
  author?: string;
  notes?: string;
}

/**
 * Formats a standardized docblock header for shell or python scripts
 */
export function generateDocBlockHeader(meta: {
  name: string;
  description: string;
  author?: string;
  notes?: string;
  language: 'bash' | 'python' | 'uci';
  updatedAt?: string;
}): string {
  const timestamp = meta.updatedAt || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const author = meta.author || 'WiFi Pineapple Operator';
  const notes = meta.notes || '';

  if (meta.language === 'python') {
    return [
      '#!/usr/bin/env python3',
      '"""',
      '==============================================================================',
      `Title       : ${meta.name}`,
      `Description : ${meta.description}`,
      `Author      : ${author}`,
      notes ? `Notes       : ${notes}` : null,
      `Updated     : ${timestamp}`,
      '==============================================================================',
      '"""',
      '',
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  // Bash / POSIX / UCI format
  return [
    '#!/bin/sh',
    '# =============================================================================',
    `# Title       : ${meta.name}`,
    `# Description : ${meta.description}`,
    `# Author      : ${author}`,
    notes ? `# Notes       : ${notes}` : null,
    `# Updated     : ${timestamp}`,
    '# =============================================================================',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/**
 * Extracts title, description, author, and notes from code comments
 */
export function parseDocBlockFromCode(code: string): ParsedDocBlock {
  const result: ParsedDocBlock = {};
  if (!code || typeof code !== 'string') return result;

  const lines = code.split('\n').slice(0, 30); // Look in the first 30 lines
  const commentTextLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check for explicit labeled tags
    const titleMatch = line.match(/^(?:#|\/\*|\*|\"\"\")\s*(?:Title|Name|Script)\s*[:=]\s*(.+)$/i);
    if (titleMatch && !result.name) {
      result.name = titleMatch[1].trim();
      continue;
    }

    const descMatch = line.match(/^(?:#|\/\*|\*|\"\"\")\s*(?:Description|Summary|Objective|Purpose|About)\s*[:=]\s*(.+)$/i);
    if (descMatch && !result.description) {
      result.description = descMatch[1].trim();
      continue;
    }

    const authorMatch = line.match(/^(?:#|\/\*|\*|\"\"\")\s*(?:Author|Creator|Operator)\s*[:=]\s*(.+)$/i);
    if (authorMatch && !result.author) {
      result.author = authorMatch[1].trim();
      continue;
    }

    const notesMatch = line.match(/^(?:#|\/\*|\*|\"\"\")\s*(?:Notes|Prerequisites|Requirements|Notice)\s*[:=]\s*(.+)$/i);
    if (notesMatch && !result.notes) {
      result.notes = notesMatch[1].trim();
      continue;
    }

    // Collect general comment lines after shebang if no description found yet
    if (line.startsWith('#') && !line.startsWith('#!') && !line.includes('====') && !line.includes('----')) {
      const stripped = line.replace(/^#+\s*/, '').trim();
      if (stripped.length > 5) {
        commentTextLines.push(stripped);
      }
    }
  }

  // Fallback: if no explicit Description: tag was found, use the first meaningful comment line
  if (!result.description && commentTextLines.length > 0) {
    result.description = commentTextLines[0];
  }

  return result;
}

/**
 * Injects or replaces the doc block header at the top of the script
 */
export function injectOrUpdateDocBlock(
  currentCode: string,
  meta: {
    name: string;
    description: string;
    author?: string;
    notes?: string;
    language: 'bash' | 'python' | 'uci';
  }
): string {
  const newHeader = generateDocBlockHeader(meta).trimEnd();

  // Check if there is an existing header block between # ===... or """ ===...
  const bashHeaderPattern = /^(?:#!\/bin\/sh\s*\n)?#\s*={5,}[\s\S]*?#\s*={5,}\s*\n*/;
  const pythonHeaderPattern = /^(?:#!\/usr\/bin\/env python3\s*\n)?"""\s*\n={5,}[\s\S]*?={5,}\s*\n"""\s*\n*/;

  if (meta.language === 'python' && pythonHeaderPattern.test(currentCode)) {
    return currentCode.replace(pythonHeaderPattern, newHeader + '\n\n');
  }

  if (bashHeaderPattern.test(currentCode)) {
    return currentCode.replace(bashHeaderPattern, newHeader + '\n\n');
  }

  // If no existing block, but shebang exists, place header after shebang
  const shebangMatch = currentCode.match(/^#!.*?\n/);
  if (shebangMatch) {
    const shebang = shebangMatch[0];
    const rest = currentCode.slice(shebang.length).trimStart();
    // Use header without duplicated shebang
    const headerWithoutShebang = newHeader.replace(/^#!.*?\n/, '');
    return `${shebang}${headerWithoutShebang}\n\n${rest}`;
  }

  // Otherwise prepend new header to current code
  return `${newHeader}\n\n${currentCode.trimStart()}`;
}

export const INLINE_COMMENT_SNIPPETS = [
  {
    label: 'Prerequisite Check',
    description: 'Ensure monitor interface wlan1mon is active',
    codeBash: '# [PRE-CHECK: Ensure wlan1mon is UP before continuing]\nif ! ifconfig wlan1mon >/dev/null 2>&1; then airmon-ng start wlan1; fi\n',
    codePython: '# [PRE-CHECK: Verify network interface]\nimport subprocess\nsubprocess.run(["ifconfig", "wlan1mon"], check=False)\n',
  },
  {
    label: 'Parameter Documentation',
    description: 'Document script arguments ($1 target, $2 channel)',
    codeBash: '# [PARAMS] $1 = Target BSSID (e.g. 00:11:22:33:44:55), $2 = Channel\nTARGET_BSSID="${1:-FF:FF:FF:FF:FF:FF}"\nCHANNEL="${2:-6}"\n',
    codePython: '# [PARAMS] sys.argv[1] = Target BSSID, sys.argv[2] = Channel\nimport sys\ntarget_bssid = sys.argv[1] if len(sys.argv) > 1 else "FF:FF:FF:FF:FF:FF"\n',
  },
  {
    label: 'Safety / Authorization Notice',
    description: 'Audit & lab authorization header',
    codeBash: '# [SECURITY AUDIT] For authorized penetration testing and educational lab use only.\n# Ensure client consent prior to executing rogue AP deauth bursts.\n',
    codePython: '# [SECURITY AUDIT] For authorized penetration testing and educational lab use only.\n# Ensure client consent prior to executing rogue AP deauth bursts.\n',
  },
  {
    label: 'Output & Artifact Logging',
    description: 'Redirect timestamps & logs to /tmp',
    codeBash: '# [LOGGING] Save timestamped artifacts to /tmp\nLOG_FILE="/tmp/pineapple_run_$(date +%s).log"\nexec > >(tee -a "$LOG_FILE") 2>&1\n',
    codePython: '# [LOGGING] Initialize log artifact\nimport datetime\nlog_file = f"/tmp/pineapple_run_{int(datetime.datetime.now().timestamp())}.log"\n',
  },
  {
    label: 'Cleanup & Teardown Routine',
    description: 'Reset interface state on trap / exit',
    codeBash: '# [TEARDOWN] Cleanup interface state upon script exit\ntrap "echo \'[!] Interrupted. Resetting...\'; airmon-ng stop wlan1mon 2>/dev/null; exit" INT TERM EXIT\n',
    codePython: '# [TEARDOWN] Reset interfaces upon exit\nimport atexit\natexit.register(lambda: print("[!] Cleanup routine triggered"))\n',
  },
];
