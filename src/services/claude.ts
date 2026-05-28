import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export const VALID_PLATFORMS = ['n8n', 'Make', 'Zapier', 'Tray', 'Boomi', 'Workato', 'Celigo'] as const;
export type Platform = typeof VALID_PLATFORMS[number];

export interface Submission {
  source: string;
  destination: string;
  description?: string;
  fileContent?: string;
  fileName?: string;
}

export interface PlaybookResult {
  playbookText: string;
  importFileContent: string | null;
  importFileName: string | null;
  importFileExtension: string | null;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: config.anthropicApiKey });
  return _client;
}

export async function generateMigrationPlaybook(submission: Submission): Promise<PlaybookResult> {
  const response = await getClient().messages.create({
    model: config.claudeModel,
    max_tokens: config.maxTokens,
    system: `You are Flowshift, an expert iPaaS migration consultant. You specialize in translating workflow logic between platforms. Your primary goal is to provide functional, valid import files (JSON) for the destination platform whenever technically possible.`,
    messages: [{ role: 'user', content: buildPrompt(submission) }],
  });

  const rawOutput = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseOutput(rawOutput, submission);
}

function buildPrompt({ source, destination, fileContent, fileName, description }: Submission): string {
  let context = '';
  if (fileContent) context += `## Source Workflow File (${fileName})\n\`\`\`\n${fileContent.substring(0, 15000)}\n\`\`\`\n\n`;
  if (description) context += `## Source Workflow Description\n${description}\n\n`;

  return `I need to migrate a workflow from **${source}** to **${destination}**.

${context}
Produce a complete Flowshift Migration Playbook using EXACTLY this format:

---BEGIN PLAYBOOK---
# Flowshift Migration Playbook
[Detailed breakdown, mapping, and build guide]
---END PLAYBOOK---

---BEGIN IMPORT FILE---
[IMPORTANT: You MUST generate a valid, functional ${destination} import file based on the source logic.
- If destination is n8n: Provide a valid JSON array of nodes and connections.
- If destination is Make: Provide a valid Blueprint JSON.
- If destination is Zapier: Write "NOT AVAILABLE".
- If destination is Tray: Provide a valid workflow JSON.
Provide actual functional logic, not a blank template. Use {{PLACEHOLDER}} for API keys.]
---END IMPORT FILE---

---BEGIN IMPORT FILE FORMAT---
[e.g. "json"]
---END IMPORT FILE FORMAT---`;
}

function parseOutput(rawOutput: string, submission: Submission): PlaybookResult {
  const playbookMatch = rawOutput.match(/---BEGIN PLAYBOOK---([\s\S]*?)---END PLAYBOOK---/);
  const playbookText = playbookMatch ? playbookMatch[1].trim() : rawOutput;

  let importFileContent: string | null = null;
  let importFileExtension: string | null = null;

  const importMatch = rawOutput.match(/---BEGIN IMPORT FILE---([\s\S]*?)---END IMPORT FILE---/);
  if (importMatch) {
    const content = importMatch[1].trim();
    if (content && content !== 'NOT AVAILABLE') {
      importFileContent = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    }
  }

  const formatMatch = rawOutput.match(/---BEGIN IMPORT FILE FORMAT---([\s\S]*?)---END IMPORT FILE FORMAT---/);
  if (formatMatch) {
    const fmt = formatMatch[1].trim().replace(/\./g, '').toLowerCase();
    if (fmt !== 'n/a' && fmt !== 'not available') importFileExtension = fmt;
  }

  let importFileName: string | null = null;
  if (importFileContent && importFileExtension) {
    const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '_');
    importFileName = `flowshift_${safe(submission.source)}_to_${safe(submission.destination)}.${importFileExtension}`;
  }

  return { playbookText, importFileContent, importFileName, importFileExtension };
}
