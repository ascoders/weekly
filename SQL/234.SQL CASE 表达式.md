CASE 表达式分为简单表达式与搜索表达式，其中搜索表达式可以覆盖简单表达式的全部能力，我也建议只写搜索表达式，而不要写简单表达式。

简单表达式：

```sql
SELECT CASE city
WHEN '北京' THEN 1
WHEN '天津' THEN 2
ELSE 0
END AS abc
FROM test
```

搜索表达式：

```sql
SELECT CASE
WHEN city = '北京' THEN 1
WHEN city = '天津' THEN 2
ELSE 0
END AS abc
FROM test
```

明显可以看出，简单表达式只是搜索表达式 `a = b` 的特例，因为无法书写任何符号，只要条件换成 `a > b` 就无法胜任了，而搜索表达式不但可以轻松胜任，甚至可以写聚合函数。

## CASE 表达式里的聚合函数

为什么 CASE 表达式里可以写聚合函数？

因为本身表达式就支持聚合函数，比如下面的语法，我们不会觉得奇怪：

```sql
SELECT sum(pv), avg(uv) from test
```

本身 SQL 就支持多种不同的聚合方式同时计算，所以将其用在 CASE 表达式里，也是顺其自然的：

```sql
SELECT CASE
WHEN count(city) = 100 THEN 1
WHEN sum(dau) > 200 THEN 2
ELSE 0
END AS abc
FROM test
```

只要 SQL 表达式中存在聚合函数，那么整个表达式都聚合了，此时访问非聚合变量没有任何意义。所以上面的例子，即便在 CASE 表达式中使用了聚合，其实也不过是聚合了一次后，按照条件进行判断罢了。

这个特性可以解决很多实际问题，比如将一些复杂聚合判断条件的结果用 SQL 结构输出，那么很可能是下面这种写法：

```sql
SELECT CASE
WHEN 聚合函数(字段) 符合什么条件 THEN xxx
... 可能有 N 个
ELSE NULL
END AS abc
FROM test
```

这也可以认为是一种行转列的过程，即 **把行聚合后的结果通过一条条 CASE 表达式形成一个个新的列**。

## 聚合与非聚合不能混用

我们希望利用 CASE 表达式找出那些 pv 大于平均值的行，以下这种想当然的写法是错误的：

```sql
SELECT CASE
WHEN pv > avg(pv) THEN 'yes'
ELSE 'no'
END AS abc
FROM test
```

原因是，只要 SQL 中存在聚合表达式，那么整条 SQL 就都是聚合的，所以返回的结果只有一条，而我们期望查询结果不聚合，只是判断条件用到了聚合结果，那么就要使用子查询。

为什么子查询可以解决问题？因为子查询的聚合发生在子查询，而不影响当前父查询，理解了这一点，就知道为什么下面的写法才是正确的了：

```sql
SELECT CASE
WHEN pv > ( SELECT avg(pv) from test ) THEN 'yes'
ELSE 'no'
END AS abc
FROM test
```

这个例子也说明了 CASE 表达式里可以使用子查询，因为子查询是先计算的，所以查询结果在哪儿都能用，CASE 表达式也不例外。

## WHERE 中的 CASE

WHERE 后面也可以跟 CASE 表达式的，用来做一些需要特殊枚举处理的筛选。

比如下面的例子：

```sql
SELECT * FROM demo WHERE
CASE
WHEN city = '北京' THEN true
ELSE ID > 5
END
```

本来我们要查询 ID 大于 5 的数据，但我想对北京这个城市特别对待，那么就可以在判断条件中再进行 CASE 分支判断。

这个场景在 BI 工具里等价于，创建一个 CASE 表达式字段，可以拖入筛选条件生效。

## GROUP BY 中的 CASE

想不到吧，GROUP BY 里都可以写 CASE 表达式：

```sql
SELECT isPower, sum(gdp) FROM test GROUP BY CASE
WHEN isPower = 1 THEN city, area
ELSE city
END
```

上面例子表示，计算 GDP 时，对于非常发达的城市，按照每个区粒度查看聚合结果，也就是看的粒度更细一些，而对于欠发达地区，本身 gdp 也不高，直接按照城市粒度看聚合结果。

这样，就按照不同的条件对数据进行了分组聚合。由于返回行结果是混在一起的，像这个例子，可以根据 isPower 字段是否为 1 判断，是否按照城市、区域进行了聚合，如果没有其他更显著的标识，可能导致无法区分不同行的聚合粒度，因此谨慎使用。

## ORDER BY 中的 CASE

同样，ORDER BY 使用 CASE 表达式，会将排序结果按照 CASE 分类进行分组，每组按照自己的规则排序，比如：

```sql
SELECT * FROM test ORDER BY CASE
WHEN isPower = 1 THEN gdp
ELSE people
END
```

上面的例子，对发达地区采用 gdp 排序，否则采用人口数量排序。

## 总结

CASE 表达式总结一下有如下特点：

1. 支持简单与搜索两种写法，推荐搜索写法。
2. 支持聚合与子查询，需要注意不同情况的特点。
3. 可以写在 SQL 查询的几乎任何地方，只要是可以写字段的地方，基本上就可以替换为 CASE 表达式。
4. 除了 SELECT 外，CASE 表达式还广泛应用在 INSERT 与 UPDATE，其中 UPDATE 的妙用是不用将 SQL 拆分为多条，所以不用担心数据变更后对判断条件的二次影响。

> 讨论地址是：[精读《SQL CASE 表达式》· Issue #404 · ascoders/weekly](https://github.com/ascoders/weekly/issues/404)

**如果你想参与讨论，请 [点击这里](https://github.com/ascoders/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）


