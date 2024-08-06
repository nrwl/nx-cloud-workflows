# Usage and Inputs

```yaml
- name: Git Cache Step
  uses: 'nrwl/nx-cloud-workflows/v4/workflow-steps/cache/main.yaml'
  inputs:
    key: 'package-lock.json|yarn.lock|pnpm-lock.yaml'
    paths: 'node_modules'
    base_branch: 'main'
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

## `base_branch`

For security reasons, this step will only write cache entries **for the current branch only**. This isolation is
essential, for example, for open source projects, where anyone can create PRs and potentially push malicious artefacts
to the cache.

So by default, if you do not pass the `base_branch`, the cache step will only attempt to restore caches written **by the
current branch only**. This can be fine, as any subsequent pushes to your PR will re-use the cache, and all the commits
that go into your
`main` branch will also re-use the cache.

However, for an extra optimisation, we recommend setting:

```yaml
base_branch: 'main' # or another branch
```

This will ensure that when you first open a PR, if a cached entry isn't found for the current branch, it will try to
look at entries
on your default protected branch (usually `main`).
