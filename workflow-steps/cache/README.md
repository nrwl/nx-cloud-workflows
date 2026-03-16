# Usage and Inputs

```yaml
- name: Git Cache Step
  uses: 'nrwl/nx-cloud-workflows/v4/workflow-steps/cache/main.yaml'
  inputs:
    key: 'package-lock.json|yarn.lock|pnpm-lock.yaml'
    paths: 'node_modules'
    base-branch: 'main'
```

## `key` ![default](https://img.shields.io/badge/default_value-%27package--lock%2Ejson%7Cyarn%2Elock%7Cpnpm--lock%2Eyaml%27-D3D3D3)

The keys can contain a combination of strings or globs that need to be hashed.

For example, this cache entry will get busted if any of the files under `scripts/*` changes:

```yaml
key: '"some-string" | scripts/*'
```

Note how "some-string" has quotes around it. This is important and tells the step to key it as-is, and not try to look
for a folder
with that name to hash.

You can also point it directly to a specific file to be hashed:

```yaml
key: '"some-string" | yarn.lock'
```

## `paths` ![required](https://img.shields.io/badge/required-E53935)

You will normally upload a single folder under a key:

```yaml
paths: 'node_modules'
```

But you can optionally upload multiple folders, and they will all be restored in the same location if there is a cache
hit:

```yaml
paths: |
  folder_one
  folder_two/folder_three
  foo/bar/abc
```

All above locations will be cached and subsequently restored.

If you have multiple `node_modules` folder you can also pass in a glob path:

```yaml
paths: |
  packages/*/node_modules
```

## `base-branch`

By default, the cache step will only attempt to restore caches written **by the current branch**. This means each
branch's cache is isolated from other branches.

Setting the `base-branch` input allows a branch to fall back to cache entries from another branch when no match is
found for the current one:

```yaml
base-branch: 'main' # or another branch
```

This is especially useful when combined with
[scoped access tokens](https://nx.dev/docs/concepts/ci-concepts/cache-security#use-scoped-tokens-in-ci) (the
recommended setup). In this configuration, your protected branch (e.g. `main`) uses a read-write token and writes
cache entries, while PR branches use read-only tokens and can only restore from the cache. Setting `base-branch`
ensures PR workflows can still benefit from cache entries written by `main`.

> **Note:** If you use read-write tokens on non-protected branches, each branch will also write its own cache
> entries, enabling cache reuse across subsequent pushes to the same PR. However, this is **not recommended** as it
> allows any PR to write to the shared cache, which is a security risk — especially for open source projects where
> anyone can open a PR and potentially push malicious artifacts.

## Cache writes and access token permissions

The cache step requires a **read-write** access token to write cache entries. If your CI access token only has **read**
permissions, cache restores will work normally but cache uploads will be skipped with a message indicating the
token does not have write permissions.
