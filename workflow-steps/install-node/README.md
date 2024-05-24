## Usage

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
