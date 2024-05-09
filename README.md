# Nx Cloud Workflows

## Re-usable workflow step

1. Create your custom step in `workflow-steps/`
2. Build everything: `nx run-many -t build`
3. Commit everything
   1. Important: The generated `dist/` files need to be checked in as well
4. Push your changes

## Releasing new versions

Versioning requires triggering the [ Nx Cloud Workflow Release workflow ](https://github.com/nrwl/nx-cloud-workflows/actions/workflows/nx-cloud-workflow-release.yml) with comma separated commits to cherry pick and the version to release as.

> [!NOTE]
> Only the version number is needed if a new release is needed. The workflow will automatically create the branch and tag from the HEAD of `main` if the new version is a major. Or it will use the latest HEAD on the relative major branch based on the version number. (This allows us to place commits in release branches, and tag them when needed)

The workflow will do the following:

- All major releases will have its own `releases/v*` branch
- The head of each release branch will **_always_** have the major `v*` tag pointing to the HEAD of the branch. If minor/patch releases are needed multiple tags will be created for it.
- Examples:
  - Releasing 4.1 will have tags `v4` and `v4.1` created at the HEAD of the release branch.
  - Releasing 4.2 will have tags `v4` and `v4.2` created at the HEAD of the release branch. Previous tags (`v4.1` in this case) will remain unchanged
  - Releasing 4.2.1 will have tags `v4`, `v4.2` and `v4.2.1` created at the HEAD.
- Users are able to use `v4` and get all **_minor_** and **_patches_** automatically
- Users are able to use `v4.1` and get all **_patches_** automatically

> [!IMPORTANT]
> Tags should not be created directly on `main`, and will always be created off release branches. This allows us to iterate on `main` without causing too many disruptions for users.
