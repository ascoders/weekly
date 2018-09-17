## 1 引言

前端精读[《手写 SQL 编译器系列》](https://github.com/dt-fe/weekly/blob/master/64.%E7%B2%BE%E8%AF%BB%E3%80%8A%E6%89%8B%E5%86%99%20SQL%20%E7%BC%96%E8%AF%91%E5%99%A8%20-%20%E8%AF%8D%E6%B3%95%E5%88%86%E6%9E%90%E3%80%8B.md) 介绍了如何利用 SQL 生成语法树，而还有一些库的作用是根据语法树生成 SQL 语句。

除此之外，还有一种库，是根据编程语言生成 SQL。[sqorn](https://github.com/lusakasa/sqorn) 就是一个这样的库。

可能有人会问，利用编程语言生成 SQL 有什么意义？既没有语法树规范，也不如直接写 SQL 通用。对，有利就有弊，这些库不遵循语法树，但利用简化的对象模型快速生成 SQL，使得代码抽象程度得到了提高。而代码抽象程度得到提高，第一个好处就是易读，第二个好处就是易操作。

数据库特别容易抽象为面向对象模型，而对数据库的操作语句 - SQL 是一种结构化查询语句，只能描述一段一段的查询，而面向对象模型却适合描述一个整体，将数据库多张表串联起来。

举个例子，利用 [typeorm](https://github.com/typeorm/typeorm)，我们可以用 `a` 与 `b` 两个 Class 描述两张表，同时利用 `ManyToMany` 装饰器分别修饰 `a` 与 `b` 的两个字段，将其建立起 **多对多的关联**，而这个映射到 SQL 结构是三张表，还有一张是中间表 `ab`，以及查询时涉及到的 left join 操作，而在 typeorm 中，一条 `find` 语句就能连带查询处多对多关联关系。

这就是这种利用编程语言生成 SQL 库的价值，所以本周我们分析一下 [sqorn](https://github.com/lusakasa/sqorn) 这个库的源码，看看利用对象模型生成 SQL 需要哪些步骤。

## 2 概述

我们先看一下 sqorn 的语法。

```js
const sq = require("sqorn-pg")();

const Person = sq`person`,
  Book = sq`book`;

// SELECT
const children = await Person`age < ${13}`;
// "select * from person where age < 13"

// DELETE
const [deleted] = await Book.delete({ id: 7 })`title`;
// "delete from book where id = 7 returning title"

// INSERT
await Person.insert({ firstName: "Rob" });
// "insert into person (first_name) values ('Rob')"

// UPDATE
await Person({ id: 23 }).set({ name: "Rob" });
// "update person set name = 'Rob' where id = 23"
```

首先第一行的 `sqorn-pg` 告诉我们 sqorn 按照 SQL 类型拆成不同分类的小包，这是因为不同数据库支持的方言不同，sqorn 希望在语法上抹平数据库间差异。

其次 sqorn 也是利用面向对象思维的，上面的例子通过 <code>sq\`person\`</code> 生成了 Person 实例，实际上也对应了 person 表，然后 <code>Person\`age < ${13}\`</code> 表示查询：`select * from person where age < 13`

上面是利用 ES6 模板字符串的功能实现的简化 where 查询功能，sqorn 主要还是利用一些函数完成 SQL 语句生成，比如 `where` `delete` `insert` 等等，比较典型的是下面的 Example：

```js
sq.from`book`.return`distinct author`
  .where({ genre: "Fantasy" })
  .where({ language: "French" });
// select distinct author from book
// where language = 'French' and genre = 'Fantsy'
```

所以我们阅读 sqorn 源码，探讨如何利用实现上面的功能。

## 3 精读

我们从四个方面入手，讲明白 sqorn 的源码是如何组织的，以及如何满足上面功能的。

### 方言

为了实现各种 SQL 方言，需要在实现功能之前，将代码拆分为内核代码与拓展代码。

内核代码就是 `sqorn-sql` 而拓展代码就是 `sqorn-pg`，拓展代码自身只要实现 pg 数据库自身的特殊逻辑， 加上 `sqorn-sql` 提供的核心能力，就能形成完整的 pg SQL 生成功能。

**实现数据库连接**

sqorn 不但生成 query 语句，也会参与数据库连接与运行，因此方言库的一个重要功能就是做数据库连接。sqorn 利用 `pg` 这个库实现了连接池、断开、查询、事务的功能。

**覆写接口函数**

内核代码想要具有拓展能力，暴露出一些接口让 `sqorn-xx` 覆写是很基本的。

### context

内核代码中，最重要的就是 context 属性，因为人类习惯一步一步写代码，而最终生成的 query 语句是连贯的，所以这个上下文对象通过 `updateContext` 存储了每一条信息：

```js
{
  name: 'limit',
  updateContext: (ctx, args) => {
    ctx.lim = args
  }
}

{
  name: 'where',
  updateContext: (ctx, args) => {
    ctx.whr.push(args)
  }
}
```

比如 `Person.where({ name: 'bob' })` 就会调用 `ctx.whr.push({ name: 'bob' })`，因为 where 条件是个数组，因此这里用 `push`，而 `limit` 一般仅有一个，所以 context 对 `lim` 对象的存储仅有一条。

其他操作诸如 `where` `delete` `insert` `with` `from` 都会类似转化为 `updateContext`，最终更新到 context 中。

### 创建 builder

不用太关心下面的 `sqorn-xx` 包名细节，这一节主要目的是说明如何实现 Demo 中的链式调用，至于哪个模块放在哪并不重要（如果要自己造轮子就要仔细学习一下作者的命名方式）。

在 `sqorn-core` 代码中创建了 `builder` 对象，将 `sqorn-sql` 中创建的 `methods` merge 到其中，因此我们可以使用 `sq.where` 这种语法。而为什么可以 `sq.where().limit()` 这样连续调用呢？可以看下面的代码：

```js
for (const method of methods) {
  // add function call methods
  builder[name] = function(...args) {
    return this.create({ name, args, prev: this.method });
  };
}
```

这里将 `where` `delete` `insert` `with` `from` 等 `methods` merge 到 `builder` 对象中，且当其执行完后，通过 `this.create()` 返回一个新 `builder`，从而完成了链式调用功能。

### 生成 query

上面三点讲清楚了如何支持方言、用户代码内容都收集到 context 中了，而且我们还创建了可以链式调用的 `builder` 对象方便用户调用，那么只剩最后一步了，就是生成 query。

为了利用 context 生成 query，我们需要对每个 key 编写对应的函数做处理，拿 `limit` 举例：

```js
export default ctx => {
  if (!ctx.lim) return;
  const txt = build(ctx, ctx.lim);
  return txt && `limit ${txt}`;
};
```

从 `context.lim` 拿取 `limit` 配置，组合成 `limit xxx` 的字符串并返回就可以了。

> `build` 函数是个工具函数，如果 ctx.lim 是个数组，就会用逗号拼接。

大部分操作比如 `delete` `from` `having` 都做这么简单的处理即可，但像 `where` 会相对复杂，因为内部包含了 `condition` 子语法，注意用 `and` 拼接即可。

最后是顺序，也需要在代码中确定：

```js
export default {
  sql: query(sql),
  select: query(wth, select, from, where, group, having, order, limit, offset),
  delete: query(wth, del, where, returning),
  insert: query(wth, insert, value, returning),
  update: query(wth, update, set, where, returning)
};
```

这个意思是，一个 `select` 语句会通过 `wth, select, from, where, group, having, order, limit, offset` 的顺序调用处理函数，返回的值就是最终的 query。

## 4 总结

通过源码分析，可以看到制作一个这样的库有三个步骤：

1. 创建 context 存储结构化 query 信息。
2. 创建 builder 供用户链式书写代码同时填充 context。
3. 通过若干个 SQL 子处理函数加上几个主 statement 函数将其串联起来生成最终 query。

最后在设计时考虑到 SQL 方言的话，可以将模块拆成 核心、SQL、若干个方言库，方言库基于核心库做拓展即可。

## 5 更多讨论

> 讨论地址是：[精读《sqorn 源码》 · Issue #103 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/103)

**如果你想参与讨论，请[点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。**
