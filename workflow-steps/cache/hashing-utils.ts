const fs = require('fs');
const crypto = require('crypto');
import { glob } from 'glob';

const path = require('path');
const os = require('os');

function hashFileContents(pattern: string) {
  const files = glob
    .sync(pattern, { ignore: 'node_modules/**' })
    .filter((path) => {
      return fs.statSync(path).isFile();
    });
  let megaHash = '';
  files.forEach((file) => {
    const fileContent = fs.readFileSync(file);
    const fileHash = hash(fileContent);
    megaHash = hash(fileHash + megaHash);
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
  const hashCollections = [...hardcodedKeys, ...globHashes];

  // we are only doing this for backwards compatibility purposes, so we don't bust everyone's cache when it gets merged in
  // otherwise, it would've been fine to hash another hash
  if (hashCollections.length > 1) {
    return hash(hashCollections.join(' | '));
  }
  return hashCollections.join(' | ');
}

function hash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function tildePathToRelative(cachedFolderPath: string) {
  if (cachedFolderPath.includes('~')) {
    const expandedPath = cachedFolderPath.replace(/^~/, os.homedir());
    return path.relative(process.cwd(), expandedPath);
  }
  return cachedFolderPath;
}

export function buildCachePaths(inputPaths: string) {
  const directories = Array.from(
    new Set(
      inputPaths
        .split('\n')
        .filter((p) => p)
        .map((p) => tildePathToRelative(p))
        .reduce(
          (allPaths, currPath) => [...allPaths, ...expandPath(currPath)],
          [],
        ),
    ),
  );

  const invalidDirectories = directories.filter((dir) => !fs.existsSync(dir));
  if (invalidDirectories.length > 0) {
    console.warn(
      `The following paths are not valid or empty:\n${invalidDirectories.join(
        '\n',
      )}`,
    );
  }
  return directories;
}

function expandPath(pattern: string): string[] {
  const globExpandedPaths = glob.sync(pattern);
  if (globExpandedPaths.length == 0) {
    // it's probably not a valid path so we return it so it can be included in the error above
    return [pattern];
  }
  return globExpandedPaths;
}
