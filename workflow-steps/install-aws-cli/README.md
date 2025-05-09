## Usage

> [!WARNING]
> This step relies on sending over the AWS\_\* environment variables for authentication via the --with-env-vars cli arg. If you're using an OIDC setup step like GitHub Actions for aws. Then the environment variables will be automatically set for you.
>
> ```shell
> nx-cloud start-ci-run --with-env-vars="AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,AWS_DEFAULT_REGION,AWS_SESSION_TOKEN"
> ```
>
> Don't forget the `AWS_SESSION_TOKEN` if you're using temporary credentials!

```yaml
- name: Install Node
  uses: 'nrwl/nx-cloud-workflows/v4/workflow-steps/install-aws-cli/main.yaml'
```
