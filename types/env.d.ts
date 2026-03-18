interface ImportMetaEnv {
  readonly BROWSER_TARGET: 'chrome' | 'firefox' | 'edge';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
