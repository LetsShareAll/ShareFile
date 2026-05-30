import * as fs from 'fs';
import * as path from 'path';

interface LoadedConfig {
  data: Record<string, unknown>;
  dir: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadJsonConfig(configPath: string): LoadedConfig {
  const resolvedPath = path.resolve(configPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`配置文件不存在: ${resolvedPath}`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`配置文件不是合法 JSON: ${resolvedPath} (${message})`, {
      cause: error,
    });
  }

  if (!isRecord(parsed)) {
    throw new Error(`配置文件顶层必须是 JSON 对象: ${resolvedPath}`);
  }

  return {
    data: parsed,
    dir: path.dirname(resolvedPath),
  };
}

export function getConfigSection(
  config: LoadedConfig | undefined,
  sectionName: string,
): Record<string, unknown> | undefined {
  if (!config) return undefined;
  const section = config.data[sectionName];

  if (section === undefined) return undefined;

  if (!isRecord(section)) {
    throw new Error(`配置段 ${sectionName} 必须是对象。`);
  }

  return section;
}

export function getBoolean(
  section: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  const value = section?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

export function getString(
  section: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = section?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function getStringArray(
  section: Record<string, unknown> | undefined,
  key: string,
): string[] | undefined {
  const value = section?.[key];

  if (!Array.isArray(value)) return undefined;

  return value.filter((item): item is string => typeof item === 'string');
}

export function resolveConfigPath(
  value: string | undefined,
  configDir: string | undefined,
): string | undefined {
  if (!value) return undefined;
  if (!configDir || path.isAbsolute(value)) return path.resolve(value);
  return path.resolve(configDir, value);
}
