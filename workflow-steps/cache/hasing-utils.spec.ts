import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as path from 'node:path';
import { buildCachePaths, hashKey } from './hashing-utils';

describe('hashing-utils', () => {
  const testDir = path.join(__dirname, 'test-files');
  let consoleWarnSpy;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should hash a single file', () => {
    expect(hashKey(`${testDir}/yarn.lock`)).toEqual(
      '6ef0d64a2ac614adc8dac86db67244e77cdad3253a65fb8e2b7c11ed4cbb466a',
    );
  });

  it('should hash multiple files', () => {
    expect(hashKey(`${testDir}/yarn.lock | ${testDir}/main.js`)).toEqual(
      'e5c39d066ffa2cd0d38165a018aaac3118b1c81d8f4631335e0f19cda6fa8e65',
    );
  });

  it('should hash simple strings', () => {
    expect(
      hashKey(`${testDir}/yarn.lock | ${testDir}/main.js | "test1"`),
    ).toEqual(
      '16b5f107c209ad4d76dffc803beba37b7e836ca2ca229731c8bc88040874a003',
    );
    expect(
      hashKey(`${testDir}/yarn.lock | ${testDir}/main.js | "test2"`),
    ).toEqual(
      '226f813c92638665c8daa0920cfb83e5f33732f8843042deee348032a1abee40',
    );
  });

  it('should validate simple dirs', () => {
    let input = `test-files/packages/app1`;
    let expected = [`test-files/packages/app1`];
    expect(buildCachePaths(input)).toEqual(expected);

    input = `test-files/packages/app2\ntest-files/packages/app3\n\n`;
    expected = [`test-files/packages/app2`, `test-files/packages/app3`];
    expect(buildCachePaths(input)).toEqual(expected);

    input = `test-files/yarn.lock\ntest-files/packages/app3\n\n`;
    expected = [`test-files/yarn.lock`, `test-files/packages/app3`];
    expect(buildCachePaths(input)).toEqual(expected);

    input = `test-files/yarn.lock\ntest-files/main.js`;
    expected = [`test-files/yarn.lock`, `test-files/main.js`];
    expect(buildCachePaths(input)).toEqual(expected);
  });

  it('should warn when invalid dirs are specified', () => {
    const input = `test-files/packages/app6`;
    buildCachePaths(input);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'The following paths are not valid or empty:\n' +
        'test-files/packages/app6',
    );
  });

  it('should warn when invalid dirs are specified', () => {
    const input = `test-files/packages/app2\ntest-files/packages/app7\n\n`;
    buildCachePaths(input);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'The following paths are not valid or empty:\n' +
        'test-files/packages/app7',
    );
  });

  it('should support glob paths', () => {
    let input = `test-files/packages/*/mock_node_modules`;
    let expected = [
      `test-files/packages/app3/mock_node_modules`,
      `test-files/packages/app2/mock_node_modules`,
      `test-files/packages/app1/mock_node_modules`,
    ];
    expect(buildCachePaths(input)).toEqual(expected);

    // it should filter out duplicates
    input = `test-files/packages/app1/mock_node_modules\ntest-files/packages/*/mock_node_modules\ntest-files/packages`;
    expected = [
      `test-files/packages/app1/mock_node_modules`,
      `test-files/packages/app3/mock_node_modules`,
      `test-files/packages/app2/mock_node_modules`,
      `test-files/packages`,
    ];
    expect(buildCachePaths(input)).toEqual(expected);
  });

  it('should filter out duplicates', () => {
    const input = `test-files/packages/app1\ntest-files/packages/app1/mock_node_modules\ntest-files/packages/*/mock_node_modules\ntest-files/packages`;
    const expected = [
      `test-files/packages/app1`,
      `test-files/packages/app1/mock_node_modules`,
      `test-files/packages/app3/mock_node_modules`,
      `test-files/packages/app2/mock_node_modules`,
      `test-files/packages`,
    ];
    expect(buildCachePaths(input)).toEqual(expected);
  });
});
