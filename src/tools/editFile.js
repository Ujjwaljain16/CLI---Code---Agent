import { readFile as fsRead, writeFile as fsWrite } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = path.resolve('output');

/**
 * Edit a file by finding and replacing content.
 * This is more intelligent than rewriting the entire file.
 * Allows precise modifications while preserving rest of content.
 */
export async function editFile({ path: filePath, find, replace }) {
  if (!filePath) throw new Error('path is required');
  if (find === undefined) throw new Error('find is required');
  if (replace === undefined) throw new Error('replace is required');

  const abs = path.resolve(OUTPUT_DIR, filePath);

  // Security check
  if (!abs.startsWith(OUTPUT_DIR)) {
    throw new Error('Access denied: path outside output directory');
  }

  try {
    // Read current content
    const content = await fsRead(abs, 'utf-8');

    // Check if find string exists
    if (!content.includes(find)) {
      throw new Error(`Pattern not found in ${filePath}. Content to find:\n${find}`);
    }

    // Replace (only first occurrence for safety)
    const updated = content.replace(find, replace);

    // Write back
    await fsWrite(abs, updated, 'utf-8');

    return `Edited: output/${filePath} — replaced ${find.length} chars with ${replace.length} chars`;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw err;
  }
}
