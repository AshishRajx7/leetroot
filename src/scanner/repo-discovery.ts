import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';
import { CURATED_REPOS, CuratedRepo } from '../config/curated-repos';

export interface DiscoveredFile {
  path: string;
  size: number;
  sha: string;
}

export interface DiscoveryOptions {
  maxFiles?: number;
  maxFileSize?: number;
  allowedExtensions?: string[];
  excludedPatterns?: string[];
}

export const DEFAULT_DISCOVERY_OPTIONS: Required<DiscoveryOptions> = {
  maxFiles: 100,
  maxFileSize: 250 * 1024, // 250 KB
  allowedExtensions: [
    '.js', '.jsx', '.mjs', '.cjs',
    '.ts', '.tsx',
    '.py',
    '.c', '.h',
    '.cpp', '.cc', '.cxx', '.hpp',
    '.java',
    '.go',
  ],
  excludedPatterns: [
    'vendor/',
    'node_modules/',
    'test/',
    'tests/',
    '__tests__/',
    'testing/',
    'spec/',
    'docs/',
    'documentation/',
    'build/',
    'dist/',
    '.github/',
    'third_party/',
    'examples/',
    'fixtures/',
    'mock/',
    'mocks/',
    '.min.js',
    '.bundle.js',
    '.d.ts',
    '.test.',
    '.spec.',
  ],
};

/**
 * Interface for network fetching to ensure complete test injectability and determinism.
 */
export interface IGitHubFetcher {
  getLatestCommitSha(repoFullName: string, defaultBranch?: string): Promise<string>;
  getGitTree(repoFullName: string, commitSha: string): Promise<Array<{ path: string; size?: number; type: string; sha: string }>>;
  getFileContent(repoFullName: string, commitSha: string, filePath: string): Promise<string>;
}

/**
 * Production implementation of IGitHubFetcher using Axios.
 */
export class GitHubApiFetcher implements IGitHubFetcher {
  private client: AxiosInstance;

  constructor(token?: string) {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'LeetRoot-Discovery-Engine/1.0',
    };
    const effectiveToken = token || config.github.token;
    if (effectiveToken) {
      headers['Authorization'] = `token ${effectiveToken}`;
    }

    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers,
      timeout: 10000,
    });
  }

  async getLatestCommitSha(repoFullName: string, defaultBranch: string = 'main'): Promise<string> {
    try {
      const encodedBranch = encodeURIComponent(defaultBranch);
      const res = await this.client.get(`/repos/${repoFullName}/commits/${encodedBranch}`);
      const sha = res.data?.sha;
      if (!sha || typeof sha !== 'string' || sha.length < 7) {
        throw new Error(`Invalid commit SHA returned for ${repoFullName}@${defaultBranch}`);
      }
      return sha;
    } catch (err: any) {
      throw new Error(`[DISCOVERY ERROR] Failed to resolve commit SHA for ${repoFullName}@${defaultBranch}: ${err.message}`);
    }
  }

  async getGitTree(
    repoFullName: string,
    commitSha: string
  ): Promise<Array<{ path: string; size?: number; type: string; sha: string }>> {
    try {
      const res = await this.client.get(`/repos/${repoFullName}/git/trees/${commitSha}?recursive=1`);
      const tree = res.data?.tree;
      if (!Array.isArray(tree)) {
        throw new Error(`Invalid tree response for ${repoFullName}@${commitSha}`);
      }
      return tree.map((item: any) => ({
        path: item.path,
        size: item.size,
        type: item.type,
        sha: item.sha,
      }));
    } catch (err: any) {
      throw new Error(`[DISCOVERY ERROR] Failed to fetch git tree for ${repoFullName}@${commitSha}: ${err.message}`);
    }
  }

  async getFileContent(repoFullName: string, commitSha: string, filePath: string): Promise<string> {
    const cleanPath = filePath.replace(/^\//, '');
    const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
    const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${commitSha}/${encodedPath}`;
    try {
      const res = await axios.get(rawUrl, {
        timeout: 10000,
        responseType: 'text',
      });
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (err: any) {
      throw new Error(`[DISCOVERY ERROR] Failed to fetch raw file ${rawUrl}: ${err.message}`);
    }
  }
}

/**
 * Service orchestrating bounded repository discovery and commit pinning.
 */
export class RepoDiscoveryService {
  private fetcher: IGitHubFetcher;

  constructor(fetcher?: IGitHubFetcher) {
    this.fetcher = fetcher || new GitHubApiFetcher();
  }

  /**
   * Returns curated metadata for a known repository, or builds default metadata.
   */
  public getCuratedRepo(repoFullName: string): CuratedRepo {
    const curated = CURATED_REPOS.find((r) => r.fullName.toLowerCase() === repoFullName.toLowerCase());
    if (curated) return curated;

    return {
      name: repoFullName.split('/')[1] || repoFullName,
      fullName: repoFullName,
      url: `https://github.com/${repoFullName}`,
      defaultBranch: 'main',
      language: 'Unknown',
      stars: 100,
      description: 'Repository',
      targetPatterns: [],
      samplePaths: [],
    };
  }

  /**
   * Resolves the immutable commit SHA for the repository's target branch.
   */
  public async resolveCommitSha(repoFullName: string, branch?: string): Promise<string> {
    try {
      const repo = this.getCuratedRepo(repoFullName);
      const targetBranch = branch || repo.defaultBranch || 'main';
      return await this.fetcher.getLatestCommitSha(repoFullName, targetBranch);
    } catch (err: any) {
      if (err.message.includes('[DISCOVERY ERROR]')) throw err;
      throw new Error(`[DISCOVERY ERROR] Failed to resolve commit SHA for ${repoFullName}: ${err.message}`);
    }
  }

  /**
   * Filters and bounds the list of repository files according to strict size, extension,
   * directory exclusion, and total file count limits.
   */
  public filterFiles(
    tree: Array<{ path: string; size?: number; type: string; sha: string }>,
    options: DiscoveryOptions = {}
  ): DiscoveredFile[] {
    const opts = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
    const discovered: DiscoveredFile[] = [];

    for (const item of tree) {
      if (item.type !== 'blob') continue;
      if (typeof item.size === 'number' && item.size > opts.maxFileSize) continue;

      const normalizedPath = item.path.toLowerCase().replace(/\\/g, '/');

      // Check excluded path segments
      const isExcluded = opts.excludedPatterns.some((pattern) => {
        const p = pattern.toLowerCase();
        if (p.endsWith('/')) {
          return normalizedPath.startsWith(p) || normalizedPath.includes('/' + p);
        }
        return normalizedPath.includes(p);
      });
      if (isExcluded) continue;

      // Check allowed extension
      const hasAllowedExtension = opts.allowedExtensions.some((ext) =>
        normalizedPath.endsWith(ext.toLowerCase())
      );
      if (!hasAllowedExtension) continue;

      discovered.push({
        path: item.path,
        size: item.size || 0,
        sha: item.sha,
      });

      if (discovered.length >= opts.maxFiles) {
        break;
      }
    }

    return discovered;
  }

  /**
   * Performs bounded file discovery for a repository pinned to a specific commit SHA.
   */
  public async discoverFiles(
    repoFullName: string,
    commitSha: string,
    options: DiscoveryOptions = {}
  ): Promise<DiscoveredFile[]> {
    try {
      const tree = await this.fetcher.getGitTree(repoFullName, commitSha);
      return this.filterFiles(tree, options);
    } catch (err: any) {
      if (err.message.includes('[DISCOVERY ERROR]')) throw err;
      throw new Error(`[DISCOVERY ERROR] Failed to discover files for ${repoFullName}: ${err.message}`);
    }
  }

  /**
   * Retrieves content of a discovered file using the pinned commit SHA.
   */
  public async fetchFile(
    repoFullName: string,
    commitSha: string,
    filePath: string
  ): Promise<string> {
    try {
      return await this.fetcher.getFileContent(repoFullName, commitSha, filePath);
    } catch (err: any) {
      if (err.message.includes('[DISCOVERY ERROR]')) throw err;
      throw new Error(`[DISCOVERY ERROR] Failed to fetch file ${filePath} in ${repoFullName}: ${err.message}`);
    }
  }
}
