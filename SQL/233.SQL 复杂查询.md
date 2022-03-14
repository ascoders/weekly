SQL 复杂查询指的就是子查询。

为什么子查询叫做复杂查询呢？因为子查询相当于查询嵌套查询，因为嵌套导致复杂度几乎可以被无限放大（无限嵌套），因此叫复杂查询。下面是一个最简单的子查询例子：

```sql
SELECT pv FROM (
  SELECT pv FROM test
)
```

上面的例子等价于 `SELECT pv FROM test`，但因为把表的位置替换成了一个新查询，所以摇身一变成为了复杂查询！所以复杂查询不一定真的复杂，甚至可能写出和普通查询等价的复杂查询，要避免这种无意义的行为。

我们也要借此机会了解为什么子查询可以这么做。

### 理解查询的本质

当我们查一张表时，数据库认为我们在查什么？

这点很重要，因为下面两个语句都是合法的：

```sql
SELECT pv FROM test

SELECT pv FROM (
  SELECT pv FROM test
)
```

为什么数据库可以把子查询当作表呢？为了统一理解这些概念，我们有必要对查询内容进行抽象理解：**任意查询位置都是一条或多条记录**。

比如 `test` 这张表，显然是多条记录（当然只有一行就是一条记录），而 `SELECT pv FROM test` 也是多条记录，然而因为 `FROM` 后面可以查询任意条数的记录，所以这两种语法都支持。

不仅是 `FROM` 可以跟单条或多条记录，甚至 `SELECT`、`GROUP BY`、`WHERE`、`HAVING` 后都可以跟多条记录，这个后面再说。

说到这，也就很好理解子查询的变种了，比如我们可以在子查询内使用 `WHERE` 或 `GROUP BY` 等等，因为无论如何，只要查询结果是多条记录就行了：

```sql
SELECT sum(people) as allPeople, sum(gdp), city FROM (
  SELECT people, gdp, city FROM test
  GROUP BY city
  HAVING sum(gdp) > 10000
)
```

这个例子就有点业务含义了。子查询是从内而外执行的，因此我们先看内部的逻辑：按照城市分组，筛选出总 GDP 超过一万的所有地区的人口数量明细。外层查询再把人口数加总，这样就能对比每个 GDP 超过一万的地区，总人口和总 GDP 分别是多少，方便对这些重点城市做对比。

不过这个例子看起来还是不太自然，因为我们没必要写成复杂查询，其实简单查询也是等价的：

```sql
SELECT sum(people) as allPeople, sum(gdp), city FROM test
GROUP BY city
HAVING sum(gdp) > 10000
```

那为什么要多此一举呢？因为复杂查询的真正用法并不在这里。

### 视图

正因为子查询的存在，我们才可能以类似抽取变量的方式，抽取子查询，这个抽取出来的抽象就是视图：

```sql
CREATE VIEW my_table(people, gdp, city)
AS
SELECT sum(people) as allPeople, sum(gdp), city FROM test
GROUP BY city
HAVING sum(gdp) > 10000

SELECT sum(people) as allPeople, sum(gdp), city FROM my_table
```

这样的好处是，这个视图可以被多条 SQL 语句复用，不仅可维护性变好了，执行时也仅需查询一次。

要注意的是，SELECT 可以使用任何视图，但 INSERT、DELETE、UPDATE 用于视图时，需要视图满足一下条件：

1. 未使用 DISTINCT 去重。
2. FROM 单表。
3. 未使用 GROUP BY 和 HAVING。

因为上面几种模式都会导致视图成为聚合后的数据，不方便做除了查以外的操作。

另外一个知识点就是物化视图，即使用 MATERIALIZED 描述视图：

```sql
CREATE MATERIALIZED VIEW my_table(people, gdp, city)
AS ...
```

这种视图会落盘，为什么要支持这个特性呢？因为普通视图作为临时表，无法利用索引等优化手段，查询性能较低，所以物化视图是较为常见的性能优化手段。

说到性能优化手段，还有一些比较常见的理念，即把读的复杂度分摊到写的时候，比如提前聚合新表落盘或者对 CASE 语句固化为字段等，这里先不展开。

### 标量子查询

上面说了，WHERE 也可以跟子查询，比如：

```sql
SELECT city FROM test
WHERE gdp > (
  SELECT avg(gdp) from test
)
```

这样可以查询出 gdp 大于平均值的城市。

那为什么不能直接这么写呢？

```sql
SELECT city FROM test
WHERE gdp > avg(gdp) -- 报错，WHERE 无法使用聚合函数
```

看上去很美好，但其实第一篇我们就介绍了，WHERE 不能跟聚合查询，因为这样会把整个父查询都聚合起来。那为什么子查询可以？因为子查询聚合的是子查询啊，父查询并没有被聚合，所以这才符合我们的意图。

所以上面例子不合适的地方在于，直接在当前查询使用 `avg(gdp)` 会导致聚合，而我们并不想聚合当前查询，但又要通过聚合拿到平均 GDP，所以就要使用子查询了！

回过头来看，为什么这一节叫标量子查询？标量即单一值，因为 `avg(gdp)` 聚合出来的只有一个值，所以 WHERE 可以把它当做一个单一数值使用。反之，如果子查询没有使用聚合函数，或 GROUP BY 分组，那么就不能使用 `WHERE >` 这种语法，但可以使用 `WHERE IN`，这涉及到单条与多条记录的思考，我们接着看下一节。

### 单条和多条记录

介绍标量子查询时说到了，`WHERE >` 的值必须时单一值。但其实 WHERE 也可以跟返回多条记录的子查询结果，只要使用合理的条件语句，比如 IN：

```sql
SELECT area FROM test
WHERE gdp IN (
  SELECT max(gdp) from test
  GROUP BY city
)
```

上面的例子，子查询按照城市分组，并找到每一组 GDP 最大的那条记录，所以如果数据粒度是区域，那么我们就查到了每个城市 GDP 最大的那些记录，然后父查询通过 WHERE IN 找到 gdp 符合的复数结果，所以最后就把每个城市最大 gdp 的区域列了出来。

但实际上 `WHERE >` 语句跟复数查询结果也不会报错，但没有任何意义，所以我们要理解查询结果是单条还是多条，在 WHERE 判断时选择合适的条件。WHERE 适合跟复数查询结果的语法有：`WHERE IN`、`WHERE SOME`、`WHERE ANY`。

### 关联子查询

所谓关联子查询，即父子查询间存在关联，既然如此，子查询肯定不能单独优先执行，毕竟和父查询存在关联嘛，所以关联子查询是先执行外层查询，再执行内层查询的。要注意的是，对每一行父查询，子查询都会执行一次，因此性能不高（当然 SQL 会对相同参数的子查询结果做缓存）。

那这个关联是什么呢？关联的是每一行父查询时，对子查询执行的条件。这么说可能有点绕，举个例子：

```sql
SELECT * FROM test where gdp > (
  select avg(gdp) from test
  group by city
)
```

对这个例子来说，想要查找 gdp 大于按城市分组的平均 gdp，比如北京地区按北京比较，上海地区按上海比较。但很可惜这样做是不行的，因为父子查询没有关联，SQL 并不知道要按照相同城市比较，因此只要加一个 WHERE 条件，就变成关联子查询了：

```sql
SELECT * FROM test as t1 where gdp > (
  select avg(gdp) from test as t2 where t1.city = t2.city
  group by city
)
```

就是在每次判断 `WHERE gdp >` 条件时，重新计算子查询结果，将平均值限定在相同的城市，这样就符合需求了。

## 总结

学会灵活运用父子查询，就掌握了复杂查询了。

SQL 第一公民是集合，所以所谓父子查询就是父子集合的灵活组合，这些集合可以出现在几乎任何位置，根据集合的数量、是否聚合、关联条件，就派生出了标量查询、关联子查询。

更深入的了解就需要大量实战案例了，但万变不离其宗，掌握了复杂查询后，就可以理解大部分 SQL 案例了。

> 讨论地址是：[精读《SQL 复杂查询》· Issue #403 · ascoders/weekly](https://github.com/ascoders/weekly/issues/403)

**如果你想参与讨论，请 [点击这里](https://github.com/ascoders/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）


