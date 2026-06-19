const { existsSync, appendFileSync } = require('fs');
const { execSync } = require('child_process');

const rustMarkers = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'];

if (!rustMarkers.some((f) => existsSync(f))) {
  console.log(
    'No Rust project detected (no Cargo.toml, Cargo.lock, or rust-toolchain.toml). Skipping Rust install.',
  );
  return;
}

console.log('Rust project detected. Installing rustup/cargo...');

const steps = [
  `curl --proto '=https' --tlsv1.3 https://sh.rustup.rs -sSf | sh -s -- -y`,
  `. "$HOME/.cargo/env"`,
];

if (existsSync('rust-toolchain.toml')) {
  steps.push('rustup install');
}

steps.push('rustc --version');

execSync(steps.join(' && '), { stdio: 'inherit', shell: '/bin/bash' });

if (process.env.NX_CLOUD_ENV) {
  const cargoBin = `${process.env.HOME}/.cargo/bin`;
  appendFileSync(
    process.env.NX_CLOUD_ENV,
    `PATH=${cargoBin}:${process.env.PATH}\n`,
  );
}

console.log('Rust install complete.');
