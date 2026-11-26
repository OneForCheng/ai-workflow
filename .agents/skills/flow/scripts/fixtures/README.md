# fixtures — checker 自测样本

每个子目录是一个独立样本：

```
<sample>/
  docs/      最小的五目录文档体系（只放触发该检查所需的文件）
  expect     期望：`exit: 0|1`；可选 `flags: trace|gates|map|state|signals|detail|brief|strict`；其余每行一个应在输出中出现的片段；行首 `!` 表示断言「不出现」；`{docsDir}` 替换为该样本 docs 目录的绝对路径
```

- 新增样本后运行 `node ../../flow-check.mjs --fixtures`，全绿才算通过
- 样本只读，checker 不会修改它们
- 修改 checker 的任一检查项，都应能在这里找到对应样本；没有就补一个
