import assert from 'node:assert/strict';
import {
  blockedSuggestionReason,
  buildFixMessages,
  clipOutput,
  isScriptCommand,
  parseFixResponse,
  sanitizeModel,
} from '../src/utils/aiFix.ts';

const fenced = parseFixResponse('```json\n{"explanation":"ash has no base64","command":"uptime"}\n```');
assert.equal(fenced.explanation, 'ash has no base64');
assert.equal(fenced.command, 'uptime');

const raw = parseFixResponse('{"explanation":"auth failed","command":""}');
assert.equal(raw.command, '');
assert.match(raw.explanation, /auth failed/);

const prose = parseFixResponse('The link timed out.');
assert.equal(prose.command, '');
assert.match(prose.explanation, /timed out/);

assert.equal(sanitizeModel('../etc/passwd', 'gemini'), 'gemini-2.5-flash');
assert.equal(sanitizeModel('gpt-4o-mini', 'openai'), 'gpt-4o-mini');
assert.equal(clipOutput('x'.repeat(5000)).length < 5000, true);
assert.equal(isScriptCommand('#!/bin/sh\necho ok'), true);
assert.equal(isScriptCommand('uptime'), false);
assert.ok(blockedSuggestionReason('aireplay-ng --deauth 5 wlan0'));
assert.equal(blockedSuggestionReason('uptime'), null);

const messages = buildFixMessages({
  command: 'base64',
  stdout: '',
  stderr: 'ash: base64: not found',
  exitCode: 127,
});
assert.match(messages.system, /JSON only/);
assert.match(messages.system, /deauthentication/);
assert.match(messages.user, /base64: not found/);

console.log('verified AI fix parsing');
