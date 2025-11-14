# Setup Docker Buildx

Configure Docker Buildx to use a `docker-container` builder in your workflow.

Note: Docker support in Nx Cloud Workflows is an enterprise-only feature. To use this step, ensure you have Nx Cloud Enterprise.

## Usage
```yaml
- name: Setup Docker Buildx
  uses: 'nrwl/nx-cloud-workflows/v5/workflow-steps/setup-docker-buildx/main.yaml'
```

### Input Options

#### buildx-version

Version of Docker Buildx to install based on the [GitHub Releases](https://github.com/docker/buildx/releases). If not specified, uses the version already installed in the environment.

For example:
```yaml
buildx-version: 'v0.29.1'
```

#### builder-name

Name for the Docker buildx builder instance. Defaults to `nx-agents-builder`.

For example:
```yaml
builder-name: 'my-custom-builder'
```

#### driver-opts

Comma-separated driver options for the docker-container driver. See [Docker documentation](https://docs.docker.com/build/builders/drivers/docker-container/) for available options.

For example:
```yaml
driver-opts: 'network=host,env.BUILDKIT_STEP_LOG_MAX_SIZE=10485760'
```

#### buildkit-config

Full contents of the `buildkitd.toml` configuration file.

This allows for complete customization of BuildKit configuration including registry mirrors, custom CA certificates, network settings, and more. See [BuildKit TOML configuration documentation](https://github.com/moby/buildkit/blob/master/docs/buildkitd.toml.md) for all available options.

**Using the literal block scalar (`|`):**
```yaml
buildkit-config: |
  debug = true
  [worker.oci]
    max-parallelism = 4
```

## What This Step Does

1. **Installs Docker Buildx** (if `buildx-version` is specified): Downloads and installs the specified version of Docker Buildx for your system architecture (amd64, arm64, or arm-v7)
2. **Configures BuildKit**: Creates BuildKit configuration to support registry caching if enabled
3. **Creates Builder**: Sets up a new docker-container driver builder with the specified configuration
4. **Sets Environment Variable**: Exports `BUILDX_BUILDER` environment variable for use in subsequent workflow steps

## Environment Variables

After this step completes, the following environment variable is available for subsequent steps:

- `BUILDX_BUILDER`: The name of the configured buildx builder instance