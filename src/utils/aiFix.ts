export type AiProvider = 'openai' | 'anthropic' | 'gemini';

export const AI_PROVIDERS: AiProvider[] = ['openai', 'anthropic', 'gemini'];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-20241022',
  gemini: 'gemini-2.5-flash',
};

const OUTPUT_LIMIT = 4000;

const BLOCKED_SUGGESTION = [
  /\bdeauth/i,
  /\bhandshake/i,
  /\baircrack/i,
  /\bmdk[34]\b/i,
  /\breaver\b/i,
  /\bbully\b/i,
  /\bhostapd-wpe\b/i,
  /\bevil[- ]?twin/i,
  /\bairmon-ng\b/i,
  /\bmacchanger\b/i,
];

export function isAiProvider(value: string): value is AiProvider {
  return value === 'openai' || value === 'anthropic' || value === 'gemini';
}

export function defaultModel(provider: AiProvider): string {
  return DEFAULT_MODELS[provider];
}

export function sanitizeModel(model: string, provider: AiProvider): string {
  const trimmed = model.trim();
  if (/^[A-Za-z0-9._:-]{1,80}$/.test(trimmed)) return trimmed;
  return defaultModel(provider);
}

export function clipOutput(text: string, limit = OUTPUT_LIMIT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n…[truncated]`;
}

export interface AiFixSuggestion {
  explanation: string;
  command: string;
}

export function parseFixResponse(raw: string): AiFixSuggestion {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();
  try {
    const parsed = JSON.parse(text) as { explanation?: unknown; command?: unknown };
    const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';
    const command = typeof parsed.command === 'string' ? parsed.command.trim() : '';
    if (!explanation && !command) {
      return { explanation: raw.trim() || 'The provider returned an empty response.', command: '' };
    }
    return {
      explanation: explanation || 'The provider returned a command without an explanation.',
      command,
    };
  } catch {
    return { explanation: raw.trim() || 'The provider returned an empty response.', command: '' };
  }
}

export function isScriptCommand(command: string): boolean {
  return command.includes('\n') || command.startsWith('#!');
}

export function blockedSuggestionReason(command: string): string | null {
  if (!command.trim()) return null;
  if (BLOCKED_SUGGESTION.some((pattern) => pattern.test(command))) {
    return 'That suggestion is outside the commands this app will run. Use the explanation, or edit a payload yourself.';
  }
  return null;
}

const BUSYBOX_RULES = `The device is a WiFi Pineapple the operator already owns. Its shell is BusyBox ash.
Use /bin/sh. Do not use bash, arrays, process substitution, base64, airmon-ng, macchanger, hexdump, grep -P, or grep -A.
Do not suggest deauthentication, handshake capture, password cracking, or evil-twin setup.
Prefer pineap get_status (or pineap /tmp/pineap.conf get_status), iw, iwinfo, ifconfig, uci, logread, dmesg, df, free, uptime, and ps.`;

export function buildFixMessages(input: {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}): { system: string; user: string } {
  return {
    system: `${BUSYBOX_RULES}
Reply with JSON only, no markdown fence: {"explanation":"one or two sentences","command":"replacement"}
command is one shell line, or a #!/bin/sh script when more than one line is required.
Leave command as an empty string when the failure is authentication, networking, or a missing device and no command can fix it.`,
    user: `Command:\n${clipOutput(input.command)}\nExit: ${input.exitCode ?? 'unknown'}\nSTDOUT:\n${clipOutput(input.stdout || '(empty)')}\nSTDERR:\n${clipOutput(input.stderr || '(empty)')}`,
  };
}

export function buildGenerateMessages(goal: string, language: 'bash' | 'python'): { system: string; user: string } {
  const kind = language === 'python' ? 'python3' : '/bin/sh';
  return {
    system: `${BUSYBOX_RULES}
Write a commented ${kind} script for the operator's own device.
Return only a markdown code block. Start shell scripts with #!/bin/sh.
Check that a command exists before calling it.
Do not call python3 unless the requested language is Python.`,
    user: goal.trim(),
  };
}

export function buildAnalyzeMessages(input: {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}): { system: string; user: string } {
  return {
    system: `${BUSYBOX_RULES}
Explain this SSH result in plain language: what ran, what the output shows, and how to fix an error on OpenWrt.
Keep follow-up commands inside the same admin and status set. Do not invent new attack steps.`,
    user: `Command: ${clipOutput(input.command)}\nExit: ${input.exitCode ?? 'unknown'}\nSTDOUT:\n${clipOutput(input.stdout || '(empty)')}\nSTDERR:\n${clipOutput(input.stderr || '(empty)')}`,
  };
}
