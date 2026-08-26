const { execSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync } = require('fs');

const command = process.env.NX_CLOUD_INPUT_script;

execSync(command, { stdio: 'inherit' });
