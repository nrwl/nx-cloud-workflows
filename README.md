# NxCloud Workflows

## Re-usable workflow step

1. Create your custom step in `workflow-steps/`
2. Build everything: `nx run-many -t build`
3. Commit everything
   1. Important: The generated `dist/` files need to be checked in as well
4. Tag with a new version: `git tag v1.0`
5. Push your changes
