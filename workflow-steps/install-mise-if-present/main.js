const { existsSync } = require('fs');

const miseMarkers = ['mise.toml', '.mise.toml', '.tool-versions'];

if (miseMarkers.some((f) => existsSync(f))) {
  require('../install-mise/main.js');
} else {
  console.log(
    'No mise config detected (no mise.toml, .mise.toml, or .tool-versions). Skipping mise install.',
  );
}
