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

### Working Directory

If your Nx workspace is in a subdirectory, the step will automatically use the `NX_WORKING_DIRECTORY` environment variable to change to the correct directory before detecting the package manager and installing dependencies.

### Caching pnpm installs

The install step does not restore package-manager caches automatically. For pnpm projects, cache both `node_modules` and pnpm's cache directory before this step:

```yaml
- name: Restore pnpm Dependencies Cache
  uses: 'nrwl/nx-cloud-workflows/v6/workflow-steps/cache/main.yaml'
  inputs:
    key: 'package.json|pnpm-lock.yaml|pnpm-workspace.yaml'
    paths: |
      node_modules
      ../.cache/pnpm
    base-branch: 'main'
- name: Install Node Modules
  uses: 'nrwl/nx-cloud-workflows/v6/workflow-steps/install-node-modules/main.yaml'
```

In pnpm 11, the cache directory also contains successful lockfile supply-chain verification results. Persisting it allows an unchanged lockfile that was verified under a compatible `minimumReleaseAge` or `trustPolicy` policy to skip repeated registry metadata checks. pnpm still verifies the lockfile content hash and policy before reusing a cached result.
