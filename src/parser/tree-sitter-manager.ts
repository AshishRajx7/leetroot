import Parser from 'web-tree-sitter';
import path from 'path';
import fs from 'fs';

export interface SupportedLanguageInfo {
  langKey: string;
  displayName: string;
  wasmFile: string;
  extensions: string[];
}

export const SUPPORTED_LANGUAGES: SupportedLanguageInfo[] = [
  {
    langKey: 'javascript',
    displayName: 'JavaScript',
    wasmFile: 'tree-sitter-javascript.wasm',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
  },
  {
    langKey: 'typescript',
    displayName: 'TypeScript',
    wasmFile: 'tree-sitter-typescript.wasm',
    extensions: ['.ts'],
  },
  {
    langKey: 'tsx',
    displayName: 'TSX',
    wasmFile: 'tree-sitter-tsx.wasm',
    extensions: ['.tsx'],
  },
  {
    langKey: 'python',
    displayName: 'Python',
    wasmFile: 'tree-sitter-python.wasm',
    extensions: ['.py'],
  },
  {
    langKey: 'c',
    displayName: 'C',
    wasmFile: 'tree-sitter-c.wasm',
    extensions: ['.c', '.h'],
  },
  {
    langKey: 'cpp',
    displayName: 'C++',
    wasmFile: 'tree-sitter-cpp.wasm',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp'],
  },
  {
    langKey: 'java',
    displayName: 'Java',
    wasmFile: 'tree-sitter-java.wasm',
    extensions: ['.java'],
  },
  {
    langKey: 'go',
    displayName: 'Go',
    wasmFile: 'tree-sitter-go.wasm',
    extensions: ['.go'],
  },
];

/**
 * Manages Tree-sitter WASM grammars and parser instances for reliable multi-language parsing.
 */
export class TreeSitterManager {
  private static instance: TreeSitterManager;
  private isInitialized = false;
  private languages: Map<string, Parser.Language> = new Map();
  private wasmDirectory: string;

  private constructor() {
    // Resolve location of prebuilt wasm binaries from tree-sitter-wasms
    this.wasmDirectory = path.join(__dirname, '../../node_modules/tree-sitter-wasms/out');
  }

  public static getInstance(): TreeSitterManager {
    if (!TreeSitterManager.instance) {
      TreeSitterManager.instance = new TreeSitterManager();
    }
    return TreeSitterManager.instance;
  }

  /**
   * Initializes web-tree-sitter core runtime. Safe to call repeatedly.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    const webTreeSitterDir = path.join(__dirname, '../../node_modules/web-tree-sitter');
    await Parser.init({
      locateFile: (scriptName: string) => path.join(webTreeSitterDir, scriptName),
    });

    this.isInitialized = true;
  }

  /**
   * Identifies supported language from a file path based on its extension.
   */
  public detectLanguage(filePath: string): SupportedLanguageInfo | null {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_LANGUAGES.find((l) => l.extensions.includes(ext)) || null;
  }

  /**
   * Loads and caches the Tree-sitter Language WASM grammar for a supported language.
   */
  public async getLanguage(langKey: string): Promise<Parser.Language | null> {
    await this.init();

    if (this.languages.has(langKey)) {
      return this.languages.get(langKey)!;
    }

    const langInfo = SUPPORTED_LANGUAGES.find((l) => l.langKey === langKey);
    if (!langInfo) return null;

    const wasmPath = path.join(this.wasmDirectory, langInfo.wasmFile);
    if (!fs.existsSync(wasmPath)) {
      console.warn(`[TreeSitter] WASM grammar not found at ${wasmPath}`);
      return null;
    }

    try {
      const language = await Parser.Language.load(wasmPath);
      this.languages.set(langKey, language);
      return language;
    } catch (err: any) {
      console.warn(`[TreeSitter] Failed to load language grammar ${langKey}: ${err.message}`);
      return null;
    }
  }

  /**
   * Returns a Parser instance configured for the specified language.
   */
  public async getParser(langKey: string): Promise<Parser | null> {
    const language = await this.getLanguage(langKey);
    if (!language) return null;

    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
  }

  /**
   * Safely parses source code using Tree-sitter. Handles malformed syntax gracefully without crashing.
   */
  public async parseSource(
    filePath: string,
    sourceCode: string
  ): Promise<{ tree: Parser.Tree | null; languageInfo: SupportedLanguageInfo | null; error?: string }> {
    const languageInfo = this.detectLanguage(filePath);
    if (!languageInfo) {
      return { tree: null, languageInfo: null, error: 'Unsupported language' };
    }

    const parser = await this.getParser(languageInfo.langKey);
    if (!parser) {
      return { tree: null, languageInfo, error: 'Grammar not loaded' };
    }

    try {
      const tree = parser.parse(sourceCode);
      return { tree, languageInfo };
    } catch (err: any) {
      return { tree: null, languageInfo, error: err.message };
    }
  }
}
