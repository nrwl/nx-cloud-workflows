## Usage

> [!WARNING]
> This step current does not support Windows yet.

```yaml
- name: Install Node
  uses: 'nrwl/nx-cloud-workflows/v4/workflow-steps/install-node/main.yaml'
  inputs:
    node_version: '20'
```

### Options

#### node_version

The node version to be installed. Any valid [nvm](https://github.com/nvm-sh/nvm/blob/master/README.md#usage) version is accepted.
This input is optional, as the step will also check for a `.nvmrc` file in the root of the repository.
If the file is present, the step will install the version specified in the file.
If the file is not present, the step will not install any node version and leave the default installed node version on the image for subsequent steps

For those using `volta`, the `volta.node` field in the `package.json` will also be picked up and used if present.

The current order of precedence is:

1. `node_version` input
1. `.nvmrc` file
1. `volta.node` field in `package.json`

For example:

- Install a specific node version: `node_version: '20.11.1'`
- Install latest of major node version: `node_version: '20'`

#### package_manager

The package manager to install as the default on the agent machine. Use `"skip"` to not install any package managers or `"all"` to install all. If using `"all"` then the defaults are yarn v1, pnpm v10, and bundled npm version with node.

This input is optional and defaults to `"all"`.

It's recommended to set this value to `"skip"` if the environment already using corepack to manage your versions since corepack will download the defined version from the `package.json#packageManager` field. If you are not using corepack, then it's recommended to only install the package manager you're using for your project.

For example:

- Install all package managers: `package_manager: 'all'` (default)
- Skip package manager installation: `package_manager: 'skip'`
- Install a specific package manager: `package_manager: 'pnpm'`

#### package_manager_version

The version to use with the defined `package_manager` input. This value is ignored if `package_manager` is set to `"all"` and the defaults versions are used.

This input is optional.

For example:

- Install a specific pnpm version: `package_manager: 'pnpm'` and `package_manager_version: '10`

#### corepack_version

The version of corepack to use.

This input is optional and defaults to `"latest"`. You can pin the version of corepack, but make sure to stay updated as older versions can run into certificate expiration issues preventing downloading the package manager.

For example:

- Use latest corepack: `corepack_version: 'latest'` (default)
- Use a specific corepack version: `corepack_version: '0.34'`
