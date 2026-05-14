// Fetches files from HTTP base URLs for #include <alias/path> resolution.
//
// A "repo URL" is any HTTP(S) base URL. The alias is derived from the last
// path segment. Files are fetched at <base>/<path> (and <base>/<path>.ca).
//
// Examples:
//   github.com/user/kotlin-agents
//     → base https://raw.githubusercontent.com/user/kotlin-agents/main
//     → alias "kotlin-agents"
//   https://my-server.com/agents/kotlin
//     → alias "kotlin"

const REPO_INCLUDE_RE = /#include\s+<([^/>]+)\/([^>]+)>/g;

/** Scan source(s) for all #include <alias/path> references. */
export function scanRepoIncludes(sources: string | string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const list = Array.isArray(sources) ? sources : [sources];
  for (const src of list) {
    for (const m of src.matchAll(REPO_INCLUDE_RE)) {
      const alias = m[1]!;
      const path = m[2]!;
      (result[alias] ??= []).push(path);
    }
  }
  return result;
}

/** Derive the alias (last non-empty path segment) from a URL string. */
export function repoAlias(repoUrl: string): string {
  return repoUrl.replace(/\/$/, "").replace(/\.git$/, "").split("/").filter(Boolean).at(-1) ?? repoUrl;
}

/**
 * Normalise a repo URL into a fetchable HTTP base URL.
 *
 * Handles two special cases:
 *  - Bare "github.com/owner/repo[/branch]" → raw.githubusercontent.com base
 *  - Anything else already starting with http(s):// → used as-is (trailing slash stripped)
 */
function normaliseBaseUrl(repoUrl: string): string {
  if (/^https?:\/\//.test(repoUrl)) {
    return repoUrl.replace(/\/$/, "");
  }
  const ghMatch = repoUrl.match(/^(?:github\.com)\/([^/]+)\/([^/]+)(?:\/([^/]+))?/);
  if (ghMatch) {
    const owner = ghMatch[1]!;
    const repo = ghMatch[2]!.replace(/\.git$/, "");
    const branch = ghMatch[3] ?? "main";
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  }
  return `https://${repoUrl}`;
}

/** Fetch a single file from a base URL, trying path then path+".ca". Returns null on failure. */
export async function fetchRepoFile(
  baseUrl: string,
  filePath: string
): Promise<string | null> {
  const paths = filePath.endsWith(".ca") ? [filePath] : [filePath, filePath + ".ca"];
  for (const p of paths) {
    try {
      const res = await fetch(`${baseUrl}/${p}`);
      if (res.ok) return res.text();
    } catch {
      // network error — fall through
    }
  }

  // For GitHub raw URLs on "main", also try "master"
  if (baseUrl.includes("raw.githubusercontent.com") && baseUrl.endsWith("/main")) {
    const masterBase = baseUrl.slice(0, -"/main".length) + "/master";
    for (const p of paths) {
      try {
        const res = await fetch(`${masterBase}/${p}`);
        if (res.ok) return res.text();
      } catch {
        // ignore
      }
    }
  }

  return null;
}

/**
 * Given a list of repo URLs and source files, fetch all referenced files
 * and return a repos map for parseCAgent.
 *
 * @param repoUrls  e.g. ["github.com/user1/kotlin-agents", "https://my-server.com/agents"]
 * @param sources   source content(s) to scan for #include <alias/path>
 */
export async function fetchRepos(
  repoUrls: string[],
  sources: string | string[]
): Promise<Record<string, Record<string, string>>> {
  const needed = scanRepoIncludes(sources);
  const repos: Record<string, Record<string, string>> = {};

  const aliasMap: Record<string, string> = {};
  for (const url of repoUrls) {
    aliasMap[repoAlias(url)] = normaliseBaseUrl(url);
  }

  const fetches: Promise<void>[] = [];
  for (const [alias, paths] of Object.entries(needed)) {
    const baseUrl = aliasMap[alias];
    if (!baseUrl) continue;

    repos[alias] ??= {};
    for (const path of paths) {
      fetches.push(
        fetchRepoFile(baseUrl, path).then((content) => {
          if (content !== null) {
            repos[alias]![path] = content;
          }
        })
      );
    }
  }

  await Promise.all(fetches);
  return repos;
}
