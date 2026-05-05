// src/agent.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { dispatch } from './tools/index.js';
import { SYSTEM_PROMPT } from './prompts/system.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Config
const MAX_STEPS = 60;
const DEBUG = process.env.DEBUG === 'true';
const VALID_STEPS = new Set(['START', 'THINK', 'TOOL', 'OUTPUT']);
const MAX_PROTOCOL_ERRORS = 6;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_EMPTY_RESPONSES = 4;
const GENERATE_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
const LOOP_DELAY_MS = Number(process.env.LOOP_DELAY_MS || 35000);
// Max chars for a tool result injected into context (prevents context overflow)
const MAX_OBSERVE_CHARS = 3500;

/**
 * Normalize mixed history shapes into Gemini API content format.
 */
function normalizeHistory(history = []) {
  return history
    .map((msg) => {
      const role =
        msg.role === 'assistant' || msg.role === 'model'
          ? 'model'
          : 'user';

      if (Array.isArray(msg.parts)) {
        return { role, parts: msg.parts };
      }

      const text =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content != null
          ? String(msg.content)
          : '';

      if (!text.trim()) {
        return null;
      }

      return {
        role,
        parts: [{ text }],
      };
    })
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRetryDelayMs(message = '') {
  const retrySecondsPattern = /Please retry in\s+([\d.]+)s/i;
  const retryDelayPattern = /"retryDelay":"(\d+)s"/i;

  const retrySecondsMatch = message.match(retrySecondsPattern);
  if (retrySecondsMatch) {
    return Math.max(500, Math.ceil(Number(retrySecondsMatch[1]) * 1000));
  }

  const retryDelayMatch = message.match(retryDelayPattern);
  if (retryDelayMatch) {
    return Math.max(500, Number(retryDelayMatch[1]) * 1000);
  }

  return 0;
}

async function generateWithRetry(model, contents, retries = 6, onRetry) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        model.generateContent({ contents }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Model request timeout after ${GENERATE_TIMEOUT_MS}ms`)),
            GENERATE_TIMEOUT_MS
          )
        ),
      ]);

      return result;
    } catch (err) {
      lastError = err;
      const message = err?.message || '';
      const isQuotaError = /429|too many requests|quota exceeded/i.test(message);
      const isTransient = isQuotaError || /fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|timeout|500|502|503|504|Service Unavailable|high demand|overloaded/i.test(message);
      
      const retryDelayMs = extractRetryDelayMs(message);

      if (!isTransient || attempt === retries) {
        throw err;
      }

      const waitTime = retryDelayMs > 0 ? retryDelayMs + 2000 : 1000 * Math.pow(2, attempt) + Math.random() * 1000;

      if (typeof onRetry === 'function') {
        onRetry({
          attempt: attempt + 1,
          retries,
          retryDelayMs: waitTime,
          reason: isQuotaError ? 'Quota Exceeded (429)' : message,
        });
      }

      await sleep(waitTime);
    }
  }

  throw lastError;
}

/**
 * Parse one or more JSON objects from model output.
 */
function extractJSONObjects(text = '') {
  const parsed = [];

  // Fast-path: single valid JSON object.
  try {
    const single = JSON.parse(text);
    if (single && typeof single === 'object' && !Array.isArray(single)) {
      return [single];
    }
  } catch {
    // ignore
  }

  // Fast-path with markdown fences stripped.
  try {
    const cleaned = text.replace(/```json\n?|```/g, '').trim();
    const single = JSON.parse(cleaned);
    if (single && typeof single === 'object' && !Array.isArray(single)) {
      return [single];
    }
  } catch {
    // ignore
  }

  // Fallback: extract balanced JSON object slices.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
      continue;
    }

    if (ch === '}') {
      if (depth > 0) {
        depth--;
      }
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        try {
          const obj = JSON.parse(candidate);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            parsed.push(obj);
          }
        } catch {
          // ignore malformed chunk
        }
        start = -1;
      }
    }
  }

  return parsed;
}

function toModelStepText(stepData) {
  if (stepData.step === 'TOOL') {
    return JSON.stringify({
      step: stepData.step,
      tool_name: stepData.tool_name,
      tool_args: stepData.tool_args,
    });
  }

  return JSON.stringify({
    step: stepData.step,
    content: stepData.content,
  });
}

function normalizeStepShape(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const rawStep =
    typeof parsed.step === 'string'
      ? parsed.step
      : typeof parsed.Step === 'string'
      ? parsed.Step
      : '';

  const step = rawStep.trim().toUpperCase();

  const content =
    typeof parsed.content === 'string'
      ? parsed.content
      : typeof parsed.message === 'string'
      ? parsed.message
      : '';

  const tool_name =
    typeof parsed.tool_name === 'string'
      ? parsed.tool_name
      : typeof parsed.toolName === 'string'
      ? parsed.toolName
      : '';

  const tool_args =
    parsed.tool_args && typeof parsed.tool_args === 'object' && !Array.isArray(parsed.tool_args)
      ? parsed.tool_args
      : parsed.toolArgs && typeof parsed.toolArgs === 'object' && !Array.isArray(parsed.toolArgs)
      ? parsed.toolArgs
      : {};

  return {
    step,
    content,
    tool_name,
    tool_args,
  };
}

/**
 * Run the ReAct agent loop
 * @param {string} userMessage
 * @param {Array} history
 * @param {Function} onStep
 * @returns {Promise<Array>}
 */
export async function runAgent(userMessage, history = [], onStep) {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.15,          // Very stable JSON output
      maxOutputTokens: 8192,      // Enough for full CSS + HTML in one shot
    },
  });

  // Build messages (Gemini format)
  const normalizedHistory = normalizeHistory(history);
  const baseMessages = [
    ...normalizedHistory,
    {
      role: 'user',
      parts: [{ text: userMessage }],
    },
  ];
  const messages = [...baseMessages];

  let stepCount = 0;
  let protocolErrorStreak = 0;
  let emptyResponseStreak = 0;

  while (stepCount < MAX_STEPS) {
    if (stepCount > 0) {
      await sleep(LOOP_DELAY_MS);
    }
    stepCount++;

    // Call model with retry for transient network errors
    const result = await generateWithRetry(model, messages, 4, ({ attempt, retries, retryDelayMs }) => {
      onStep?.({
        step: 'THINK',
        content: `Model request delayed, retrying (${attempt}/${retries + 1}) in ${Math.ceil(retryDelayMs / 1000)}s...`,
      });
    });

    const raw = result.response.text();

    if (!raw || !raw.trim()) {
      emptyResponseStreak++;

      onStep?.({
        step: 'ERROR',
        content: `Model returned empty response — retrying (${emptyResponseStreak}/${MAX_EMPTY_RESPONSES})...`,
      });

      if (emptyResponseStreak >= MAX_EMPTY_RESPONSES) {
        onStep?.({
          step: 'ERROR',
          content:
            'Model returned too many empty responses. Please retry after cooldown or switch GEMINI_MODEL=gemini-flash-latest.',
        });
        return messages;
      }

      await sleep(500);
      continue;
    }

    emptyResponseStreak = 0;

    if (DEBUG) {
      console.log('\n[DEBUG RAW OUTPUT]\n', raw);
    }

    const parsedSteps = extractJSONObjects(raw);

    // ❌ Invalid JSON → self-heal instead of crash
    if (!parsedSteps.length) {
      protocolErrorStreak++;

      onStep?.({
        step: 'ERROR',
        content: `Invalid JSON from model — forcing correction (${protocolErrorStreak}/${MAX_PROTOCOL_ERRORS})...`,
      });

      messages.push({
        role: 'user',
        parts: [
          {
            text: JSON.stringify({
              step: 'OBSERVE',
              content: 'Your previous response was INVALID. You MUST return EXACTLY one valid JSON object with a step field. No explanation. No markdown. Return ONE step only.',
            }),
          },
        ],
      });

      if (protocolErrorStreak >= 3) {
        // Reset context when model gets stuck in protocol loop.
        messages.length = 0;
        messages.push(...baseMessages);
        messages.push({
          role: 'user',
          parts: [
            {
              text:
                'Protocol reset: respond with EXACTLY one JSON object in this format: {"step":"THINK","content":"short planning sentence"}. No markdown, no extra text.',
            },
          ],
        });
      }

      if (protocolErrorStreak >= MAX_PROTOCOL_ERRORS) {
        onStep?.({
          step: 'ERROR',
          content:
            'Model repeatedly violated JSON protocol. Please retry after quota cooldown or switch model alias to gemini-flash-latest.',
        });
        return messages;
      }

      continue;
    }

    let shouldContinueLoop = true;

    for (const parsed of parsedSteps) {
      const stepData = normalizeStepShape(parsed);

      if (!stepData || !stepData.step) {
        protocolErrorStreak++;

        onStep?.({
          step: 'ERROR',
          content: `Model returned JSON without a valid step field — forcing correction (${protocolErrorStreak}/${MAX_PROTOCOL_ERRORS})...`,
        });

        messages.push({
          role: 'user',
          parts: [
            {
              text: JSON.stringify({
                step: 'OBSERVE',
                content:
                  'Your previous response was INVALID. You MUST return EXACTLY one valid JSON object with a step field. No explanation. No markdown. Return ONE step only.',
              }),
            },
          ],
        });

        if (protocolErrorStreak >= 3) {
          messages.length = 0;
          messages.push(...baseMessages);
          messages.push({
            role: 'user',
            parts: [
              {
                text:
                  'Protocol reset: respond with EXACTLY one JSON object in this format: {"step":"THINK","content":"short planning sentence"}. No markdown, no extra text.',
              },
            ],
          });
        }

        if (protocolErrorStreak >= MAX_PROTOCOL_ERRORS) {
          onStep?.({
            step: 'ERROR',
            content:
              'Model repeatedly violated step protocol. Please retry after quota cooldown or switch model alias to gemini-flash-latest.',
          });
          return messages;
        }

        break;
      }

      if (!VALID_STEPS.has(stepData.step)) {
        protocolErrorStreak++;

        onStep?.({
          step: 'ERROR',
          content: `Invalid step "${stepData.step}" — correcting model (${protocolErrorStreak}/${MAX_PROTOCOL_ERRORS})`,
        });

        messages.push({
          role: 'user',
          parts: [
            {
              text: JSON.stringify({
                step: 'OBSERVE',
                content: 'Invalid step. Use only START, THINK, TOOL, OUTPUT. Return EXACTLY one valid JSON object. Return ONE step only.',
              }),
            },
          ],
        });

        if (protocolErrorStreak >= 3) {
          messages.length = 0;
          messages.push(...baseMessages);
          messages.push({
            role: 'user',
            parts: [
              {
                text:
                  'Protocol reset: respond with EXACTLY one JSON object in this format: {"step":"THINK","content":"short planning sentence"}. No markdown, no extra text.',
              },
            ],
          });
        }

        if (protocolErrorStreak >= MAX_PROTOCOL_ERRORS) {
          onStep?.({
            step: 'ERROR',
            content:
              'Model is stuck returning invalid steps. Stop and retry after quota reset (RPM limit) or switch to gemini-flash-latest.',
          });
          return messages;
        }

        break;
      }

      // Valid protocol response reached.
      protocolErrorStreak = 0;

      if (stepData.step === 'OUTPUT' && (!stepData.content || !stepData.content.trim())) {
        onStep?.({
          step: 'ERROR',
          content: 'OUTPUT missing content — forcing retry',
        });

        messages.push({
          role: 'user',
          parts: [
            {
              text: JSON.stringify({
                step: 'OBSERVE',
                content: 'OUTPUT step must include valid content.',
              }),
            },
          ],
        });

        break;
      }

      const renderedStep = {
        ...stepData,
        content:
          stepData.content
            ? (stepData.step === 'THINK' && stepData.content.length > 600
                ? stepData.content.slice(0, 597) + '...'
                : stepData.content)
            : (stepData.step === 'TOOL'
                ? `Calling tool ${stepData.tool_name || '(missing tool_name)'}`
                : 'Processing...'),
      };

      // Render step
      onStep?.(renderedStep);

      // Add compact model step to history (avoid raw giant payloads)
      messages.push({
        role: 'model',
        parts: [{ text: toModelStepText(stepData) }],
      });

      // === STEP HANDLING ===

      // Continue reasoning
      if (stepData.step === 'START' || stepData.step === 'THINK') {
        const nudge = stepData.step === 'START'
          ? 'Good. Now begin your RESEARCH phase. Call fetchURL first, then readFile("design-system.json"). Analyze the tech stack and components. Then move to STRATEGY.'
          : 'Good. Continue. If research is done, move to STRATEGY (Plan Header, Hero, Footer). If strategy is done, move to EXECUTION (one section at a time). FINALLY, you MUST call validateOutput before OUTPUT.';
        messages.push({
          role: 'user',
          parts: [{ text: JSON.stringify({ step: 'OBSERVE', content: nudge }) }],
        });
        continue;
      }

      // TOOL EXECUTION
      if (stepData.step === 'TOOL') {
        if (!stepData.tool_name) {
          protocolErrorStreak++;

          onStep?.({
            step: 'ERROR',
            content: 'TOOL step is missing tool_name — asking model to correct.',
          });

          messages.push({
            role: 'user',
            parts: [
              {
                text: JSON.stringify({
                  step: 'OBSERVE',
                  content:
                    'TOOL step missing "tool_name". Provide {"step":"TOOL","tool_name":"...","tool_args":{...}}.',
                }),
              },
            ],
          });

          if (protocolErrorStreak >= MAX_PROTOCOL_ERRORS) {
            onStep?.({
              step: 'ERROR',
              content:
                'Model repeatedly returned invalid TOOL format. Please retry after quota cooldown.',
            });
            return messages;
          }

          break;
        }

        let toolResult;

        try {
          toolResult = await dispatch(stepData.tool_name, stepData.tool_args);
        } catch (err) {
          toolResult = `Error: ${err.message}`;
        }

        // Truncate huge tool results (like fetchURL's 20KB JSON) to prevent context overflow.
        // The agent already read and processed the result — the full payload doesn't need to live
        // in every subsequent request. Keep a rich summary prefix + tail.
        let observeText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
        if (observeText.length > MAX_OBSERVE_CHARS) {
          const head = observeText.slice(0, MAX_OBSERVE_CHARS - 200);
          const tail = observeText.slice(-150);
          observeText = head + `\n...[${observeText.length - MAX_OBSERVE_CHARS + 50} chars truncated — full data saved to output/design-system.json, use readFile if needed]...\n` + tail;
        }

        // Render OBSERVE
        onStep?.({
          step: 'OBSERVE',
          content: typeof toolResult === 'string' ? toolResult.slice(0, 800) : JSON.stringify(toolResult).slice(0, 800),
        });

        // Inject OBSERVE back to model (truncated to prevent context overflow)
        messages.push({
          role: 'user',
          parts: [{ text: JSON.stringify({ step: 'OBSERVE', content: observeText }) }],
        });

        shouldContinueLoop = true;
        break;
      }

      // FINAL OUTPUT
      if (stepData.step === 'OUTPUT') {
        return messages;
      }

      // Safety fallback
      onStep?.({
        step: 'ERROR',
        content: `Unhandled step "${stepData.step}" — forcing correction`,
      });

      messages.push({
        role: 'user',
        parts: [
          {
            text: JSON.stringify({
              step: 'OBSERVE',
              content: 'Invalid step. Use only START, THINK, TOOL, OUTPUT.',
            }),
          },
        ],
      });

      break;
    }

    if (shouldContinueLoop) {
      continue;
    }
  }

  // 🚨 Safety exit (infinite loop protection)
  onStep?.({
    step: 'ERROR',
    content: `Max step limit (${MAX_STEPS}) reached — task may be incomplete.`,
  });

  return messages;
}