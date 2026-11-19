---
id: DES-db-meta
title: Liquibase 元表命名
doc_type: design
status: current
domain: db
scope: [db]
updated: 2026-01-01
---

# Liquibase 元表命名（当前事实）

| 项 | 值 |
|----|----|
| 元表 | `psh_DATABASECHANGELOG` / `psh_DATABASECHANGELOGLOCK`（`spring.liquibase.database-change-log-*` 指定） |
| 主文件 | `db/psh-db.xml` |
