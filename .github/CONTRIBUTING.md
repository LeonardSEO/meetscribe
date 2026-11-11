# Contributing to Meetscribe

Meetscribe is a local meeting assistant based on OpenWhispr. Report bugs and feature requests at
[github.com/LeonardSEO/meetscribe/issues](https://github.com/LeonardSEO/meetscribe/issues).

## Security issues

**Please do not open a public issue for a security problem.** Follow [`SECURITY.md`](../SECURITY.md).

## Contributing code

1. Create a branch from `main`.
2. Keep the change small and focused.
3. Run `npm test`, `npm run lint` and `npm run format` before opening a pull request.
4. Explain in the pull request why the change is needed.

### Local setup

| Requirement | Notes                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| Node.js     | Version pinned in [`.nvmrc`](../.nvmrc) (currently `24`). Use `nvm use`. |
| Install     | `npm ci`                                                                 |
| Dev         | `npm run dev`                                                            |
| Build       | `npm run build:local:mac` or `npm run build:local:win`                   |

### CI scope and required checks

Small routing and status jobs run on every PR. Documentation changes run quality
checks but do not trigger packaging.

Repository maintainers should require **Desktop CI**, **CodeQL CI**,
and **lockfile-lint** in the GitHub ruleset, replacing individual build/matrix checks.
Also require GitHub's **CodeQL** code-scanning results check (or a CodeQL code-scanning
merge-protection rule). **CodeQL CI** only confirms that the selected scans completed;
it does not enforce alert severity. Retain the security-results check to block new
high/critical findings. Require review before merging,
including explicit review of workflow and dependency changes, and enable approval
for workflows from outside contributors. Ruleset settings are managed on GitHub;
adding these workflow files does not configure them automatically.
