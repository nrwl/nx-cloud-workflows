const { execSync } = require('child_process');
const { existsSync } = require('fs');

if (existsSync('package-lock.json')) {
  console.log('Using npm');
  execSync('npm ci --legacy-peer-deps', { stdio: 'inherit' });
  console.log('Calculating Nx graph');
  execSync('npx nx graph --file graph.json');
} else if (existsSync('yarn.lock')) {
  console.log('Using yarn');
  execSync('yarn install --frozen-lockfile', { stdio: 'inherit' });
  console.log('Calculating Nx graph');
  execSync('npx nx graph --file graph.json');
} else if (existsSync('pnpm-lock.yaml') || existsSync('pnpm-lock.yml')) {
  // base image has to install pnpm
  console.log('Using pnpm');
  execSync('pnpm install --frozen-lockfile', { stdio: 'inherit' });
  console.log('Calculating Nx graph');
  execSync('npx nx graph --file graph.json');
}
