import {
  githubHeaders,
  parseGithubOwnerRepo,
  readGithubError,
} from "@/lib/import-export-verify";
import { isSyncExcludedRepoPath } from "@/lib/import-export/sync-paths";

const REQUEST_TIMEOUT_MS = 60_000;

export type GitHubTextFile = {
  path: string;
  content: string;
};

export type GitHubBinaryFile = {
  path: string;
  content: Buffer;
};

export type GitHubCommitFile = GitHubTextFile | GitHubBinaryFile;

function isBinaryFile(file: GitHubCommitFile): file is GitHubBinaryFile {
  return Buffer.isBuffer(file.content);
}

async function githubRequest<T>(
  url: string,
  pat: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(pat),
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(await readGithubError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function createBlob(
  ownerRepo: string,
  pat: string,
  file: GitHubCommitFile,
): Promise<string> {
  const binary = isBinaryFile(file);
  const payload = binary
    ? {
        content: file.content.toString("base64"),
        encoding: "base64" as const,
      }
    : {
        content: file.content,
        encoding: "utf-8" as const,
      };

  const result = await githubRequest<{ sha: string }>(
    `https://api.github.com/repos/${ownerRepo}/git/blobs`,
    pat,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return result.sha;
}

export async function commitGitHubFiles(params: {
  ownerRepo: string;
  branch: string;
  pat: string;
  message: string;
  files: GitHubCommitFile[];
}): Promise<{ commitSha: string; htmlUrl: string }> {
  const validFiles = params.files.filter(
    (file) => file.path.trim() && !isSyncExcludedRepoPath(file.path),
  );
  if (validFiles.length === 0) {
    throw new Error("No files to commit");
  }

  const ref = await githubRequest<{ object: { sha: string } }>(
    `https://api.github.com/repos/${params.ownerRepo}/git/ref/heads/${encodeURIComponent(params.branch)}`,
    params.pat,
  );

  const baseCommitSha = ref.object.sha;
  const baseCommit = await githubRequest<{ tree: { sha: string } }>(
    `https://api.github.com/repos/${params.ownerRepo}/git/commits/${baseCommitSha}`,
    params.pat,
  );

  const treeItems: Array<{
    path: string;
    mode: "100644";
    type: "blob";
    sha: string;
  }> = [];

  for (const file of validFiles) {
    const sha = await createBlob(params.ownerRepo, params.pat, file);
    treeItems.push({
      path: file.path.replace(/^\/+/, ""),
      mode: "100644",
      type: "blob",
      sha,
    });
  }

  const tree = await githubRequest<{ sha: string }>(
    `https://api.github.com/repos/${params.ownerRepo}/git/trees`,
    params.pat,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: treeItems,
      }),
    },
  );

  const commit = await githubRequest<{ sha: string; html_url: string }>(
    `https://api.github.com/repos/${params.ownerRepo}/git/commits`,
    params.pat,
    {
      method: "POST",
      body: JSON.stringify({
        message: params.message,
        tree: tree.sha,
        parents: [baseCommitSha],
      }),
    },
  );

  await githubRequest(
    `https://api.github.com/repos/${params.ownerRepo}/git/refs/heads/${encodeURIComponent(params.branch)}`,
    params.pat,
    {
      method: "PATCH",
      body: JSON.stringify({
        sha: commit.sha,
        force: false,
      }),
    },
  );

  return { commitSha: commit.sha, htmlUrl: commit.html_url };
}

export function resolveOwnerRepo(repoUrl: string): string {
  const ownerRepo = parseGithubOwnerRepo(repoUrl);
  if (!ownerRepo) {
    throw new Error("Invalid GitHub repository URL");
  }
  return ownerRepo;
}

export async function resolveExportBranchFromGithub(params: {
  ownerRepo: string;
  pat: string;
  branch: string;
}): Promise<string> {
  const trimmed = params.branch.trim();
  if (trimmed) return trimmed;

  const repo = await githubRequest<{ default_branch?: string }>(
    `https://api.github.com/repos/${params.ownerRepo}`,
    params.pat,
  );
  return repo.default_branch || "main";
}

export function resolveExportBranch(
  branch: string,
  fallback = "main",
): string {
  const trimmed = branch.trim();
  return trimmed || fallback;
}

export type GitHubRepoBlob = {
  path: string;
  sha: string;
};

export async function listGitHubRepoBlobs(params: {
  ownerRepo: string;
  branch: string;
  pat: string;
  syncRoot?: string;
}): Promise<GitHubRepoBlob[]> {
  const branch = await resolveExportBranchFromGithub({
    ownerRepo: params.ownerRepo,
    pat: params.pat,
    branch: params.branch,
  });

  const ref = await githubRequest<{ object: { sha: string } }>(
    `https://api.github.com/repos/${params.ownerRepo}/git/ref/heads/${encodeURIComponent(branch)}`,
    params.pat,
  );

  const commit = await githubRequest<{ tree: { sha: string } }>(
    `https://api.github.com/repos/${params.ownerRepo}/git/commits/${ref.object.sha}`,
    params.pat,
  );

  const tree = await githubRequest<{
    tree: Array<{ path?: string; type?: string; sha?: string }>;
  }>(
    `https://api.github.com/repos/${params.ownerRepo}/git/trees/${commit.tree.sha}?recursive=1`,
    params.pat,
  );

  const rootPrefix = params.syncRoot
    ? `${params.syncRoot.replace(/^\/+|\/+$/g, "")}/`
    : "";

  return (tree.tree ?? [])
    .filter(
      (item) =>
        item.type === "blob" &&
        item.path &&
        item.sha &&
        !isSyncExcludedRepoPath(item.path) &&
        (!rootPrefix || item.path.startsWith(rootPrefix) || item.path === params.syncRoot),
    )
    .map((item) => ({
      path: item.path!,
      sha: item.sha!,
    }));
}

export async function downloadGitHubFile(params: {
  ownerRepo: string;
  pat: string;
  path: string;
  ref: string;
}): Promise<Buffer> {
  const encodedPath = params.path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const result = await githubRequest<{
    content?: string;
    encoding?: string;
  }>(
    `https://api.github.com/repos/${params.ownerRepo}/contents/${encodedPath}?ref=${encodeURIComponent(params.ref)}`,
    params.pat,
  );

  if (!result.content) {
    throw new Error(`Empty file content for ${params.path}`);
  }

  if (result.encoding === "base64") {
    return Buffer.from(result.content.replace(/\n/g, ""), "base64");
  }

  return Buffer.from(result.content, "utf8");
}
