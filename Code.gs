// ============================================================
// FLOWSHIFT — iPaaS Migration Playbook Generator
// Google Apps Script — Form Submit Orchestrator
// ============================================================
// SETUP INSTRUCTIONS:
//   1. Create a Google Form with the fields defined below
//   2. Open the linked Google Sheet → Extensions → Apps Script
//   3. Paste this entire file into the editor
//   4. Set your ANTHROPIC_API_KEY in Script Properties:
//      Project Settings → Script Properties → Add property
//      Key: ANTHROPIC_API_KEY   Value: sk-ant-...
//   5. Add a trigger: Triggers → Add Trigger →
//      Function: onFormSubmit, Event: From form, On form submit
// ============================================================

// ── GOOGLE FORM FIELD TITLES (must match exactly) ───────────
const FIELD_EMAIL       = "Email Address";
const FIELD_SOURCE      = "Source iPaaS";
const FIELD_DESTINATION = "Destination iPaaS";
const FIELD_FILE        = "Source Workflow File";        // File upload question
const FIELD_DESCRIPTION = "Source Workflow Description"; // Long answer / rich text

// ── SUPPORTED PLATFORMS ─────────────────────────────────────
const VALID_PLATFORMS = ["n8n", "Make", "Zapier", "Tray", "Boomi", "Workato", "Celigo"];

// ── ANTHROPIC CONFIG ─────────────────────────────────────────
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// UPDATED: Using Sonnet for better reasoning and JSON generation
const CLAUDE_MODEL      = "claude-opus-4-7";
const MAX_TOKENS        = 8192; // Increased for long JSON files

// ── EMAIL CONFIG ─────────────────────────────────────────────
const EMAIL_SUBJECT     = "✅ Your Flowshift Migration Playbook is Ready";
const EMAIL_FROM_NAME   = "Flowshift";


// ============================================================
// MAIN ENTRY POINT — triggered on form submit
// ============================================================
function onFormSubmit(e) {
  // SAFETY CHECK: If 'e' or 'e.response' is missing, stop immediately
  if (!e || !e.response) {
    Logger.log("onFormSubmit was triggered but no event data was found. If you ran this from the editor, this is normal.");
    return;
  }

  try {
    const submission = parseFormSubmission(e);
    
    Logger.log("Submission parsed: " + JSON.stringify({
      email: submission.email,
      source: submission.source,
      destination: submission.destination,
      hasFile: !!submission.fileContent,
      hasDescription: !!submission.description
    }));

    if (!submission.email) {
      Logger.log("ERROR: No recipient email address found. Aborting.");
      return;
    }

    if (submission.source === submission.destination) {
      sendErrorEmail(submission.email, submission.source, submission.destination,
        "Source and Destination iPaaS platforms cannot be the same.");
      return;
    }

    if (!submission.fileContent && !submission.description) {
      sendErrorEmail(submission.email, submission.source, submission.destination,
        "Please provide either a Source Workflow File or a Source Workflow Description.");
      return;
    }

    const result = generateMigrationPlaybook(submission);
    sendPlaybookEmail(submission, result);

    Logger.log("Flowshift workflow complete for: " + submission.email);

  } catch (err) {
    Logger.log("ERROR in onFormSubmit: " + err.message + "\n" + err.stack);
    
    try {
      const emailAttempt = e.response.getRespondentEmail() || "";
      if (emailAttempt) {
         sendErrorEmail(emailAttempt, "Unknown", "Unknown",
            "An unexpected error occurred processing your submission.");
      }
    } catch (_) {}
  }
}


// ============================================================
// PARSE FORM SUBMISSION
// ============================================================
function parseFormSubmission(e) {
  const itemResponses = e.response.getItemResponses();
  const data = {};

  for (const itemResponse of itemResponses) {
    const title = itemResponse.getItem().getTitle();
    const value = itemResponse.getResponse();
    data[title] = value;
  }

  let email = (data[FIELD_EMAIL] || "").trim();
  if (!email) {
    try {
      email = e.response.getRespondentEmail() || "";
    } catch(err) { email = ""; }
  }

  const source      = (data[FIELD_SOURCE] || "").trim();
  const destination = (data[FIELD_DESTINATION] || "").trim();
  const description = (data[FIELD_DESCRIPTION] || "").trim();

  // FIX: Handle File Upload Arrays
  const rawFileValue = data[FIELD_FILE];
  let fileUrl = Array.isArray(rawFileValue) ? rawFileValue[0] : rawFileValue;

  let fileContent  = null;
  let fileName     = null;
  let fileExtension = null;

  if (fileUrl) {
    const fileResult = readDriveFileFromUrl(fileUrl);
    fileContent   = fileResult.content;
    fileName      = fileResult.name;
    fileExtension = fileResult.extension;
  }

  return { email, source, destination, description, fileContent, fileName, fileExtension };
}


// ============================================================
// READ FILE FROM GOOGLE DRIVE
// ============================================================
function readDriveFileFromUrl(fileUrl) {
  try {
    if (!fileUrl || typeof fileUrl !== 'string') return { content: null, name: null, extension: null };

    let fileId = null;
    const openMatch = fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const viewMatch = fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

    if (openMatch) fileId = openMatch[1];
    else if (viewMatch) fileId = viewMatch[1];
    else if (!fileUrl.includes("/")) fileId = fileUrl.trim();

    if (!fileId) return { content: null, name: null, extension: null };

    const file = DriveApp.getFileById(fileId);
    const name = file.getName();
    const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const content = file.getBlob().getDataAsString("UTF-8");

    return { content, name, extension };
  } catch (err) {
    Logger.log("Error reading file: " + err.message);
    return { content: null, name: null, extension: null };
  }
}


// ============================================================
// GENERATE MIGRATION PLAYBOOK VIA CLAUDE
// ============================================================
function generateMigrationPlaybook(submission) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set.");

  const payload = {
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: getSystemPrompt(),
    messages: [{ role: "user", content: buildClaudePrompt(submission) }]
  };

  const options = {
    method: "POST",
    contentType: "application/json",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(ANTHROPIC_API_URL, options);
  if (response.getResponseCode() !== 200) {
    throw new Error("Claude API error: " + response.getContentText());
  }

  const parsed = JSON.parse(response.getContentText());
  return parseClaudeOutput(parsed.content[0].text, submission);
}


function getSystemPrompt() {
  return `You are Flowshift, an expert iPaaS migration consultant. You specialize in translating workflow logic between platforms. 
  Your primary goal is to provide functional, valid import files (JSON) for the destination platform whenever technically possible.`;
}


// ============================================================
// UPDATED: SHARPER PROMPT FOR JSON GENERATION
// ============================================================
function buildClaudePrompt(submission) {
  const { source, destination, fileContent, fileName, description } = submission;

  let context = "";
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


// ============================================================
// PARSE CLAUDE OUTPUT
// ============================================================
function parseClaudeOutput(rawOutput, submission) {
  let playbookText = "";
  let importFileContent = null;
  let importFileExtension = null;

  const playbookMatch = rawOutput.match(/---BEGIN PLAYBOOK---([\s\S]*?)---END PLAYBOOK---/);
  playbookText = playbookMatch ? playbookMatch[1].trim() : rawOutput;

  const importMatch = rawOutput.match(/---BEGIN IMPORT FILE---([\s\S]*?)---END IMPORT FILE---/);
  if (importMatch) {
    const content = importMatch[1].trim();
    if (content && content !== "NOT AVAILABLE") {
      importFileContent = content.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    }
  }

  const formatMatch = rawOutput.match(/---BEGIN IMPORT FILE FORMAT---([\s\S]*?)---END IMPORT FILE FORMAT---/);
  if (formatMatch) {
    importFileExtension = formatMatch[1].trim().replace(/\./g, "").toLowerCase();
    if (importFileExtension === "n/a") importFileExtension = null;
  }

  let importFileName = null;
  if (importFileContent && importFileExtension) {
    const safe = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "_");
    importFileName = `flowshift_${safe(submission.source)}_to_${safe(submission.destination)}.${importFileExtension}`;
  }

  return { playbookText, importFileContent, importFileName, importFileExtension };
}


// ============================================================
// SEND PLAYBOOK EMAIL
// ============================================================
function sendPlaybookEmail(submission, result) {
  const { email, source, destination } = submission;
  const { playbookText, importFileContent, importFileName } = result;

  if (!email || email.indexOf('@') === -1) return;

  const subject = `${EMAIL_SUBJECT}: ${source} → ${destination}`;
  const htmlBody = buildEmailHtml(source, destination, playbookText, !!importFileContent);
  const plainBody = buildEmailPlain(source, destination, playbookText, !!importFileContent);

  const emailOptions = {
    name: EMAIL_FROM_NAME,
    htmlBody: htmlBody,
    replyTo: "noreply@flowshift.io"
  };

  if (importFileContent && importFileName) {
    const blob = Utilities.newBlob(importFileContent, "application/octet-stream", importFileName);
    emailOptions.attachments = [blob];
  }

  GmailApp.sendEmail(email, subject, plainBody, emailOptions);
}


// ============================================================
// EMAIL TEMPLATES
// ============================================================
function buildEmailHtml(source, destination, playbookText, hasImportFile) {
  const formattedPlaybook = playbookText
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>");

  const note = hasImportFile
    ? `<div style="background:#e8f5e9;border-left:4px solid #43a047;padding:12px;margin:20px 0;"><strong>📎 Import file attached</strong> — Upload this to ${destination} to start.</div>`
    : `<div style="background:#fff8e1;border-left:4px solid #ffa000;padding:12px;margin:20px 0;"><strong>ℹ️ Manual Build Required</strong> — Follow the guide below.</div>`;

  return `<body style="font-family:sans-serif;color:#333;padding:20px;">
    <div style="max-width:600px;margin:auto;border:1px solid #ddd;padding:20px;border-radius:8px;">
      <h2 style="color:#0f3460;">Flowshift Playbook: ${source} → ${destination}</h2>
      ${note}
      ${formattedPlaybook}
    </div>
  </body>`;
}

function buildEmailPlain(source, destination, playbookText, hasImportFile) {
  return `FLOWSHIFT PLAYBOOK: ${source} to ${destination}\n\n${hasImportFile ? "[File Attached]\n" : ""}\n${playbookText}`;
}

function sendErrorEmail(email, source, destination, reason) {
  if (!email || email.indexOf('@') === -1) return;
  GmailApp.sendEmail(email, "⚠️ Flowshift Issue", `Could not process ${source} to ${destination}.\n\nReason: ${reason}`, { name: EMAIL_FROM_NAME });
}