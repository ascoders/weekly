SQL 为什么要支持聚合查询呢？

这看上去是个幼稚的问题，但我们还是一步步思考一下。数据以行为粒度存储，最简单的 SQL 语句是 `select * from test`，拿到的是整个二维表明细，但仅做到这一点远远不够，出于以下两个目的，需要 SQL 提供聚合函数：

1. 明细数据没有统计意义，比如我想知道今天的营业额一共有多少，而不太关心某桌客人消费了多少。
2. 虽然可以先把数据查到内存中再聚合，但在数据量非常大的情况下很容易把内存撑爆，可能一张表一天的数据量就有 10TB，而 10TB 数据就算能读到内存里，聚合计算可能也会慢到难以接受。

另外聚合本身也有一定逻辑复杂度，而 SQL 提供了聚合函数与分组聚合能力，可以方便快速的统计出有业务价值的聚合数据，这奠定了 SQL 语言的分析价值，因此大部分分析软件直接采用 SQL 作为直接面向用户的表达式。

## 聚合函数

常见的聚合函数有：

- COUNT：计数。
- SUM：求和。
- AVG：求平均值。
- MAX：求最大值。
- MIN：求最小值。

### COUNT

COUNT 用来计算有多少条数据，比如我们看 id 这一列有多少条：

```sql
SELECT COUNT(id) FROM test
```

但我们发现其实查任何一列的 COUNT 都是一样的，那传入 id 有什么意义呢？没必要特殊找一个具体列指代呀，所以也可以写成：

```sql
SELECT COUNT(*) FROM test
```

但这两者存在微妙差异。SQL 存在一种很特殊的值类型 `NULL`，如果 COUNT 指定了具体列，则统计时会跳过此列值为 `NULL` 的行，而 `COUNT(*)` 由于未指定具体列，所以就算包含了 `NULL`，甚至某一行所有列都为 `NULL`，也都会包含进来。所以 `COUNT(*)` 查出的结果一定大于等于 `COUNT(c1)`。

当然任何聚合函数都可以跟随查询条件 WHERE，比如：

```sql
SELECT COUNT(*) FROM test
WHERE is_gray = 1
```

### SUM

SUM 求和所有项，因此必须作用于数值字段，而不能用于字符串。

```sql
SELECT SUM(cost) FROM test
```

SUM 遇到 NULL 值时当 0 处理，因为这等价于忽略。

### AVG

AVG 求所有项均值，因此必须作用于数值字段，而不能用于字符串。

```sql
SELECT AVG(cost) FROM test
```

AVG 遇到 NULL 值时采用了最彻底的忽略方式，即 NULL 完全不参与分子与分母的计算，就像这一行数据不存在一样。

### MAX、MIN

MAX、MIN 分别求最大与最小值，与上面不同的是，也可以作用于字符串上，因此可以根据字母判断大小，从大到小依次对应 `a-z`，但即便能算，也没有实际意义且不好理解，因此不建议对字符串求极值。

```sql
SELECT MAX(cost) FROM test
```

### 多个聚合字段

虽然都是聚合函数，但 MAX、MIN 严格意义上不算是聚合函数，因为它们只是寻找了满足条件的行。可以看看下面两段查询结果的对比：

```sql
SELECT MAX(cost), id FROM test -- id: 100
SELECT SUM(cost), id FROM test -- id: 1
```

第一条查询可以找到最大值那一行的 id，而第二条查询的 id 是无意义的，因为不知道归属在哪一行，所以只返回了第一条数据的 id。

当然，如果同时计算 MAX、MIN，那么此时 id 也只返回第一条数据的值，因为这个查询结果对应了复数行：

```sql
SELECT MAX(cost), MIN(cost), id FROM test -- id: 1
```

基于这些特性，最好不要混用聚合与非聚合，也就是一条查询一旦有一个字段是聚合的，那么所有字段都要聚合。

现在很多 BI 引擎的自定义字段都有这条限制，因为混用聚合与非聚合在自定义内存计算时处理起来边界情况很多，虽然 SQL 能支持，但业务自定义的函数可能不支持。

## 分组聚合

分组聚合就是 GROUP BY，其实可以把它当作一种高级的条件语句。

举个例子，查询每个国家的 GDP 总量：

```sql
SELECT SUM(GDP) FROM amazing_table
GROUP BY country
```

返回的结果就会按照国家进行分组，这时，聚合函数就变成了在组内聚合。

其实如果我们只想看中、美的 GDP，用非分组也可以查，只是要分成两条 SQL：

```sql
SELECT SUM(GDP) FROM amazing_table
WHERE country = '中国'

SELECT SUM(GDP) FROM amazing_table
WHERE country = '美国'
```

所以 GROUP BY 也可理解为，将某个字段的所有可枚举的情况都查了出来，并整合成一张表，每一行代表了一种枚举情况，不需要分解为一个个 WHERE 查询了。

### 多字段分组聚合

GROUP BY 可以对多个维度使用，含义等价于表格查询时行/列拖入多个维度。

上面是 BI 查询工具视角，如果没有上下文，可以看下面这个递进描述：

- 按照多个字段进行分组聚合。
- 多字段组合起来成为唯一 Key，即 `GROUP BY a,b` 表示 a,b 合在一起描述一个组。
- `GROUP BY a,b,c` 查询结果第一列可能看到许多重复的 a 行，第二列看到重复 b 行，但在同一个 a 值内不会重复，c 在 b 行中同理。

下面是一个例子：

```sql
SELECT SUM(GDP) FROM amazing_table
GROUP BY province, city, area
```

查询结果为：

```text
浙江 杭州 余杭区
浙江 杭州 西湖区
浙江 宁波 海曙区
浙江 宁波 江北区
北京 .........
```

### GROUP BY + WHERE

WHERE 是根据行进行条件筛选的。因此 GROUP BY + WHERE 并不是在组内做筛选，而是对整体做筛选。

但由于按行筛选，其实组内或非组内结果都完全一样，所以我们几乎无法感知这种差异：

```sql
SELECT SUM(GDP) FROM amazing_table
GROUP BY province, city, area
WHERE industry = 'internet'
```

然而，忽略这个差异会导致我们在聚合筛选时碰壁。

比如要筛选出平均分大于 60 学生的成绩总和，如果不使用子查询，是无法在普通查询中在 WHERE 加聚合函数实现的，比如下面就是一个语法错误的例子：

```sql
SELECT SUM(score) FROM amazing_table
WHERE AVG(score) > 60
```

不要幻想上面的 SQL 可以执行成功，不要在 WHERE 里使用聚合函数。

### GROUP BY + HAVING

HAVING 是根据组进行条件筛选的。因此可以在 HAVING 使用聚合函数：

```sql
SELECT SUM(score) FROM amazing_table
GROUP BY class_name
HAVING AVG(score) > 60
```

上面的例子中可以正常查询，表示按照班级分组看总分，且仅筛选出平均分大于 60 的班级。

所以为什么 HAVING 可以使用聚合条件呢？因为 HAVING 筛选的是组，所以可以对组聚合后过滤掉不满足条件的组，这样是有意义的。而 WHERE 是针对行粒度的，聚合后全表就只有一条数据，无论过滤与否都没有意义。

但要注意的是，GROUP BY 生成派生表是无法利用索引筛选的，所以 WHERE 可以利用给字段建立索引优化性能，而 HAVING 针对索引字段不起作用。

## 总结

聚合函数 + 分组可以实现大部分简单 SQL 需求，在写 SQL 表达式时，需要思考这样的表达式是如何计算的，比如 `MAX(c1), c2` 是合理的，而 `SUM(c1), c2` 这个 `c2` 就是无意义的。

最后记住 WHERE 是 GROUP BY 之前执行的，HAVING 针对组进行筛选。

> 讨论地址是：[精读《SQL 聚合查询》· Issue #401 · ascoders/weekly](https://github.com/ascoders/weekly/issues/401)

**如果你想参与讨论，请 [点击这里](https://github.com/ascoders/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）


