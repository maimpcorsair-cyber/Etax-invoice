# Issue Tracker: GitHub

Issues and PRDs for this repo live in GitHub Issues for `maimpcorsair-cyber/Etax-invoice`. Use the `gh` CLI from inside this clone.

## Commands

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body "..."`
- Label: `gh issue edit <number> --add-label "..."`
- Close: `gh issue close <number> --comment "..."`

When a skill says "publish to the issue tracker", create a GitHub issue unless the user asks for a local markdown plan instead.
