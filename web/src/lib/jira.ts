const jiraBaseUrl = import.meta.env.VITE_JIRA_BASE_URL?.trim();

export function jiraIssueUrl(issueKey: string): string | null {
  if (!jiraBaseUrl) return null;

  try {
    const url = new URL(jiraBaseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/browse/${encodeURIComponent(issueKey)}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}
