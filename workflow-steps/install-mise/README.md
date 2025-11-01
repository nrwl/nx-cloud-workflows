## Usage

```yaml
- name: Install mise
  uses: 'nrwl/nx-cloud-workflows/v5/workflow-steps/install-mise/main.yaml'
  inputs:
    mise-version: 'v2025.10.19'
    auto-install: true
    tools: |
      rust=1.90
      node=20
```

### Options

#### auto_install

Auto run install tools after installing the mise cli. Defaults to `true`.

#### mise_version

Version of mise to use based on the [GitHub Releases](https://github.com/jdx/mise/releases). Defaults to `v2025.10.19`.

#### tools

Inline definition of tools to be installed. Tools are defined by a newline separated list where each line defines a tool and version separated by a `=`, `@` or space, `<name>=<version>`.

> [!warning]
> Defining tools inline will override a `mise.toml` if the file exists in the repo.
> This might lead to hard to debug behaviors between CI and Local environments.
> It's recommended to only use this option if a `mise.toml` doesn't already exists or to define a `mise.toml`

For example:

```yaml
tools: |
  rust=1.90
  node@20
  python 3.12
```
