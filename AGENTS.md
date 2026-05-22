# Codex Project Instructions

## Commit Message Requirements

Commit messages in this repository must use a bilingual structured format.

Subject line:

- Use a Conventional Commit type and a concise Chinese summary.
- Keep the subject focused on the user-facing or project-facing outcome.
- Example: `chore: 准备 0.1.1 发布版本`

Body:

```text
中文

标题：<中文标题>

变更要点：
- <中文变更点 1>
- <中文变更点 2>

验证要点：
- <中文验证点 1>

English

Title: <English title>

Changes:
- <English change 1>
- <English change 2>

Verification:
- <English verification 1>
```

Guidelines:

- Include both Chinese and English sections for every non-trivial commit.
- Keep bullets factual and specific to the files or behavior changed.
- Record verification commands that were actually run, especially `npm test`, `npm run build`, and relevant `npm run spec:validate -- <change-name>` checks.
- If verification could not be run, state that clearly in both languages.
- Do not mention unrelated local files, credentials, vault contents, or external private notes.
