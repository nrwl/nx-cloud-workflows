const fs = require('fs');
const crypto = require('crypto');
import { glob } from 'glob';

function hashFileContents(pattern: string) {
  const files = glob
    .sync(pattern, { ignore: 'node_modules/**' })
    .filter((path) => {
      return fs.statSync(path).isFile();
    });
  let megaHash = '';
  files.forEach((file) => {
    const fileContent = fs.readFileSync(file);
    const fileHash = crypto
      .createHash('sha256')
      .update(fileContent)
      .digest('hex');
    megaHash = crypto
      .createHash('sha256')
      .update(fileHash + megaHash)
      .digest('hex');
  });
  return megaHash;
}

export function hashKey(key: string): string {
  const keyParts = key.split('|').map((s) => s.trim());

  const hardcodedKeys: string[] = [];
  const globsToHash: string[] = [];

  keyParts.forEach((key) => {
    if (key.startsWith('"') && key.endsWith('"')) {
      hardcodedKeys.push(key.slice(1, -1));
    } else {
      globsToHash.push(key);
    }
  });

  const globHashes = globsToHash.map((globPattern) => {
    return hashFileContents(globPattern);
  });
  return [...hardcodedKeys, ...globHashes].join(' | ');
}
