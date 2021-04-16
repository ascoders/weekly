# 1. 引言

[syntax-parser](https://github.com/ascoders/syntax-parser) 是一个 JS 版语法解析器生成器，具有分词、语法树解析的能力。

通过两个例子介绍它的功能。

第一个例子是创建一个词法解析器 `myLexer`：

```typescript
import { createLexer } from "syntax-parser";

const myLexer = createLexer([
  {
    type: "whitespace",
    regexes: [/^(\s+)/],
    ignore: true
  },
  {
    type: "word",
    regexes: [/^([a-zA-Z0-9]+)/]
  },
  {
    type: "operator",
    regexes: [/^(\+)/]
  }
]);
```

如上，通过正则分别匹配了 “空格”、“字母或数字”、“加号”，并将匹配到的空格忽略（不输出）。

> 分词匹配是从左到右的，优先匹配数组的第一项，依此类推。

接下来使用 `myLexer`：

```typescript
const tokens = myLexer("a + b");

// tokens:
// [
//   { "type": "word", "value": "a", "position": [0, 1] },
//   { "type": "operator", "value": "+", "position": [2, 3] },
//   { "type": "word", "value": "b", "position": [4, 5] },
// ]
```

`'a + b'` 会按照上面定义的 “三种类型” 被分割为数组，数组的每一项都包含了原始值以及其位置。

第二个例子是创建一个语法解析器 `myParser`：

```typescript
import { createParser, chain, matchTokenType, many } from "syntax-parser";

const root = () => chain(addExpr)(ast => ast[0]);

const addExpr = () =>
  chain(matchTokenType("word"), many(addPlus))(ast => ({
    left: ast[0].value,
    operator: ast[1] && ast[1][0].operator,
    right: ast[1] && ast[1][0].term
  }));

const addPlus = () =>
  chain("+"), root)(ast => ({
    operator: ast[0].value,
    term: ast[1]
  }));

const myParser = createParser(
  root, // Root grammar.
  myLexer // Created in lexer example.
);
```

利用 `chain` 函数书写文法表达式：通过字面量的匹配（比如 `+` 号），以及 `matchTokenType` 来模糊匹配我们上面词法解析出的 “三种类型”，就形成了完整的文法表达式。

`syntax-parser` 还提供了其他几个有用的函数，比如 `many` `optional` 分别表示匹配多次和匹配零或一次。

接下来使用 `myParser`：

```typescript
const ast = myParser("a + b");

// ast:
// [{
//   "left": "a",
//   "operator": "+",
//   "right": {
//     "left": "b",
//     "operator": null,
//     "right": null
//   }
// }]
```

# 2. 精读

按照下面的思路大纲进行源码解读：

- 词法解析
  - 词汇与概念
  - 分词器
- 语法解析
  - 词汇与概念
  - 重新做一套 “JS 执行引擎”
  - 实现 Chain 函数
  - 引擎执行
  - 何时算执行完
  - “或” 逻辑的实现
  - many, optional, plus 的实现
  - 错误提示 & 输入推荐
  - First 集优化

## 词法解析

词法解析有点像 NLP 中分词，但比分词简单的时，词法解析的分词逻辑是明确的，一般用正则片段表达。

### 词汇与概念

- Lexer：词法解析器。
- Token：分词后的词素，包括 `value:值`、`position:位置`、`type:类型`。

### 分词器

分词器 `createLexer` 函数接收的是一个正则数组，因此思路是遍历数组，一段一段匹配字符串。

我们需要这几个函数：

```typescript
class Tokenizer {
  public tokenize(input: string) {
    // 调用 getNextToken 对输入字符串 input 进行正则匹配，匹配完后 substring 裁剪掉刚才匹配的部分，再重新匹配直到字符串裁剪完
  }

  private getNextToken(input: string) {
    // 调用 getTokenOnFirstMatch 对输入字符串 input 进行遍历正则匹配，一旦有匹配到的结果立即返回
  }

  private getTokenOnFirstMatch({
    input,
    type,
    regex
  }: {
    input: string;
    type: string;
    regex: RegExp;
  }) {
    // 对输入字符串 input 进行正则 regex 的匹配，并返回 Token 对象的基本结构
  }
}
```

`tokenize` 是入口函数，循环调用 `getNextToken` 匹配 Token 并裁剪字符串直到字符串被裁完。

## 语法解析

语法解析是基于词法解析的，输入是 Tokens，根据文法规则依次匹配 Token，当 Token 匹配完且完全符合文法规范后，语法树就出来了。

词法解析器生成器就是 “生成词法解析器的工具”，只要输入规定的文法描述，内部引擎会自动做掉其余的事。

这个生成器的难点在于，匹配 “或” 逻辑失败时，调用栈需要恢复到失败前的位置，而 JS 引擎中调用栈不受代码控制，因此代码需要在模拟引擎中执行。

### 词汇与概念

- Parser：语法解析器。
- ChainNode：连续匹配，执行链四节点之一。
- TreeNode：匹配其一，执行链四节点之一。
- FunctionNode：函数节点，执行链四节点之一。
- MatchNode：匹配字面量或某一类型的 Token，执行链四节点之一。每一次正确的 Match 匹配都会消耗一个 Token。

### 重新做一套 “JS 执行引擎”

为什么要重新做一套 JS 执行引擎？看下面的代码：

```typescript
const main = () =>
  chain(functionA(), tree(functionB1(), functionB2()), functionC());

const functionA = () => chain("a");
const functionB1 = () => chain("b", "x");
const functionB2 = () => chain("b", "y");
const functionC = () => chain("c");
```

假设 `chain('a')` 可以匹配 Token `a`，而 `chain(functionC))` 可以匹配到 Token `c`。

当输入为 `a b y c` 时，我们该怎么写 `tree` 函数呢？

我们期望匹配到 `functionB1` 时失败，再尝试 `functionB2`，直到有一个成功为止。

那么 `tree` 函数可能是这样的：

```typescript
function tree(...funs) {
  // ... 存储当前 tokens
  for (const fun of funs) {
    // ... 复位当前 tokens
    const result = fun();
    if (result === true) {
      return result;
    }
  }
}
```

不断尝试 `tree` 中内容，直到能正确匹配结果后返回这个结果。由于正确的匹配会消耗 Token，因此需要在执行前后存储当前 Tokens 内容，在执行失败时恢复 Token 并尝试新的执行链路。

**这样看去很容易，不是吗？**

然而，下面这个例子会打破这个美好的假设，让我们稍稍换几个值吧：

```typescript
const main = () =>
  chain(functionA(), tree(functionB1(), functionB2()), functionC());

const functionA = () => chain("a");
const functionB1 = () => chain("b", "y");
const functionB2 = () => chain("b");
const functionC = () => chain("y", "c");
```

输入仍然是 `a b y c`，看看会发生什么？

线路 `functionA -> functionB1` 是 `a b y` 很显然匹配会通过，但连上 `functionC` 后结果就是 `a b y y c`，显然不符合输入。

此时正确的线路应该是 `functionA -> functionB2 -> functionC`，结果才是 `a b y c`！

我们看 `functionA -> functionB1 -> functionC` 链路，当执行到 `functionC` 时才发现匹配错了，此时想要回到 `functionB2` 门也没有！因为 `tree(functionB1(), functionB2())` 的执行堆栈已退出，再也找不回来了。

**所以需要模拟一个执行引擎，在遇到分叉路口时，将 `functionB2` 保存下来，随时可以回到这个节点重新执行。**

### 实现 Chain 函数

用链表设计 `Chain` 函数是最佳的选择，我们要模拟 JS 调用栈了。

```typescript
const main = () => chain(functionA, [functionB1, functionB2], functionC)();

const functionA = () => chain("a")();
const functionB1 = () => chain("b", "y")();
const functionB2 = () => chain("b")();
const functionC = () => chain("y", "c")();
```

上面的例子只改动了一小点，那就是函数不会立即执行。

`chain` 将函数转化为 `FunctionNode`，将字面量 `a` 或 `b` 转化为 `MatchNode`，将 `[]` 转化为 `TreeNode`，将自己转化为 `ChainNode`。

我们就得到了如下的链表：

```plain
ChainNode(main)
    └── FunctionNode(functionA) ─ TreeNode ─ FunctionNode(functionC)
                                      │── FunctionNode(functionB1)
                                      └── FunctionNode(functionB2)
```

> 至于为什么 `FunctionNode` 不直接展开成 `MatchNode`，请思考这样的描述：`const list = () => chain(',', list)`。直接展开则陷入递归死循环，实际上 Tokens 数量总有限，用到再展开总能匹配尽 Token，而不会无限展开下去。

那么需要一个函数，将 `chain` 函数接收的不同参数转化为对应 Node 节点：

```typescript
const createNodeByElement = (
  element: IElement,
  parentNode: ParentNode,
  parentIndex: number,
  parser: Parser
): Node => {
  if (element instanceof Array) {
    // ... return TreeNode
  } else if (typeof element === "string") {
    // ... return MatchNode
  } else if (typeof element === "boolean") {
    // ... true 表示一定匹配成功，false 表示一定匹配失败，均不消耗 Token
  } else if (typeof element === "function") {
    // ... return FunctionNode
  }
};
```

[`createNodeByElement` 函数源码](https://github.com/ascoders/syntax-parser/blob/ab6b628bef418999900670919e38c2be57e7a0c4/src/parser/chain.ts#L28)

### 引擎执行

引擎执行其实就是访问链表，通过 `visit` 函数是最佳手段。

```typescript
const visit = tailCallOptimize(
  ({
    node,
    store,
    visiterOption,
    childIndex
  }: {
    node: Node;
    store: VisiterStore;
    visiterOption: VisiterOption;
    childIndex: number;
  }) => {
    if (node instanceof ChainNode) {
      // 调用 `visitChildNode` 访问子节点
    } else if (node instanceof TreeNode) {
      // 调用 `visitChildNode` 访问子节点
      visitChildNode({ node, store, visiterOption, childIndex });
    } else if (node instanceof MatchNode) {
      // 与当前 Token 进行匹配，匹配成功则调用 `visitNextNodeFromParent` 访问父级 Node 的下一个节点，匹配失败则调用 `tryChances`，这会在 “或” 逻辑里说明。
    } else if (node instanceof FunctionNode) {
      // 执行函数节点，并替换掉当前节点，重新 `visit` 一遍
    }
  }
);
```

> 由于 `visit` 函数执行次数至多可能几百万次，因此使用 `tailCallOptimize` 进行尾递归优化，防止内存或堆栈溢出。

`visit` 函数只负责访问节点本身，而 `visitChildNode` 函数负责访问节点的子节点（如果有），而 `visitNextNodeFromParent` 函数负责在没有子节点时，找到父级节点的下一个子节点访问。

```typescript
function visitChildNode({
  node,
  store,
  visiterOption,
  childIndex
}: {
  node: ParentNode;
  store: VisiterStore;
  visiterOption: VisiterOption;
  childIndex: number;
}) {
  if (node instanceof ChainNode) {
    const child = node.childs[childIndex];
    if (child) {
      // 调用 `visit` 函数访问子节点 `child`
    } else {
      // 如果没有子节点，就调用 `visitNextNodeFromParent` 往上找了
    }
  } else {
    // 对于 TreeNode，如果不是访问到了最后一个节点，则添加一次 “存档”
    // 调用 `addChances`
    // 同时如果有子元素，`visit` 这个子元素
  }
}

const visitNextNodeFromParent = tailCallOptimize(
  (
    node: Node,
    store: VisiterStore,
    visiterOption: VisiterOption,
    astValue: any
  ) => {
    if (!node.parentNode) {
      // 找父节点的函数没有父级时，下面再介绍，记住这个位置叫 END 位。
    }

    if (node.parentNode instanceof ChainNode) {
      // A       B <- next node      C
      // └── node <- current node
      // 正如图所示，找到 nextNode 节点调用 `visit`
    } else if (node.parentNode instanceof TreeNode) {
      // TreeNode 节点直接利用 `visitNextNodeFromParent` 跳过。因为同一时间 TreeNode 节点只有一个分支生效，所以它没有子元素了
    }
  }
);
```

可以看到 `visitChildNode` 与 `visitNextNodeFromParent` 函数都只处理好了自己的事情，而将其他工作交给别的函数完成，这样函数间职责分明，代码也更易懂。

有了 `vist` `visitChildNode` 与 `visitNextNodeFromParent`，就完成了节点的访问、子节点的访问、以及当没有子节点时，追溯到上层节点的访问。

[`visit` 函数源码](https://github.com/ascoders/syntax-parser/blob/ab6b628bef418999900670919e38c2be57e7a0c4/src/parser/chain.ts#L376)

### 何时算执行完

当 `visitNextNodeFromParent` 函数访问到 `END 位` 时，是时候做一个了结了：

- 当 Tokens 正好消耗完，完美匹配成功。
- Tokens 没消耗完，匹配失败。
- 还有一种失败情况，是 `Chance` 用光时，结合下面的 “或” 逻辑一起说。

### “或” 逻辑的实现

“或” 逻辑是重构 JS 引擎的原因，现在这个问题被很好解决掉了。

```typescript
const main = () => chain(functionA, [functionB1, functionB2], functionC)();
```

比如上面的代码，当遇到 `[]` 数组结构时，被认为是 “或” 逻辑，子元素存储在 `TreeNode` 节点中。

在 `visitChildNode` 函数中，与 `ChainNode` 不同之处在于，访问 `TreeNode` 子节点时，还会调用 `addChances` 方法，为下一个子元素存储执行状态，以便未来恢复到这个节点继续执行。

`addChances` 维护了一个池子，调用是先进后出：

```typescript
function addChances(/* ... */) {
  const chance = {
    node,
    tokenIndex,
    childIndex
  };

  store.restChances.push(chance);
}
```

与 `addChance` 相对的就是 `tryChance`。

下面两种情况会调用 `tryChances`：

- `MatchNode` 匹配失败。节点匹配失败是最常见的失败情况，但如果 `chances` 池还有存档，就可以恢复过去继续尝试。
- 没有下一个节点了，但 Tokens 还没消耗完，也说明匹配失败了，此时调用 `tryChances` 继续尝试。

我们看看神奇的存档回复函数 `tryChances` 是如何做的：

```typescript
function tryChances(
  node: Node,
  store: VisiterStore,
  visiterOption: VisiterOption
) {
  if (store.restChances.length === 0) {
    // 直接失败
  }

  const nextChance = store.restChances.pop();

  // reset scanner index
  store.scanner.setIndex(nextChance.tokenIndex);

  visit({
    node: nextChance.node,
    store,
    visiterOption,
    childIndex: nextChance.childIndex
  });
}
```

`tryChances` 其实很简单，除了没有 `chances` 就失败外，找到最近的一个 `chance` 节点，恢复 Token 指针位置并 `visit` 这个节点就等价于读档。

[`addChance` 源码](https://github.com/ascoders/syntax-parser/blob/ab6b628bef418999900670919e38c2be57e7a0c4/src/parser/chain.ts#L517)

[`tryChances` 源码](https://github.com/ascoders/syntax-parser/blob/ab6b628bef418999900670919e38c2be57e7a0c4/src/parser/chain.ts#L517)

### many, optional, plus 的实现

这三个方法实现的也很精妙。

先看可选函数 `optional`:

```typescript
export const optional = (...elements: IElements) => {
  return chain([chain(...elements)(/**/)), true])(/**/);
};
```

可以看到，可选参数实际上就是一个 `TreeNode`，也就是：

```typescript
chain(optional("a"))();
// 等价于
chain(["a", true])();
```

为什么呢？因为当 `'a'` 匹配失败后，`true` 是一个不消耗 Token 一定成功的匹配，整体来看就是 “可选” 的意思。

> 进一步解释下，如果 `'a'` 没有匹配上，则 `true` 一定能匹配上，匹配 `true` 等于什么都没匹配，就等同于这个表达式不存在。

再看匹配一或多个的函数 `plus`：

```typescript
export const plus = (...elements: IElements) => {
  const plusFunction = () =>
    chain(chain(...elements)(/**/), optional(plusFunction))(/**/);
  return plusFunction;
};
```

能看出来吗？`plus` 函数等价于一个新递归函数。也就是：

```typescript
const aPlus = () => chain(plus("a"))();
// 等价于
const aPlus = () => chain(plusFunc)();
const plusFunc = () => chain("a", optional(plusFunc))();
```

通过不断递归自身的方式匹配到尽可能多的元素，而每一层的 `optional` 保证了任意一层匹配失败后可以及时跳到下一个文法，不会失败。

最后看匹配多个的函数 `many`：

```typescript
export const many = (...elements: IElements) => {
  return optional(plus(...elements));
};
```

`many` 就是 `optional` 的 `plus`，不是吗？

这三个神奇的函数都利用了已有功能实现，建议每个函数留一分钟左右时间思考为什么。

[`optional` `plus` `many` 函数源码](https://github.com/ascoders/syntax-parser/blob/ab6b628bef/src/parser/match.ts#L111-L140)

### 错误提示 & 输入推荐

错误提示与输入推荐类似，都是给出错误位置或光标位置后期待的输入。

输入推荐，就是给定字符串与光标位置，给出光标后期待内容的功能。

首先通过光标位置找到光标的 **上一个 `Token`**，再通过 `findNextMatchNodes` 找到这个 `Token` 后所有可能匹配到的 `MatchNode`，这就是推荐结果。

那么如何实现 `findNextMatchNodes` 呢？看下面：

```typescript
function findNextMatchNodes(node: Node, parser: Parser): MatchNode[] {
  const nextMatchNodes: MatchNode[] = [];

  let passCurrentNode = false;

  const visiterOption: VisiterOption = {
    onMatchNode: (matchNode, store, currentVisiterOption) => {
      if (matchNode === node && passCurrentNode === false) {
        passCurrentNode = true;
        // 调用 visitNextNodeFromParent，忽略自身
      } else {
        // 遍历到的 MatchNode
        nextMatchNodes.push(matchNode);
      }

      // 这个是画龙点睛的一笔，所有推荐都当作匹配失败，通过 tryChances 可以找到所有可能的 MatchNode
      tryChances(matchNode, store, currentVisiterOption);
    }
  };

  newVisit({ node, scanner: new Scanner([]), visiterOption, parser });

  return nextMatchNodes;
}
```

所谓找到后续节点，就是通过 `Visit` 找到所有的 `MatchNode`，而 `MatchNode` 只要匹配一次即可，因为我们只要找到第一层级的 `MatchNode`。

通过每次匹配后执行 `tryChances`，就可以找到所有 `MatchNode` 节点了！

再看错误提示，我们要记录最后出错的位置，再采用输入推荐即可。

但光标所在的位置是期望输入点，这个输入点也应该参与语法树的生成，而错误提示不包含光标，所以我们要 [执行两次 `visit`](https://github.com/ascoders/syntax-parser/blob/ab6b628bef/src/parser/chain.ts#L188-L241)。

举个例子：

```sql
select | from b;
```

`|` 是光标位置，此时语句内容是 `select from b;` 显然是错误的，但光标位置应该给出提示，给出提示就需要正确解析语法树，所以对于提示功能，我们需要将光标位置考虑进去一起解析。因此一共有两次解析。

[`findNextMatchNodes` 函数源码](https://github.com/ascoders/syntax-parser/blob/ab6b628bef/src/parser/chain.ts#L574)

### First 集优化

构建 First 集是个自下而上的过程，当访问到 `MatchNode` 节点时，其值就是其父节点的一个 First 值，当父节点的 First 集收集完毕后，，就会触发它的父节点 First 集收集判断，如此递归，最后完成 First 集收集的是最顶级节点。

篇幅原因，不再赘述，可以看 [这张图](https://github.com/dt-fe/weekly/blob/master/78.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E6%80%A7%E8%83%BD%E4%BC%98%E5%8C%96%E4%B9%8B%E7%BC%93%E5%AD%98%E3%80%8B.md#%E6%9E%84%E5%BB%BA-first-%E9%9B%86)。

[`generateFirstSet` 函数源码](https://github.com/ascoders/syntax-parser/blob/ab6b628bef418999900670919e38c2be57e7a0c4/src/parser/chain.ts#L621)

# 3. 总结

这篇文章是对 《手写 SQL 编译器》 系列的总结，从源码角度的总结！

该系列的每篇文章都以图文的方式介绍了各技术细节，可以作为补充阅读：

- [精读《手写 SQL 编译器 - 词法分析》](https://github.com/dt-fe/weekly/blob/master/64.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E8%AF%8D%E6%B3%95%E5%88%86%E6%9E%90%E3%80%8B.md)
- [精读《手写 SQL 编译器 - 文法介绍》](https://github.com/dt-fe/weekly/blob/master/65.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E6%96%87%E6%B3%95%E4%BB%8B%E7%BB%8D%E3%80%8B.md)
- [精读《手写 SQL 编译器 - 语法分析》](https://github.com/dt-fe/weekly/blob/master/66.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E8%AF%AD%E6%B3%95%E5%88%86%E6%9E%90%E3%80%8B.md)
- [精读《手写 SQL 编译器 - 回溯》](https://github.com/dt-fe/weekly/blob/master/67.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E5%9B%9E%E6%BA%AF%E3%80%8B.md)
- [精读《手写 SQL 编译器 - 语法树》](https://github.com/dt-fe/weekly/blob/master/70.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E8%AF%AD%E6%B3%95%E6%A0%91%E3%80%8B.md)
- [精读《手写 SQL 编译器 - 错误提示》](https://github.com/dt-fe/weekly/blob/master/71.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E9%94%99%E8%AF%AF%E6%8F%90%E7%A4%BA%E3%80%8B.md)
- [精读《手写 SQL 编译器 - 性能优化之缓存》](https://github.com/dt-fe/weekly/blob/master/78.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E6%80%A7%E8%83%BD%E4%BC%98%E5%8C%96%E4%B9%8B%E7%BC%93%E5%AD%98%E3%80%8B.md)
- [精读《手写 SQL 编译器 - 智能提示》](https://github.com/dt-fe/weekly/blob/master/85.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E6%99%BA%E8%83%BD%E6%8F%90%E7%A4%BA%E3%80%8B.md)

> 讨论地址是：[精读《syntax-parser 源码》 · Issue #133 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/133)

**如果你想参与讨论，请[点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**
