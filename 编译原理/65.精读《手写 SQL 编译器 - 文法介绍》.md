## 1 引言

文法用来描述语言的语法规则，所以不仅可以用在编程语言上，也可用在汉语、英语上。

## 2 精读

我们将一块语法规则称为 **产生式**，使用 “Left → Right” 表示任意产生式，用 “Left => Right” 表示产生式的推导过程，比如对于产生式：

```plain
E → i
E → E + E
```

我们进行推导时，可以这样表示：E => E + E => i + E => i + i + E => i + i + i

> 也有使用 Left : Right 表示产生式的例子，比如 ANTLR。[BNF](https://zh.wikipedia.org/wiki/%E5%B7%B4%E7%A7%91%E6%96%AF%E8%8C%83%E5%BC%8F) 范式通过 Left ::= Right 表示产生式。

举个例子，比如 `SELECT * FROM table` 可以被表达为：

```plain
S → SELECT * FROM table
```

当然这是最固定的语法，真实场景中，`*` 可能被替换为其他单词，而 `table` 不但可能有其他名字，还可能是个子表达式。

> 一般用大写的 S 表示文法的开头，称为开始符号。

### 终结符与非终结符

> 下面为了方便书写，使用 BNF 范式表示文法。

终结符就是语句的终结，读到它表示产生式分析结束，相反，非终结符就是一个新产生式的开始，比如：

```plain
<selectStatement> ::= SELECT <selectList> FROM <tableName>

<selectList> ::= <selectField> [ , <selectList> ]

<tableName> ::= <tableName> [ , <tableList> ]
```

所有 `::=` 号左边的都是非终结符，所以 `selectList` 是非终结符，解析 `selectStatement` 时遇到了 `selectList` 将会进入 `selectList` 产生式，而解析到普通 `SELECT` 单词就不会继续解析。

对于有二义性的文法，可以通过 **上下文相关文法** 方式描述，也就是在产生式左侧补全条件，解决二义性：

```plain
aBc -> a1c | a2c
dBe -> d3e
```

> 一般产生式左侧都是非终结符，大写字母是非终结符，小写字母是终结符。

上面表示，非终结符 `B` 在 `ac` 之间时，可以解析为 `1` 或 `2`，而在 `de` 之间时，解析为 `3`。但我们可以增加一个非终结符让产生式可读性更好：

```plain
B -> 1 | 2
C -> 3
```

这样就将上下文相关文法转换为了上下文无关文法。

### 上下文无关文法

根据是否依赖上下文，文法分为 **上下文相关文法** 与 **上下文无关文法**，一般来说 **上下文相关文法** 都可以转换为一堆 **上下文无关文法** 来处理，而用程序处理 **上下文无关文法** 相对轻松。

SQL 的文法就是上下文相关文法，在正式介绍 SQL 文法之前，举一个简单的例子，比如我们描述等号（=）的文法：

```sql
SELECT
  CASE
    WHEN bee = 'red' THEN 'ANGRY'
    ELSE 'NEUTRAL'
  END AS BeeState
FROM bees;

SELECT * from bees WHERE bee = 'red';
```

上面两个 SQL 中，等号前后的关键字取决于当前是在 `CASE WHEN` 语句里，还是在 `WHERE` 语句里，所以我们认为等号所在位置的文法是上下文相关的。

但是当我们将文法粒度变细，将 `CASE WHEN` 与 `WHERE` 区块分别交由两块文法解决，将等号这个通用的表达式抽离出来，就可以不关心上下文了，这种方式称为 **上下文无关文法**。

附上一个 [mysql 上下文无关文法集合](https://github.com/antlr/grammars-v4/blob/master/sql/mysql/Positive-Technologies/MySqlParser.g4)。

### 左推导与右推导

上面提到的推导符号 `=>` 在实际运行过程中，显然有两种方向左和右：

```plain
E + E => ?
```

从最左边的 E 开始分析，称为左推导，对语法解析来说是自顶向下的方式，常用方法是递归下降。

从最右边的 E 开始分析，称为右推导，对语法解析来说是自底向上的方式，常用方法是移进、规约。

右推导过程比左推导过程复杂，所以如果考虑手写，最好使用左推导的方式。

### 左推导的分支预测

比如 `select <selectList>` 的 `selectList` 产生式，它可以表示为：

```plain
<SelectList> ::= <SelectList> , <SelectField>
               | <SelectField>
```

由于它可以展开：SelectList => SelectList , a => SelectList , b, a => c, b, a。

但程序执行时，读到这里会进入死循环，因为 SelectList 可以被无限展开，这就是左递归问题。

### 消除左递归

消除左递归一般通过转化为右递归的方式，因为左递归完全不消耗 Token，而右递归可以通过消耗 Token 的方式跳出死循环。

> Token 见上一期精读 [精读《手写 SQL 编译器 - 词法分析》](https://github.com/dt-fe/weekly/blob/master/64.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E8%AF%8D%E6%B3%95%E5%88%86%E6%9E%90%E3%80%8B.md)

```plain
<SelectList> ::= <SelectField> <G>

<G> ::= , <SelectList>
      | null
```

这其实是一个通用处理，可以抽象出来：

```plain
E → E + F
E → F
```

```plain
E → FG
G → + FG
G → null
```

不过我们也不难发现，通过通用方式消除左递归后的文法更难以阅读，这是因为用死循环的方式解释问题更容易让人理解，但会导致机器崩溃。

笔者建议此处不要生硬的套公式，在套了公式后，再对产生式做一些修饰，让其更具有语义：

```plain
<SelectList> ::= <SelectField>
               | , <SelectList>
```

### 提取左公因式

即便是上下文无关的文法，通过递归下降方式，许多时候也必须从左向右超前查看 K 个字符才能确定使用哪个产生式，这种文法称为 LL(k)。

但如果每次超前查看的内容都有许多字符相同，会导致第二次开始的超前查看重复解析字符串，影响性能。最理想的情况是，每次超前查看都不会对已确定的字符重复查看，解决方法是提取左公因式。

设想如下的 sql 文法：

```plain
<Field> ::= <Text> as <Text>
          | <Text> as<String>
          | <Text> <Text>
          | <Text>
```

其实 Text 本身也是比较复杂的产生式，最坏的情况需要对 Text 连续匹配六遍。我们将 Text 公因式提取出来就可以仅匹配一遍，因为无论是何种 Field 产生式，都必定先遇到 Text：

```plain
<Field> ::= <Text> <F>

<F> ::= <G>
      | <Text>

<G> ::= as <H>

<H> ::= <space> <Text>
      | <String>
```

和消除左递归一样，提取左公因式也会降低文法的可读性，需要进行人为修复。不过提取左公因式的修复没办法在文法中处理，在后面的 “函数式” 处理环节是有办法处理的，敬请期待。

### 结合优先级

对 SQL 的文法来说不存在优先级的概念，所以从某种程度来说，SQL 的语法复杂度还不如基本的加减乘除。

## 3 总结

在实现语法解析前，需要使用文法描述 SQL 的语法，文法描述就是语法分析的主干业务代码。

下一篇将介绍语法分析相关知识，帮助你一步步打造自己的 SQL 编译器。

## 4 更多讨论

> 讨论地址是：[精读《手写 SQL 编译器 - 文法介绍》 · Issue #94 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/94)

**如果你想参与讨论，请[点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。**
