import fs from "node:fs";
import path from "node:path";

export const MAX_DOCUMENT_BYTES = 12_000;
export const MAX_STYLES_BYTES = 32_000;
export const MAX_CONNECT_ORIGINS = 8;
export const MAX_PROMPT_INJECTION_BYTES = 40_000;
export const PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  source: string;
  connect: string[];
  recommendedRefreshSeconds: number;
  enabledByDefault?: boolean;
}

export interface PluginDescriptor {
  id: string;
  name: string;
  version: string;
  connect: string[];
  recommendedRefreshSeconds: number;
  document: string;
}

export interface PluginManifest extends PluginMetadata {
  document: string;
  styles: string;
}

function scalar(value: string): string | number | boolean {
  const text = value.trim();
  if (!text) return "";
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function parseFrontmatter(source: string): Record<string, unknown> {
  const lines = source.split(/\r?\n/);
  const data: Record<string, unknown> = {};
  let listKey: string | null = null;

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const list = /^\s+-\s+(.+)$/.exec(rawLine);
    if (list) {
      if (!listKey || !Array.isArray(data[listKey])) {
        throw new Error("Plugin frontmatter contains an unexpected list item");
      }
      (data[listKey] as unknown[]).push(scalar(list[1]));
      continue;
    }
    const field = /^([a-z][a-z0-9-]*):(?:\s*(.*))?$/.exec(rawLine);
    if (!field) throw new Error(`Unsupported plugin frontmatter line: ${rawLine.trim()}`);
    listKey = null;
    if (!field[2]) {
      data[field[1]] = [];
      listKey = field[1];
    } else if (field[1] === "connect" && /^\[.*\]$/.test(field[2].trim())) {
      const items = field[2].trim().slice(1, -1).trim();
      data[field[1]] = items ? items.split(",").map((item) => scalar(item)) : [];
    } else {
      data[field[1]] = scalar(field[2]);
    }
  }
  return data;
}

export function exactHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 256) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hostname.includes("*") ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function utf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function optionalText(metadata: Record<string, unknown>, key: string, maximum: number): string {
  const value = metadata[key];
  if (value === undefined) return "";
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`Plugin ${key} is invalid`);
  }
  return value.trim();
}

export function validateStyles(value = ""): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || utf8Bytes(value) > MAX_STYLES_BYTES) {
    throw new Error(`Plugin CSS exceeds ${MAX_STYLES_BYTES} UTF-8 bytes`);
  }
  return value.trim();
}

export function parsePluginMarkdown(markdown: string, styles = ""): PluginManifest {
  if (typeof markdown !== "string" || !markdown.trim() || utf8Bytes(markdown) > MAX_DOCUMENT_BYTES) {
    throw new Error(`Plugin document is empty or exceeds ${MAX_DOCUMENT_BYTES} UTF-8 bytes`);
  }
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/.exec(markdown);
  if (!match) throw new Error("Plugin document requires YAML frontmatter between --- delimiters");

  const metadata = parseFrontmatter(match[1]);
  const body = match[2].trim();

  const pluginVer = metadata["drawva-plugin"];
  if (pluginVer !== 1) throw new Error("Unsupported plugin version (expected 1)");

  const id = String(metadata.id || "").trim();
  if (!PLUGIN_ID_PATTERN.test(id) || id.length > 64) throw new Error(`Plugin id '${id}' is invalid`);

  if (typeof metadata.name !== "string" || !metadata.name.trim() || metadata.name.length > 80) {
    throw new Error("Plugin name is required and must be under 80 characters");
  }

  const description = optionalText(metadata, "description", 240);
  const category = optionalText(metadata, "category", 48);
  const source = optionalText(metadata, "source", 80);

  if (!description) throw new Error("Plugin description is required");
  if (!category) throw new Error("Plugin category is required");
  if (!source) throw new Error("Plugin source is required");

  if (!["string", "number"].includes(typeof metadata.version) || !String(metadata.version).trim() || String(metadata.version).length > 32) {
    throw new Error("Plugin version is invalid");
  }

  const connectRaw = Array.isArray(metadata.connect) ? metadata.connect : [];
  if (connectRaw.length > MAX_CONNECT_ORIGINS) {
    throw new Error(`Plugin connect must contain zero to ${MAX_CONNECT_ORIGINS} exact HTTPS origins`);
  }

  const connect: string[] = [];
  for (const item of connectRaw) {
    const origin = exactHttpsOrigin(item);
    if (!origin) throw new Error(`Plugin connect contains invalid origin '${String(item)}'`);
    if (connect.includes(origin)) throw new Error(`Plugin connect contains duplicate origin '${origin}'`);
    connect.push(origin);
  }

  const refreshSeconds = Number(metadata["recommended-refresh-seconds"] ?? 60);
  if (!Number.isFinite(refreshSeconds) || refreshSeconds < 60 || refreshSeconds > 86400) {
    throw new Error("Plugin recommended-refresh-seconds must be between 60 and 86400");
  }

  const oneShot = /^##[ \t]+One-shot example[ \t]*\r?\n([\s\S]*?)(?=^##[ \t]+|(?![\s\S]))/im.exec(body);
  if (!oneShot) throw new Error("Plugin document requires a '## One-shot example' section");
  if (!/\b(?:html_widget|diagram_source)\b/.test(oneShot[1])) {
    throw new Error("Plugin one-shot example must reference html_widget or diagram_source output command");
  }

  return {
    id,
    name: metadata.name.trim(),
    version: String(metadata.version),
    description,
    category,
    source,
    connect,
    recommendedRefreshSeconds: Math.round(refreshSeconds),
    document: markdown.trim(),
    styles: validateStyles(styles),
  };
}

let cachedManifests: PluginManifest[] | null = null;
let lastScanTime = 0;
const CACHE_TTL_MS = 10_000;

export function getPluginsDirectory(): string {
  return path.join(process.cwd(), "public", "plugins");
}

export function loadAllPlugins(forceRefresh = false): PluginManifest[] {
  const now = Date.now();
  if (!forceRefresh && cachedManifests && now - lastScanTime < CACHE_TTL_MS) {
    return cachedManifests;
  }

  const dir = getPluginsDirectory();
  const manifests: PluginManifest[] = [];

  if (!fs.existsSync(dir)) {
    cachedManifests = manifests;
    lastScanTime = now;
    return manifests;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(dir, entry.name);
      const docFile = path.join(pluginDir, "plugin.md");
      const styleFile = path.join(pluginDir, "styles.css");

      if (!fs.existsSync(docFile)) continue;

      try {
        const docContent = fs.readFileSync(docFile, "utf8");
        const styleContent = fs.existsSync(styleFile) ? fs.readFileSync(styleFile, "utf8") : "";
        const manifest = parsePluginMarkdown(docContent, styleContent);
        manifests.push(manifest);
      } catch (err) {
        console.warn(`[Plugins] Skipped corrupted plugin card in '${entry.name}':`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[Plugins] Failed to read plugins directory:", err);
  }

  manifests.sort((a, b) => {
    const priority = (id: string) => (id === "general" ? 0 : id === "flowchart" ? 1 : 2);
    const diff = priority(a.id) - priority(b.id);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  cachedManifests = manifests;
  lastScanTime = now;
  return manifests;
}

export function getPluginMetadataList(): PluginMetadata[] {
  return loadAllPlugins().map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    description: p.description,
    category: p.category,
    source: p.source,
    connect: p.connect,
    recommendedRefreshSeconds: p.recommendedRefreshSeconds,
    enabledByDefault: true,
  }));
}

export function getEnabledPluginDescriptors(enabledIds?: string[]): PluginDescriptor[] {
  const all = loadAllPlugins();
  const filterSet = Array.isArray(enabledIds) ? new Set(enabledIds) : null;
  const filtered = filterSet ? all.filter((p) => filterSet.has(p.id)) : all;

  const descriptors: PluginDescriptor[] = [];
  let totalBytes = 0;

  for (const manifest of filtered) {
    const descriptor: PluginDescriptor = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      connect: [...manifest.connect],
      recommendedRefreshSeconds: manifest.recommendedRefreshSeconds,
      document: manifest.document,
    };
    const cardBytes = utf8Bytes(JSON.stringify(descriptor));
    if (totalBytes + cardBytes > MAX_PROMPT_INJECTION_BYTES) {
      console.warn(`[Plugins] Prompt injection budget exceeded (${MAX_PROMPT_INJECTION_BYTES} bytes); skipping remaining plugins`);
      break;
    }
    descriptors.push(descriptor);
    totalBytes += cardBytes;
  }

  return descriptors;
}
