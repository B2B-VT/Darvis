---
name: git-commands-after-changes
enabled: true
event: stop
action: warn
pattern: ".*"
---
After making any code changes this turn, output the exact git commands the user needs to push them:

```
git add <changed files>
git commit -m "<type(scope): description of what changed and why>"
git push
```

List only the files you actually changed. Write a meaningful conventional commit message based on what you changed — use format `type(scope): description` (types: feat, fix, refactor, style, chore).
