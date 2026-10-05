import { isAiProvider, sanitizeModel, type AiProvider } from './aiFix';

export interface ProviderCompletion {
  provider: AiProvider;
  model: string;
  apiKey: string;
  system: string;
  user: string;
}

function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-redacted')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, 'AIza-redacted')
    .slice(0, 400);
}

function providerMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return 'The provider rejected the request.';
  const body = data as { error?: { message?: string } | string; message?: string };
  if (typeof body.error === 'string') return body.error;
  if (body.error && typeof body.error.message === 'string') return body.error.message;
  if (typeof body.message === 'string') return body.message;
  return 'The provider rejected the request.';
}

function openAiText(data: unknown): string {
  const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : ''))
      .join('');
    if (text.trim()) return text;
  }
  throw new Error('The provider response did not include a message.');
}

function anthropicText(data: unknown): string {
  const blocks = (data as { content?: { text?: string }[] })?.content;
  if (!Array.isArray(blocks)) throw new Error('The provider response did not include a message.');
  const text = blocks.map((block) => block?.text || '').join('');
  if (!text.trim()) throw new Error('The provider response did not include a message.');
  return text;
}

function geminiText(data: unknown): string {
  const parts = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content
    ?.parts;
  if (!Array.isArray(parts)) throw new Error('The provider response did not include a message.');
  const text = parts.map((part) => part?.text || '').join('');
  if (!text.trim()) throw new Error('The provider response did not include a message.');
  return text;
}

export async function completeWithProvider(input: ProviderCompletion): Promise<string> {
  if (!isAiProvider(input.provider)) throw new Error('Choose OpenAI, Anthropic, or Gemini.');
  const model = sanitizeModel(input.model, input.provider);
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error('Save an API key in Config before using AI.');
  if (!input.user.trim()) throw new Error('There is nothing to send to the provider.');

  let url = '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body = '';

  if (input.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = `Bearer ${apiKey}`;
    body = JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    });
  } else if (input.provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = JSON.stringify({
      model,
      max_tokens: 1200,
      system: input.system,
      messages: [{ role: 'user', content: input.user }],
    });
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers['x-goog-api-key'] = apiKey;
    body = JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts: [{ text: input.user }] }],
    });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'request failed';
    throw new Error(`Could not reach the AI provider. ${message}`);
  }

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(redact(providerMessage(parsed) || raw || `Provider returned HTTP ${response.status}`));
  }
  if (input.provider === 'openai') return openAiText(parsed);
  if (input.provider === 'anthropic') return anthropicText(parsed);
  return geminiText(parsed);
}
