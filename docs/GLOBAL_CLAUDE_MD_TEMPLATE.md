# Global Claude Code Preferences
# Location: ~/.claude/CLAUDE.md (applies to ALL projects)
# This file is personal and NOT committed to any repository.

# Language & Communication
- Respond in English
- Be direct and concise
- When I ask to "fix" something, show me the diff, don't rewrite the whole file
- Use ultrathink for complex architectural decisions

# Default Tools
- Package manager: pnpm (never npm or yarn)
- Runtime: Node.js 22 LTS
- Language: TypeScript strict mode
- Testing: Vitest
- Formatting: Prettier (2-space indent, single quotes, semicolons)

# Git Habits
- Conventional Commits always
- Small atomic commits over large dumps
- Always check `git diff --staged` before committing

# AWS Context
- Default region: ap-south-1 (Mumbai)
- Using AWS Activate Startups credits
- Prefer managed services over self-hosted

# India Context
- Building for Indian users (mobile-first, low bandwidth awareness)
- Payment gateway: Razorpay (not Stripe)
- SMS/OTP: MSG91 (not Twilio)
- Compliance: DPDPA 2023
