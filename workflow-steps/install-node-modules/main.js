const { execSync } = require('child_process');

execSync(`
    if test -f "package-lock.json"; then
        echo "Using npm"
        npm ci
        exit
    fi
    if test -f "yarn.lock"; then
        echo "Using yarn"
        yarn install --frozen-lockfile
        exit
    fi
    echo "Failed to detect package manager"
    exit 1
`);
