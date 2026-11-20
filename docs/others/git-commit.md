---
id: GUIDE-git-commit
title: Git Commit 规范
doc_type: other
status: accepted
scope: [commit, git]
updated: 2026-11-19
inclusion: manual
---

# Git Commit 规范

本项目使用 Husky 钩子校验 commit message，不符合规范的提交会被拒绝。

## 提交格式

```
[用户名] #卡号 type: 一句话概括本次变更
```

示例：
- `[Xiaoming] #1234 fix: error message not displaying correctly when WIP creation failed`
- `[HuangCheng] #PP-123 feat: add account export entry in admin page`
- `[dev & qa] #N/A docs: add git commit convention doc`

## 字段说明

- **用户名**：放在 `[]` 中，可包含字母数字、空格以及 `&`
- **卡号**：以 `#` 开头，有卡号用 `#PP-2323`，没卡号用 `#N/A`
- **type**：必须是以下之一（全小写）
  - `feat` - 给用户的新功能
  - `fix` - 给用户的 bug 修复
  - `refactor` - 生产代码重构
  - `test` - 补充/重构测试
  - `chore` - 工程维护（依赖升级、配置调整等）
  - `style` - 代码风格/格式
  - `docs` - 文档/注释变更
  - `mock` - 临时添加 mock 数据
- **一句话概括**：用动词开头（add / update / remove / fix / refactor ...）

## 触发提交

当对话中提到 "commit" 时，按以下规则生成 message：

- **只说 `commit`**：用户名从 `git config user.name` 获取，卡号自动推断（见下方规则）
- **`commit 卡号：PP-123`**：指定卡号
- **`commit 用户名：xxx 卡号：PP-123`**：同时指定用户名和卡号

## 提交前检查

在执行 commit 之前，**必须**先检查工作区状态：

```bash
git status --short
```

根据输出结果：
- 如果**没有任何改动**，提示用户没有可提交的内容
- 其他情况，使用 `git add -A` 将所有改动加入暂存区后直接提交

## 卡号自动推断规则

当用户没有提供卡号时，按以下步骤自动推断：

1. 获取当前用户名：`git config user.name`
2. 搜索该用户最近 10 次提交：`git log --author="用户名" -10 --pretty=format:"%s"`
3. 从提交信息中匹配卡号（正则：`#([A-Za-z]+-\d+|\d+)`）
4. 使用找到的第一个卡号作为本次提交的卡号
5. 如果没有找到任何卡号，则使用 `N/A`

**示例流程：**
```bash
# 1. 获取用户名
git config user.name
# 输出: HuangCheng

# 2. 搜索最近提交
git log --author="HuangCheng" -10 --pretty=format:"%s"
# 输出:
# [HuangCheng] #PP-456 feat: add new feature
# [HuangCheng] #PP-456 fix: fix bug
# [HuangCheng] #N/A docs: update readme

# 3. 匹配到第一个有效卡号: PP-456
# 4. 本次提交使用卡号: PP-456
```

**注意：**
- 只匹配格式为 `#PP-123` 或 `#1234` 的卡号
- `#N/A` 不被视为有效卡号，会继续搜索下一条
- 如果用户明确提供了卡号，则跳过自动推断


## 例外情况

以下 commit message 也会被允许：
- 以 `Merge branch` 开头的 merge 提交
- 以 `Revert` 开头的回滚提交

详细规范参考：#[[file:docs/git-commit-convention.md]]
