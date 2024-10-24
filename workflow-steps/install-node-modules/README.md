```yaml
- name: Install Node Nodules
  uses: 'nrwl/nx-cloud-workflows/v4/workflow-steps/install-node-modules/main.yaml'
  inputs:
    npm_legacy_install: 'true'
```

### Options

#### npm_legacy_install

This input is optional and defaults to `true` if not specified.

If set to `true`, the step will install the node modules using `npm ci --legacy-peer-deps` when the npm package manager is used.

If set to `false`, the step will install the node modules using `npm ci` when the npm package manager is used.

If you do not already have a [custom launch template](https://nx.dev/ci/reference/launch-templates), you can also control this behavior by setting the `NX_CLOUD_NPM_LEGACY_INSTALL` environment variable to `true` or `false` in your main agent and [pass the variable via `--with-env-vars="NX_CLOUD_NPM_LEGACY_INSTALL"`](https://nx.dev/ci/reference/launch-templates#pass-environment-variables-to-agents)
