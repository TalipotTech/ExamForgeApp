# Development Workflow Rules

## Local Dev Server

- DO NOT start or run the dev server from Claude Code
- The user debugs and runs the app from Cursor IDE
- Only make code changes, commit, and merge from here
- If preview/verification is needed, ask the user to check in Cursor

## Merging

- Worktree branch: `claude/adoring-varahamihira`
- Always commit with lint fixes before merging
- Merge to `main` with `--no-ff` for clean history
- Stash any uncommitted main changes before merge, pop after

## Deployment

- Custom domain: `ice.ensate.in` (user testing subdomain)
- Production domain: TBD (after user testing)
- Hosting: AWS App Runner (ap-south-1)
- DNS: HostingRaja (nameservers: securehostdns.com)
