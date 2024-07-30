import { hashKey } from './hashing-utils';
import * as path from 'path';

console.log(hashKey);
describe('hashing-utils', () => {
  const testDir = path.join(__dirname, 'test-files');
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
});
