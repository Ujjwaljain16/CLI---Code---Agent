/**
 * appendFile.js
 *
 * Appends content to an existing file in the output directory.
 * Use this to write large HTML/CSS files in multiple smaller chunks
 * to avoid hitting the 64K token output limit.
 *
 * Workflow:
 *   1. writeFile({ path: "index.html", content: "<!DOCTYPE html>...<header>...</header>" })
 *   2. appendFile({ path: "index.html", content: "<main>...</main>" })
 *   3. appendFile({ path: "index.html", content: "<footer>...</footer>\n</body>\n</html>" })
 */

import { appendFile as fsAppend, mkdir } from 'fs/promises';
import path from 'path';

const OUTPUT_DIR = path.resolve('output');

export async function appendFile(args) {
  const filePath = args.path || args.file_path || args.filename || args.file;
  const content  = args.content;

  if (!filePath) throw new Error('path is required');
  if (content === undefined || content === null) throw new Error('content is required');

  const abs = path.resolve(OUTPUT_DIR, filePath);

  // Security check: prevent path traversal
  if (!abs.startsWith(OUTPUT_DIR)) {
    throw new Error('Access denied: path outside output directory');
  }

  const dir = path.dirname(abs);

  await mkdir(dir, { recursive: true });
  await fsAppend(abs, content, 'utf-8');

  return `Appended ${content.length} chars to output/${filePath}`;
}
