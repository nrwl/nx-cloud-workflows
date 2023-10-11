const {execSync} = require("child_process");

execSync('npx nx run-many -t build', {stdio: 'inherit'})
const output = execSync(`git status --porcelain | grep '/output' || true`).toString('utf-8');

if (output) {
    console.error("Source files have been modified. Commit them first.");
    console.log('\nChanged Files:');
    console.log(output)
    process.exit(1);
}