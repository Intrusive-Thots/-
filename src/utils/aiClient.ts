import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  defaultModel,
  isAiProvider,
  sanitizeModel,
  type AiProvider,
} from './aiFix';
import { completeWithProvider } from './aiRemote';

export interface AiStatus {
  provider: AiProvider;
  model: string;
  hasKey: boolean;
}

interface NativeAiPlugin {
  save(options: { provider: string; model: string; apiKey: string }): Promise<void>;
  status(): Promise<{ provider?: string; model?: string; hasKey?: boolean }>;
  clear(): Promise<void>;
  complete(options: { system: string; user: string }): Promise<{ text?: string }>;
}

const PineappleAi = registerPlugin<NativeAiPlugin>('PineappleAi');
const SESSION_KEY = 'pineapple_ai_session';

interface SessionSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

function runsOnDevice(): boolean {
  return Capacitor.isNativePlatform();
}

function emptyStatus(): AiStatus {
  return { provider: 'openai', model: defaultModel('openai'), hasKey: false };
}

function readSession(): SessionSettings | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionSettings>;
    if (!parsed.provider || !isAiProvider(parsed.provider)) return null;
    return {
      provider: parsed.provider,
      model: sanitizeModel(parsed.model || '', parsed.provider),
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return null;
  }
}

function statusFrom(provider: string | undefined, model: string | undefined, hasKey: boolean): AiStatus {
  const safeProvider = provider && isAiProvider(provider) ? provider : 'openai';
  return { provider: safeProvider, model: sanitizeModel(model || '', safeProvider), hasKey };
}

export async function loadAiStatus(): Promise<AiStatus> {
  if (runsOnDevice()) {
    const status = await PineappleAi.status();
    return statusFrom(status.provider, status.model, Boolean(status.hasKey));
  }
  const session = readSession();
  if (!session) return emptyStatus();
  return { provider: session.provider, model: session.model, hasKey: session.apiKey.trim().length > 0 };
}

export async function saveAiSettings(input: {
  provider: AiProvider;
  model: string;
  apiKey: string;
}): Promise<AiStatus> {
  const provider = input.provider;
  const model = sanitizeModel(input.model, provider);
  const apiKey = input.apiKey.trim();
  if (runsOnDevice()) {
    await PineappleAi.save({ provider, model, apiKey });
    return loadAiStatus();
  }
  const existing = readSession();
  const nextKey = apiKey || existing?.apiKey || '';
  if (!nextKey) throw new Error('Enter an API key. It stays in this browser tab only.');
  const next: SessionSettings = { provider, model, apiKey: nextKey };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  return { provider, model, hasKey: true };
}

export async function clearAiSettings(): Promise<AiStatus> {
  if (runsOnDevice()) {
    await PineappleAi.clear();
    return loadAiStatus();
  }
  sessionStorage.removeItem(SESSION_KEY);
  return emptyStatus();
}

export async function completeAi(system: string, user: string): Promise<string> {
  if (runsOnDevice()) {
    const result = await PineappleAi.complete({ system, user });
    if (!result.text || !result.text.trim()) throw new Error('The provider returned an empty response.');
    return result.text;
  }
  const session = readSession();
  if (!session?.apiKey.trim()) {
    throw new Error('Save an AI provider and API key in Config before using AI.');
  }
  const response = await fetch('/api/ai/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: session.provider,
      model: session.model,
      apiKey: session.apiKey,
      system,
      user,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; text?: string; error?: string };
  if (!response.ok || !data.success || !data.text) {
    throw new Error(data.error || 'The AI request failed.');
  }
  return data.text;
}
