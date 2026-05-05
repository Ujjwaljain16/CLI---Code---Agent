import { readFile as fsRead } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = path.resolve('output');

export async function readFile({ path: filePath }) {
  if (!filePath) throw new Error('path is required');

  const normalized = String(filePath).replace(/^[.\\/]+/, '').replace(/\\/g, '/');
  const relativePath = normalized.startsWith('output/')
    ? normalized.slice('output/'.length)
    : normalized;

  const abs = path.resolve(OUTPUT_DIR, relativePath);

  // Security check: ensure we're reading inside output/
  if (!abs.startsWith(OUTPUT_DIR)) {
    throw new Error('Access denied: path outside output directory');
  }

  const content = await fsRead(abs, 'utf-8');
  return content;
}
