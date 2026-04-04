const FEEDBACK_MARKER = "<!-- caredrop-feedback -->";
const DEFAULT_REPO = "GreedShadow/CareDrop";

function getRepoParts(repoFullName) {
  const [owner, repo] = String(repoFullName || DEFAULT_REPO).split("/");
  if (!owner || !repo) {
    throw new Error("Invalid GITHUB_FEEDBACK_REPO value. Use owner/repo format.");
  }
  return { owner, repo };
}

export function getFeedbackConfig() {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const repoFullName = process.env.GITHUB_FEEDBACK_REPO || DEFAULT_REPO;
  return {
    token,
    repoFullName,
    configured: Boolean(token),
  };
}

async function githubRequest(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "CareDrop-Feedback-Inbox",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    throw new Error(data.message || "GitHub feedback request failed.");
  }

  return data;
}

function toIssueBody({ type, name, message, appContext }) {
  return [
    FEEDBACK_MARKER,
    "",
    `**Type:** ${type}`,
    `**Name:** ${name || "Anonymous"}`,
    `**Submitted:** ${new Date().toISOString()}`,
    appContext ? `**Context:** ${appContext}` : "",
    "",
    "### Message",
    message,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function listFeedbackRequests() {
  const { token, repoFullName, configured } = getFeedbackConfig();
  if (!configured) {
    return { configured: false, requests: [] };
  }

  const { owner, repo } = getRepoParts(repoFullName);
  const issues = await githubRequest(`/repos/${owner}/${repo}/issues?state=all&per_page=25`, { token });

  const requests = issues
    .filter((issue) => !issue.pull_request && String(issue.body || "").includes(FEEDBACK_MARKER))
    .slice(0, 12)
    .map((issue) => ({
      id: String(issue.id),
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      type: issue.title.replace("[CareDrop] ", "").split(":")[0] || "Request",
      message: extractMessage(issue.body),
      submittedBy: extractValue(issue.body, "Name") || "Anonymous",
    }));

  return {
    configured: true,
    requests,
    repoFullName,
  };
}

export async function createFeedbackRequest({ type, name, message, appContext }) {
  const { token, repoFullName, configured } = getFeedbackConfig();
  if (!configured) {
    throw new Error("Missing GITHUB_FEEDBACK_TOKEN in server environment.");
  }

  if (!String(message || "").trim()) {
    throw new Error("Request message is required.");
  }

  const { owner, repo } = getRepoParts(repoFullName);
  const title = `[CareDrop] ${type}: ${String(message).trim().slice(0, 72)}`;
  const body = toIssueBody({ type, name, message, appContext });
  const issue = await githubRequest(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    token,
    body: {
      title,
      body,
    },
  });

  return {
    id: String(issue.id),
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    createdAt: issue.created_at,
    type,
    message,
    submittedBy: name || "Anonymous",
  };
}

function extractValue(body, label) {
  const match = String(body || "").match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`));
  return match?.[1]?.trim() || "";
}

function extractMessage(body) {
  const match = String(body || "").match(/### Message\s+([\s\S]*)$/);
  return match?.[1]?.trim() || "";
}

