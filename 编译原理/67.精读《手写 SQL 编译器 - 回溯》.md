## 1 引言

上回 [精读《手写 SQL 编译器 - 语法分析》](https://github.com/dt-fe/weekly/blob/master/66.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E8%AF%AD%E6%B3%95%E5%88%86%E6%9E%90%E3%80%8B.md) 说到了如何利用 Js 函数实现语法分析时，留下了一个回溯问题，也就是存档、读档问题。

我们把语法分析树当作一个迷宫，有直线有岔路，而想要走出迷宫，在遇到岔路时需要提前进行存档，在后面走错时读档换下一个岔路进行尝试，这个功能就叫回溯。

上一篇我们实现了 **分支函数**，在分支执行失败后回滚 TokenIndex 位置并重试，但在函数调用栈中，如果其子函数执行完毕，堆栈跳出，我们便无法找到原来的函数栈重新执行。

为了更加详细的描述这个问题，举一个例子，存在以下岔路：

```plain
a -> tree() -> c
     -> b1 -> b1'
     -> b2 -> b2'
```

上面描述了两条判断分支，分别是 `a -> b1 -> b1' -> c` 与 `a -> b2 -> b2' -> c`，当岔路 `b1` 执行失败后，分支函数 `tree` 可以复原到 `b2` 位置尝试重新执行。

但设想 `b1 -> b1'` 通过，但 `b1 -> b1' -> c` 不通过的场景，由于 `b1'` 执行完后，分支函数 `tree` 的调用栈已经退出，无法再尝试路线 `b2 -> b2'` 了。

要解决这个问题，我们要 **通过链表手动构造函数执行过程**，这样不仅可以实现任意位置回溯，还可以解决左递归问题，因为函数并不是立即执行的，在执行前我们可以加一些 Magic 动作，比如调换执行顺序！这文章主要介绍如何通过链表构造函数调用栈，并实现回溯。

## 2 精读

假设我们拥有了这样一个函数 `chain`，可以用更简单的方式表示连续匹配：

```typescript
const root = (tokens: IToken[], tokenIndex: number) => match('a', tokens, tokenIndex) && match('b', tokens, tokenIndex) && match('c', tokens, tokenIndex)
↓ ↓ ↓ ↓ ↓ ↓
const root = (chain: IChain) => chain('a', 'b', 'c')
```

遇到分支条件时，通过数组表示取代 `tree` 函数：

```typescript
const root = (tokens: IToken[], tokenIndex: number) => tree(
  line(match('a', tokens, tokenIndex) && match('b', tokens, tokenIndex)),
  line(match('c', tokens, tokenIndex) && match('d', tokens, tokenIndex))
)
↓ ↓ ↓ ↓ ↓ ↓
const root = (chain: IChain) => chain([
  chain('a', 'b'),
  chain('c', 'd')
])
```

这个 `chain` 函数有两个特质：

1.  非立即执行，我们就可以 **预先生成执行链条** ，并对链条结构进行优化、甚至控制执行顺序，实现回溯功能。
2.  无需显示传递 Token，减少每一步匹配写的代码量。

### 封装 scanner、matchToken

我们可以制作 scanner 函数封装对 token 的操作：

```typescript
const query = "select * from table;";
const tokens = new Lexer(query);
const scanner = new Scanner(tokens);
```

scanner 拥有两个主要功能，分别是 `read` 读取当前 token 内容，和 `next` 将 token 向下移动一位，我们可以根据这个功能封装新的 `matchToken` 函数：

```typescript
function matchToken(
  scanner: Scanner,
  compare: (token: IToken) => boolean
): IMatch {
  const token = scanner.read();
  if (!token) {
    return false;
  }
  if (compare(token)) {
    scanner.next();
    return true;
  } else {
    return false;
  }
}
```

如果 token 消耗完，或者与比对不匹配时，返回 false 且不消耗 token，当匹配时，消耗一个 token 并返回 true。

现在我们就可以用 `matchToken` 函数写一段匹配代码了：

```typescript
const query = "select * from table;";
const tokens = new Lexer(query);
const scanner = new Scanner(tokens);
const root =
  matchToken(scanner, token => token.value === "select") &&
  matchToken(scanner, token => token.value === "*") &&
  matchToken(scanner, token => token.value === "from") &&
  matchToken(scanner, token => token.value === "table") &&
  matchToken(scanner, token => token.value === ";");
```

我们最终希望表达成这样的结构：

```typescript
const root = (chain: IChain) => chain("select", "*", "from", "table", ";");
```

既然 chain 函数作为线索贯穿整个流程，那 scanner 函数需要被包含在 chain 函数的闭包里内部传递，所以我们需要构造出第一个 chain。

### 封装 createChainNodeFactory

我们需要 createChainNodeFactory 函数将 scanner 传进去，在内部偷偷存起来，不要在外部代码显示传递，而且 chain 函数是一个高阶函数，不会立即执行，由此可以封装二阶函数：

```typescript
const createChainNodeFactory = (scanner: Scanner, parentNode?: ChainNode) => (
  ...elements: any[]
): ChainNode => {
  // 生成第一个节点
  return firstNode;
};
```

需要说明两点：

1. chain 函数返回第一个链表节点，就可以通过 visiter 函数访问整条链表了。
2. `(...elements: any[]): ChainNode` 就是 chain 函数本身，它接收一系列参数，根据类型进行功能分类。

有了 createChainNodeFactory，我们就可以生成执行入口了：

```typescript
const chainNodeFactory = createChainNodeFactory(scanner);
const firstNode = chainNodeFactory(root); // const root = (chain: IChain) => chain('select', '*', 'from', 'table', ';')
```

为了支持 `chain('select', '*', 'from', 'table', ';')` 语法，我们需要在参数类型是文本类型时，自动生成一个 matchToken 函数作为链表节点，同时通过 reduce 函数将链表节点关联上：

```typescript
const createChainNodeFactory = (scanner: Scanner, parentNode?: ChainNode) => (
  ...elements: any[]
): ChainNode => {
  let firstNode: ChainNode = null;

  elements.reduce((prevNode: ChainNode, element) => {
    const node = new ChainNode();

    // ... Link node

    node.addChild(createChainChildByElement(node, scanner, element));

    return node;
  }, parentNode);

  return firstNode;
};
```

使用 reduce 函数对链表上下节点进行关联，这一步比较常规所以忽略掉，通过 createChainChildByElement 函数对传入函数进行分类，如果 **传入函数是字符串，就构造一个 matchToken 函数塞入当前链表的子元素**，当执行链表时，再执行 matchToken 函数。

重点是我们对链表节点的处理，先介绍一下链表结构。

### 链表结构

```typescript
class ChainNode {
  public prev: ChainNode;
  public next: ChainNode;
  public childs: ChainChild[] = [];
}

class ChainChild {
  // If type is function, when run it, will expend.
  public type: "match" | "chainNode" | "function";
  public node?: IMatchFn | ChainNode | ChainFunctionNode;
}
```

ChainNode 是对链表节点的定义，这里给出了和当前文章内容相关的部分定义。这里用到了双向链表，因此每个 node 节点都拥有 prev 与 next 属性，分别指向上一个与下一个节点，而 childs 是这个链表下挂载的节点，可以是 matchToken 函数、链表节点、或者是函数。

整个链表结构可能是这样的：

```plain
node1 <-> node2 <-> node3 <-> node4
            |- function2-1
            |- matchToken2-1
            |- node2-1 <-> node2-2 <-> node2-3
                              |- matchToken2-2-1
```

对每一个节点，都至少存在一个 child 元素，如果存在多个子元素，则表示这个节点是 tree 节点，存在分支情况。

而节点类型 `ChainChild` 也可以从定义中看到，有三种类型，我们分别说明：

#### matchToken 类型

这种类型是最基本类型，由如下代码生成：

```typescript
chain("word");
```

链表执行时，match 是最基本的执行单元，决定了语句是否能匹配，也是唯一会消耗 Token 的单元。

#### node 类型

链表节点的子节点也可能是一个节点，类比嵌套函数，由如下代码生成：

```typescript
chain(chain("word"));
```

也就是 chain 的一个元素就是 chain 本身，那这个 chain 子链表会作为父级节点的子元素，当执行到链表节点时，会进行深度优先遍历，如果执行通过，会跳到父级继续寻找下一个节点，其执行机制类比函数调用栈的进出关系。

#### 函数类型

函数类型非常特别，我们不需要递归展开所有函数类型，因为文法可能存在无限递归的情况。

好比一个迷宫，很多区域都是相同并重复的，如果将迷宫完全展开，那迷宫的大小将达到无穷大，所以在计算机执行时，我们要一步步展开这些函数，让迷宫结束取决于 Token 消耗完、走出迷宫、或者 match 不上 Token，而不是在生成迷宫时就将资源消耗完毕。函数类型节点由如下代码生成：

```typescript
chain(root);
```

所有函数类型节点都会在执行到的时候展开，在展开时如果再次遇到函数节点仍会保留，等待下次执行到时再展开。

#### 分支

普通的链路只是分支的特殊情况，如下代码是等价的：

```typescript
chain("a");
chain(["a"]);
```

再对比如下代码：

```typescript
chain(["a"]);
chain(["a", "b"]);
```

无论是直线还是分支，都可以看作是分支路线，而直线（无分支）的情况可以看作只有一条分叉的分支，对比到链表节点，对应 childs 只有一个元素的链表节点。

### 回溯

现在 chain 函数已经支持了三种子元素，一种分支表达方式：

```typescript
chain("a"); // MatchNode
chain(chain("a")); // ChainNode
chain(foo); // FunctionNode
chain(["a"]); // 分支 -> [MatchNode]
```

而上文提到了 chain 函数并不是立即执行的，所以我们在执行这些代码时，只是生成链表结构，而没有真正执行内容，内容包含在 childs 中。

我们需要构造 execChain 函数，拿到链表的第一个节点并通过 visiter 函数遍历链表节点来真正执行。

```typescript
function visiter(
  chainNode: ChainNode,
  scanner: Scanner,
  treeChances: ITreeChance[]
): boolean {
  const currentTokenIndex = scanner.getIndex();

  if (!chainNode) {
    return false;
  }

  const nodeResult = chainNode.run();

  let nestedMatch = nodeResult.match;

  if (nodeResult.match && nodeResult.nextNode) {
    nestedMatch = visiter(nodeResult.nextNode, scanner, treeChances);
  }

  if (nestedMatch) {
    if (!chainNode.isFinished) {
      // It's a new chance, because child match is true, so we can visit next node, but current node is not finished, so if finally falsely, we can go back here.
      treeChances.push({
        chainNode,
        tokenIndex: currentTokenIndex
      });
    }

    if (chainNode.next) {
      return visiter(chainNode.next, scanner, treeChances);
    } else {
      return true;
    }
  } else {
    if (chainNode.isFinished) {
      // Game over, back to root chain.
      return false;
    } else {
      // Try again
      scanner.setIndex(currentTokenIndex);
      return visiter(chainNode, scanner, treeChances);
    }
  }
}
```

上述代码中，nestedMatch 类比嵌套函数，而 treeChances 就是实现回溯的关键。

#### 当前节点执行失败时

由于每个节点都包含 N 个 child，所以任何时候执行失败，都给这个节点的 child 打标，并判断当前节点是否还有子节点可以尝试，并尝试到所有节点都失败才返回 false。

#### 当前节点执行成功时，进行位置存档

当节点成功时，为了防止后续链路执行失败，需要记录下当前执行位置，也就是利用 treeChances 保存一个存盘点。

然而我们不知道何时整个链表会遭遇失败，所以必须等待整个 visiter 执行完才知道是否执行失败，所以我们需要在每次执行结束时，判断是否还有存盘点（treeChances）：

```typescript
while (!result && treeChances.length > 0) {
  const newChance = treeChances.pop();
  scanner.setIndex(newChance.tokenIndex);
  result = judgeChainResult(
    visiter(newChance.chainNode, scanner, treeChances),
    scanner
  );
}
```

同时，我们需要对链表结构新增一个字段 tokenIndex，以备回溯还原使用，同时调用 scanner 函数的 `setIndex` 方法，将 token 位置还原。

最后如果机会用尽，则匹配失败，只要有任意一次机会，或者能一命通关，则匹配成功。

## 3 总结

本篇文章，我们利用链表重写了函数执行机制，不仅使匹配函数拥有了回溯能力，还让其表达更为直观：

```typescript
chain("a");
```

这种构造方式，本质上与根据文法结构编译成代码的方式是一样的，只是许多词法解析器利用文本解析成代码，而我们利用代码表达出了文法结构，同时自身执行后的结果就是 “编译后的代码”。

下次我们将探讨如何自动解决左递归问题，让我们能够写出这样的表达式：

```typescript
const foo = (chain: IChain) => chain(foo, bar);
```

好在 chain 函数并不是立即执行的，我们不会立即掉进堆栈溢出的漩涡，但在执行节点的过程中，会导致函数无限展开从而堆栈溢出。

解决左递归并不容易，除了手动或自动重写文法，还会有其他方案吗？欢迎留言讨论。

## 4 更多讨论

> 讨论地址是：[精读《手写 SQL 编译器 - 回溯》 · Issue #96 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/96)

**如果你想参与讨论，请[点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。**
