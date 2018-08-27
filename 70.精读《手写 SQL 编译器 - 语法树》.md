## 1 引言

重回 “手写 SQL 编辑器” 系列。之前几期介绍了 词法、文法、语法的解析，以及回溯功能的实现，这次介绍如何生成语法树。

基于 [《回溯》](https://github.com/dt-fe/weekly/blob/master/67.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E5%9B%9E%E6%BA%AF%E3%80%8B.md) 一文介绍的思路，我们利用 JS 实现一个微型 SQL 解析器，并介绍如何生成语法树，如何在 JS SQL 引擎实现语法树生成功能！

解析目标是：

```sql
select name, version from my_table;
```

文法：

```typescript
const root = () => chain(selectStatement, many(";", selectStatement));

const selectStatement = () => chain("select", selectList, fromClause);

const selectList = () => chain(matchWord, many(",", matchWord));

const fromClause = () => chain("from", matchWord);

const statement = () =>
  chain(
    "select",
    selectList,
    "from",
    chain(tableName, [whereStatement, limitStatement])
  );
```

> 这是本文为了方便说明，实现的一个精简版本。完整版见我们的开源仓库 [cparser](https://github.com/dt-fe/cparser)。

`root` 是入口函数，`many()` 包裹的文法可以执行任意次，所以

```typescript
chain(selectStatement, many(";", selectStatement));
```

表示允许任意长度的 `selectStatement` 由 `;` 号连接，`selectList` 的写法也同理。

`matchWord` 表示匹配任意单词。

语法树是人为对语法结构的抽象，本质上，如果我们到此为止，是可以生成一个 **基本语法树** 的，这个语法树是多维数组，比如：

```typescript
const fromClause = () => chain("from", matchWord);
```

这个文法生成的默认语法树是：`['from', 'my_table']`，只不过 `from` `my_table` 具体是何含义，只有当前文法知道（第一个标志无含义，第二个标志表示表名）。

`fromClause` 返回的语法树作为结果被传递到文法 `selectStatement` 中，其结果可能是：`['select', [['name', 'version']], ['from', 'my_table']]`。

大家不难看出问题：**当默认语法树聚集在一起，就无法脱离文法结构单独理解语法含义了**，为了脱离文法结构理解语法树，我们需要将其抽象为一个有规可循的结构。

## 2 精读

通过上面的分析，我们需要对 `chain` 函数提供修改局部 AST 结构的能力：

```typescript
const selectStatement = () =>
  chain("select", selectList, fromClause)(ast => ({
    type: "statement",
    variant: "select",
    result: ast[1],
    from: ast[2]
  }));
```

我们可以通过额外参数对默认语法树进行改造，将多维数组结构改变为对象结构，并增加 `type` `variant` 属性标示当前对象的类型、子类型。比如上面的例子，返回的对象告诉使用者：“我是一个表达式，一个 select 表达式，我的结果是 result，我的来源表是 from”。

那么，`chain` 函数如何实现语法树功能呢？

对于每个文法（每个 `chain` 函数），其语法树必须等待所有子元素执行完，才能生成。所以这是个深度优先的运行过程。

下图描述了 `chain` 函数执行机制：

![](https://img.alicdn.com/tfs/TB1lFZEsOMnBKNjSZFCXXX0KFXa-1300-1126.png)

> 生成结构中有四个基本结构，分别是 Chain、Tree、Function、Match，足以表达语法解析需要的所有逻辑。（不包含 可选、多选 逻辑）。

每个元素的子节点全部执行完毕，才会生成当前节点的语法树。实际上，每个节点执行完，都会调用 `callParentNode` 访问父节点，执行到了这个函数，说明子元素已成功执行完毕，补全对应节点的 AST 信息即可。

对于修改局部 AST 结构函数，需等待整个 `ChainNode` 执行完毕才调用，并将返回的新 AST 信息存储下来，作为这个节点的最终 AST 信息并传递给父级（或者没有父级，这就是根结点的 AST 结果）。

## 3 总结

本文介绍了如何生成语法树，并说明了 **默认语法树** 的存在，以及我们之所以要一个定制的语法树，是为了更方便的理解含义。

同时介绍了如何通过 JS 运行一套完整的语法解析器，以及如何提供自定义 AST 结构的能力。

本文介绍的模型，只是为了便于理解而定制的简化版，了解全部细节，请访问 [cparser](https://github.com/dt-fe/cparser)。

最后说一下为何要做这个语法解析器。如今有许多开源的 AST 解析工具，但笔者要解决的场景是语法自动提示，需要在语句不完整，甚至错误的情况，给出当前光标位置的所有可能输入。所以通过完整重写语法解析器内核，在解析的同时，生成语法树的同时，也给出光标位置下一个可能输入提示，在通用错误场景自动从错误中恢复。

目前在做性能优化，通用 SQL 文法还在陆续完善中，目前仅可当学习参考，不要用于生产环境。

## 4 更多讨论

> 讨论地址是：[精读《手写 SQL 编译器 - 语法树》 · Issue #99 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/99)

**如果你想参与讨论，请[点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。**
