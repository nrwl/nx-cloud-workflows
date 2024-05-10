# Nx Cloud Workflows

## Re-usable workflow step

1. Create your custom step in `workflow-steps/`
2. Build everything: `nx run-many -t build`
3. Commit everything
   1. Important: The generated `dist/` files need to be checked in as well
4. Push your changes

## Process for Releasing New Versions

To release a new version, you'll need to run the [ Nx Cloud Workflow Release workflow ](https://github.com/nrwl/nx-cloud-workflows/actions/workflows/nx-cloud-workflow-release.yml). You would do this by providing the workflow with comma-separated commits that need cherry-picking, and the version you wish to release.

> [!NOTE]
> If a new release is required, you only need to provide the version number. This is because the workflow is designed to automatically create the branch and tag from the `main` HEAD if the new version is a major one. In contrast, for minor or patch versions, the latest HEAD on the related major branch is used based on the version number.

Below is a summary of what the workflow does:

- For every major release, a `releases/v*` branch is created
- The HEAD of each release branch will always have a major `v*` tag pointing to the HEAD of the branch
- Multiple tags could be created for branches needing minor/patch releases
- Here's how it works:
  - For a 4.1 release, `v4` and `v4.1` tags are created at the HEAD of the release branch
  - For a 4.2 release, `v4` and `v4.2` tags are created at the HEAD of the release branch, and the previous `v4.1` tag continues to exist
  - For a 4.2.1 release, `v4`, `v4.2`, and `v4.2.1` tags are created at the HEAD
- Therefore, users can use `v4` to get all **_minor_** and **_patches_** automatically, or
- Use `v4.1` to get all **_patches_** automatically

> [!IMPORTANT]
> Always create tags off the release branches, and not directly on `main`. This allows the flexibility to work on `main` without unwarranted disruptions to users.
