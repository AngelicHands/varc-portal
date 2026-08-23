import { getPublicBaseUrl } from "@/lib/public-url";
import {
  isGithubRepoRootPath,
  normalizeGithubBranch,
  normalizeGithubPath,
} from "@/lib/validations/import-export";
import type { ImportExportSource } from "@/lib/validations/import-export";

const REQUEST_TIMEOUT_MS = 15_000;

export function normalizeGithubRepoUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  return `https://github.com/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function parseGithubOwnerRepo(value: string): string | null {
  const normalized = normalizeGithubRepoUrl(value);
  const match = normalized.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/i);
  return match?.[1] ?? null;
}

function resolveCustomUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return `${getPublicBaseUrl()}${trimmed}`;
  }
  return trimmed;
}

export function githubHeaders(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "varc-portal-import-export",
  };
}

export async function readGithubError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // ignore parse errors
  }
  return `GitHub request failed (${response.status})`;
}

export async function verifyGithubSource(input: {
  repoUrl: string;
  username: string;
  pat: string;
  branch?: string;
  path?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerRepo = parseGithubOwnerRepo(input.repoUrl);
  if (!ownerRepo) {
    return { ok: false, error: "Invalid GitHub repository" };
  }

  const pat = input.pat.trim();
  const username = input.username.trim();
  if (!pat) return { ok: false, error: "GitHub PAT is required" };
  if (!username) return { ok: false, error: "GitHub username is required" };

  let userResponse: Response;
  try {
    userResponse = await fetch("https://api.github.com/user", {
      headers: githubHeaders(pat),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach GitHub" };
  }

  if (userResponse.status === 401) {
    return { ok: false, error: "Invalid personal access token" };
  }
  if (!userResponse.ok) {
    return { ok: false, error: await readGithubError(userResponse) };
  }

  const user = (await userResponse.json()) as { login?: string };
  if (
    user.login &&
    user.login.toLowerCase() !== username.toLowerCase()
  ) {
    return {
      ok: false,
      error: "PAT belongs to a different GitHub user than the one entered",
    };
  }

  let repoResponse: Response;
  try {
    repoResponse = await fetch(`https://api.github.com/repos/${ownerRepo}`, {
      headers: githubHeaders(pat),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Could not reach GitHub" };
  }

  if (repoResponse.status === 404) {
    return {
      ok: false,
      error: "Repository not found or token lacks access",
    };
  }
  if (!repoResponse.ok) {
    return { ok: false, error: await readGithubError(repoResponse) };
  }

  const repo = (await repoResponse.json()) as { default_branch?: string };
  const branch = normalizeGithubBranch(input.branch ?? "");
  const ref = branch || repo.default_branch || "main";

  if (branch) {
    let branchResponse: Response;
    try {
      branchResponse = await fetch(
        `https://api.github.com/repos/${ownerRepo}/branches/${encodeURIComponent(branch)}`,
        {
          headers: githubHeaders(pat),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      return { ok: false, error: "Could not reach GitHub" };
    }

    if (branchResponse.status === 404) {
      return {
        ok: false,
        error: `Branch "${branch}" was not found in the repository`,
      };
    }
    if (!branchResponse.ok) {
      return { ok: false, error: await readGithubError(branchResponse) };
    }
  }

  const path = normalizeGithubPath(input.path ?? "");
  if (isGithubRepoRootPath(path)) {
    return { ok: true };
  }

  const encodedPath = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  let pathResponse: Response;
  try {
    pathResponse = await fetch(
      `https://api.github.com/repos/${ownerRepo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
      {
        headers: githubHeaders(pat),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch {
    return { ok: false, error: "Could not reach GitHub" };
  }

  if (pathResponse.status === 404) {
    return {
      ok: false,
      error: `Path "${path}" was not found in the repository`,
    };
  }
  if (!pathResponse.ok) {
    return { ok: false, error: await readGithubError(pathResponse) };
  }

  return { ok: true };
}

async function probeCustomUrl(
  url: string,
  authHeader: string,
  method: "HEAD" | "GET",
): Promise<Response> {
  return fetch(url, {
    method,
    headers: { Authorization: authHeader },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export async function verifyCustomUrlSource(input: {
  url: string;
  username: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const username = input.username.trim();
  const password = input.password;
  const url = input.url.trim();

  if (!url) return { ok: false, error: "Custom URL is required" };
  if (!username) return { ok: false, error: "Username is required" };
  if (!password) return { ok: false, error: "Password is required" };

  const target = resolveCustomUrl(url);
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  let response: Response;
  try {
    response = await probeCustomUrl(target, authHeader, "HEAD");
    if (response.status === 405 || response.status === 501) {
      response = await probeCustomUrl(target, authHeader, "GET");
    }
  } catch {
    return { ok: false, error: "Could not reach the endpoint" };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: "Authentication failed" };
  }
  if (response.status >= 400) {
    return {
      ok: false,
      error: `Endpoint returned ${response.status}`,
    };
  }

  return { ok: true };
}

export async function verifyImportExportSource(input: {
  source: ImportExportSource;
  githubRepoUrl: string;
  githubBranch: string;
  githubUsername: string;
  githubPat: string;
  githubPath: string;
  customUrl: string;
  customUsername: string;
  customPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.source === "github") {
    return verifyGithubSource({
      repoUrl: input.githubRepoUrl,
      username: input.githubUsername,
      pat: input.githubPat,
      branch: input.githubBranch,
      path: input.githubPath,
    });
  }

  return verifyCustomUrlSource({
    url: input.customUrl,
    username: input.customUsername,
    password: input.customPassword,
  });
}
