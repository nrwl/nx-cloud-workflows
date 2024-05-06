const { execSync } = require('child_process');
const { existsSync } = require('fs');

// TODO: switch step to remove nvm instaall when nvm is in the base image
if (process.env.NX_CLOUD_NODE_VERSION || existsSync('.nvmrc')) {
  try {
    // have to run as single command to keep the nvm env vars in the same shell

    // nvm does not work with npm_config_prefix set, so unset it
    const nvmSetupCommand = `unset NPM_CONFIG_PREFIX`;
    const nvmInstallCommand = `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && source ~/.profile`;
    // if NX_CLOUD_NODE_VERSION is set, use it, otherwise assume a .nvmrc file exists
    const installNodeCommand = `nvm install ${
      process.env.NX_CLOUD_NODE_VERSION || ''
    } --default`;
    // nvm sets up the node path in the active shell
    // we need to append it to the nx cloud env, so next steps will get the correct node version
    const appendPathCommand = `echo "PATH=$PATH" >> ${process.env.NX_CLOUD_ENV}`;

    execSync(
      `${nvmSetupCommand} && ${nvmInstallCommand} && ${installNodeCommand} && ${appendPathCommand}`,
      {
        stdio: 'inherit',
        // use bash, since we need to call `source` to load nvm
        shell: '/bin/bash',
      },
    );
  } catch (e) {
    console.error(e);
    throw new Error(
      `Failed to install node version using nvm ${
        process.env.NX_CLOUD_NODE_VERSION || ''
      }`,
    );
  }
}
