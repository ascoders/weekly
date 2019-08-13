# 1. 引言

引用著名瑞典统计学家 Hans Rosling 的一句话：想法来源于数字、信息，再到理解。

分析数据的最好方式是可视化，因为可视化承载的信息密度更高，甚至可以从不同维度对数据进行交互式分析。今天要精读的文章就分析了经典可视化分析工具 Tableau：[data-visualisation-made-easy](https://www.analyticsvidhya.com/blog/2017/07/data-visualisation-made-easy/)。

# 2. 精读

[Tableau](https://www.tableau.com/) 是一款广泛用于智能商业的强大数据分析工具，通过不同可交互的图表和仪表盘帮助你获得业务洞见。

## 安装

Tableau 提供了三种使用方式：

**Tableau Desktop**

[拥有 14 天免费试用的桌面版](https://www.tableau.com/products/trial)，可以将工作数据存储在计算机本地，如果你是学生或老师可以获得一年的免费使用权。

**Tableau Public**

[公开版完全免费](https://public.tableau.com/s/download)，和桌面版的唯一区别是，所有数据都无法保存在本地，只能保存在 Tableau 服务器的云端，而且是公开的。

**Tableau Online**

[网页版也完全免费](https://sso.online.tableau.com/public/idp/SSO)，是 Tableau Public 的网页版。

## 连接数据源

安装好 Tableau 后，第一步就是连接数据源。它支持连接本地或云端的数据源，本地最常用的数据源可以从 Excel 转换。这里是一份 [样例数据](https://github.com/pavleenkaur/TableauTutorial-On-AnalyticsVidhya/blob/master/Sample-Superstore.xls)，包含了一个超市几年内的销售情况，我们可以用这份数据练手。

下载好这份数据后，选择从 Excel 导入，确认后将 **Orders** 表拖拽到右侧区域，如下图所示：

<img width=500 src="https://img.alicdn.com/tfs/TB1Cvh5cV67gK0jSZPfXXahhFXa-1440-900.png">

可以看到，导入的数据格式有些问题，这是因为这份 Excel 文件表头有一些描述信息干扰。勾选 **Use Data Interpreter** 后，可以开启数据解析功能，自动分析出你想要的表结构：

<img width=500 src="https://img.alicdn.com/tfs/TB1XLJ_c7T2gK0jSZPcXXcKkpXa-1440-900.png">

可以看到表结构已经正常了，在数据清洗的过程中，Tableau 强大的数据分析功能已经初见端倪。你甚至可以点击 **Review ths results** 看看它是如何清洗数据的：点击后会下载一份分析 Excel，其中过滤掉的数据会被标记，自动分析出的表结构会被高亮。

## 数据可视化

在页面最底部有几个切换项，依次是 **Data Source**：数据源、**Sheet**：工作簿，后面跟随的三个按钮可以继续创建多个 Sheet、Dashboard、Story，这些后面都会讲到。首先点击 Sheet 进入可视化分析的工作簿：

<img width=500 src="https://img.alicdn.com/tfs/TB1S2LzcebviK0jSZFNXXaApXXa-1440-900.png">

可以看到，Orders 表的字段已经被自动分析成 **维度** **度量** 了。维度和度量是数据分析中重要的概念：

- **维度：** 维度是不能被计数的字段，一般为字符串或离散的值，用来描述数据的维度。
- **度量：** 度量是可以被计数的字段，一般为数字、日期等连续的值，用来描述数据的量。

右侧空白区域是图表展示区域，**可以响应拖拽交互**，顶部的 Columns、Rows 表示列与行，Filters 是过滤器，拖拽字段上去可以对此字段进行过滤，Marks 是标记，Tableau 将图表所有辅助标记功能都抽象为：颜色、大小、文本、具体值、工具提示。举个例子，如果将销量 Sales 字段拖拽到大小区域，那么任何能描述大小的图表，都会以销量的多少来决定大小，比如散点图。

右上角的 **Show Me** 是图表自动推荐区域，当你拖拽不同字段的时候，Tableau 会自动展示合适的图表，但你也可以点击 Show Me 进行图表切换。

那么开始动手吧！**首先我们要看看大盘数据如何，也就是这家超市的总利润、质量、销量：**

> 在左侧维度栏目下，最后一个字段 **Measure Names** 表示所有度量的集合。

1. 将 **Measure Names** 拖拽到画布的空白区域。
2. 移除我们不关心的 Row ID, Discount 等字段。

<img width=500 src="https://img.alicdn.com/tfs/TB1caeXcYH1gK0jSZFwXXc7aXXa-1440-900.png">

可以看到，总利润大概是总销量的 10%。如果想展示横向表格，将 Measure Names 从 Rows 拖拽到 Columns 即可。

> Tips: 为了方便区分，Tableau 贴心的将维度标记为蓝色，度量标记为绿色。
> 同时可以看到，Tableau 对于单指标拖拽，默认采取表格方式渲染。

**接下来我们要看每一年的详细销量与利润：**

1. 将 Order Date 与 Sales 拖拽到 Rows。
2. 右键 Sales，将类型从连续改成非连续，这样就会自动变成表格展示。
3. 为了展示利润，将 Profit 字段拖拽到 Marks 的 Text 字段上。

<img width=500 src="https://img.alicdn.com/tfs/TB1fxV_c4v1gK0jSZFFXXb0sXXa-1440-900.png">

我们可以看到，无论是销量还是利润都在逐年上升。**接下来我们想具体看看每个月份的数据**：

1. 右键 Order Date，将日期维度从年切换到月。

<img width=500 src="https://img.alicdn.com/tfs/TB1SCN9c.T1gK0jSZFrXXcNCXXa-1440-900.png">

我们可以看到，销量较高的月份分布在：3、9、11、12 月。注意由于没有对年份做筛选，这里的每月统计数据是整合了 2013～2016 四年份的。也就是 1 月的数据其实代表了 2013.1 + 2014.1 + 2015.1 + 2016.1 共四个 1 月份数据的总和。

**接下来我们想了解销量与利润增长的趋势：**

1. 将 Order Date 拖拽到 Columns。
2. 将 Sales 拖拽到 Rows，此时会出现一条线。接下来将 Profit 拖拽到 **左 Y 轴**。

<img width=500 src="https://img.alicdn.com/tfs/TB1zVF_c7P2gK0jSZPxXXacQpXa-1440-900.png">

这里就涉及到线图拖拽交互设计了，线图一共有三种拖拽方式。如果将一个新字段拖拽到左 Y 轴，就会在左 Y 轴多出一条线；如果拖拽到中间图表区域，则这个字段会当作已有字段的工具提示；如果拖拽到右 Y 轴，则会自动变成双轴图。

从上图中能看到，销量增长明显，但利润增长缓慢，看来经营是存在一定问题的，还要继续分析问题在哪。

**我们再看看数据按月分布情况**，同样右击 Order Date，选择 月 粒度：

<img width=500 src="https://img.alicdn.com/tfs/TB1RmJ9c.H1gK0jSZSyXXXtlpXa-1440-900.png">

上图可以明显看到三个峰值出现在 3、9、11 月份，然而这段期间利润增长幅度却不大，可以看出这段期间采取了薄利多销的手段。

**再从地区维度分析数据：**

1. 将 Regions 和 Sales 拖拽到 Columns。
2. 切换到饼图。
3. 将 Sales 拖拽到 Marks Pane 的 Label 上。

<img width=500 src="https://img.alicdn.com/tfs/TB1KEJ_c7Y2gK0jSZFgXXc5OFXa-1440-900.png">

可以看到东西部地区是销量最高的区域。**接下来我们想看具体城市的销量：**

1. 将 States 拖拽到画布空白区域，此时会自动出现地图并定位到美国。将 Profits 拖拽到 Color。
2. 将地区切换到 Filled Map，将 Profits 拖拽到 Label。

这样就绘制了一张地区，颜色越深利润越高，数字表示销量。

<img width=500 src="https://img.alicdn.com/tfs/TB1CFWbc.Y1gK0jSZFCXXcwqXXa-1440-900.png">

可以看到数值越大的区域一般颜色也越深，但这不是分析利润/销量性价比的最佳方式，我们先只看到加州和纽约是销售业绩最好的区域，而科罗拉多州虽然销量不错，但利润却是负的。

上面的地图对地形比较直观，但要分析销售健康度，还是用散点图更合适。**我们想看看城市销量/利润的健康度分布：**

1. Profit 拖拽到 Columns，Sales 拖拽到 Rows，此时散点图出现，但只有一个点（之所以出现散点图，是因为横纵轴拖拽的都是度量）。
2. 我们想按城市下钻，只要把 State 拖拽到 Detail 即可。

<img width=500 src="https://img.alicdn.com/tfs/TB1EMl9cVY7gK0jSZKzXXaikpXa-1440-900.png">

可以看到，遥遥领先的城市有三个，加州是销售之王。

由于还没有介绍到筛选条件，这里简略介绍一下，其实还可以将年份拖拽到筛选条件，只看 2013 年的分布图，也可以点击或圈选其中某些点选择排除某些城市。

**现在需要进一步分析明细数据，将不同商品种类按年份细分，看按月的销量，并看看这些月份的利润如何：**

1. 此时需要用到高亮表格。首先将 Category 和 Order Date 拖拽到 Rows，简单的表格出现了。
2. 将 Order Date 再拖拽到 Columns，并右键将其粒度改为月。
3. 在 Show Me 中切换为 Highlight Table，重新将 Order Date（Year）拖拽回 Rows。
4. 为了展示颜色与文字，将 Profit 拖拽到 Color，Sales 拖拽到 Label。

<img width=500 src="https://img.alicdn.com/tfs/TB1Ud07cWL7gK0jSZFBXXXZZpXa-1440-900.png">

可以看到，办公套件和科技产品业绩最好，其中办公套件在 2015 年 12 月销量利润双丰收，科技产品在 2015 年 10 月与 2016 年 3 月销量利润双丰收。整体来看前半年是淡季。

但这张图无法看到销量与利润性价比关系，**我们要找出利润率最高的商品和利润率最低的商品：**

1. 将 Proft 拖拽到 Columns。
2. 将 Sub-Category 拖拽到 Rows。
3. 切换到 Horizontal Bars。
4. 将销量 Sales 拖拽到 Color。

<img width=500 src="https://img.alicdn.com/tfs/TB10T4.c9f2gK0jSZFPXXXsopXa-1440-900.png">

可以明显看到 Copiers 就是性价比之王，拥有最高的利润，但销量却不是很高（颜色深度中等），而桌子是性价比最低的，利润为负，而且销量不低。

## 其他功能

除了上面基本可视化分析能力之外，Tableau 还有许多辅助功能。

### 筛选器

在按月分布的折线图中，如果我们只想看某一年的，可以将 Order Date 拖拽到 Filters 区域，只勾选想要保留的年份：

<img width=500 src="https://img.alicdn.com/tfs/TB1jgWcc1H2gK0jSZJnXXaT1FXa-1440-900.png">

Tablueau 这种交互等价于 Sql 中 `in` 语句，当然 Tablueau 还支持更复杂的条件或代码表达式，这里只是将更友好的筛选方式优先展示区来。

### 上卷下钻

Tableau 支持任意维度之间的上卷下钻，只要你将他们分好组。

比如将 Order Date、Order ID、Ship Date、Ship Mode 拖拽到一起，成为 Orders 组；将 Category、Sub-Category、Product ID Product Name 形成 Product 组：

<img width=500 src="https://img.alicdn.com/tfs/TB11lmcc.Y1gK0jSZFCXXcwqXXa-1440-900.png">

我们就可以将 Product 直接拖拽到画布区域，并选择矩形树图，通过点击指标上的 “+” “-” 号进行上卷或下钻：

<img width=500 src="https://img.alicdn.com/tfs/TB1yud_cVT7gK0jSZFpXXaTkpXa-1440-900.png">

上卷下钻是顺序相关的，比如 Product - Order Date 表示在产品类目基础上，对每个类目按日期下钻。而 Order Date - Product 这个顺序，表示在日期分布的基础上，对日期按产品类目下钻，了解不同日期下每个产品的分布情况。

### 趋势线

为使用趋势线，先制作一个双轴图：

1. 将 Sales 与 Profit 拖拽到 Rows。
2. 将 Order Date 拖拽到 Columns 并切换到月维度。
3. 选择 Show Me 的 Dual Combination 即混合图。

<img width=500 src="https://img.alicdn.com/tfs/TB1YOeacV67gK0jSZPfXXahhFXa-1440-900.png">

点击 Analytics Tab，将 Trend Line 拖入 chart 中：

<img width=500 src="https://img.alicdn.com/tfs/TB1HL5gc.Y1gK0jSZFCXXcwqXXa-1440-900.png">

趋势图有几种算法，比如线性，Log 或指数，因此在做趋势分析前，首先要判断自己的业务属于哪种增长阶段，如果是爆发期可以选择指数，平稳期可以选择线性等等。

### 预测

回到按月分布的图表，如果我们想预测未来销量和利润的走势，可以使用预测功能：

1. 切换到 Analytics Tab，并将 Forecast 拖拽到图表中。
2. 可以点击右键配置预测参数。

<img width=500 src="https://img.alicdn.com/tfs/TB1Cumcc4D1gK0jSZFsXXbldVXa-1440-900.png">

预测趋势有一个浅色区域，表示预测范围。

### 聚类

象限图的四象限是多维度综合判断的法则，然而 Tableau 支持的聚类分析可以自动做到这些：

1. 切换到 Analytics Tab，选择 Clusters。
2. 可以选择自动聚类个数，也可以手动指定个数。

<img width=500 src="https://img.alicdn.com/tfs/TB1BsWgc1P2gK0jSZFoXXauIVXa-1440-900.png">

从上图可以看到，指定了 4 个分类，最右上角加州就是最突出的一组，整个聚类只有它一个元素，而画面偏左下角的也是一类，这些是业绩较差的一组数据。使用了 K 均值聚类算法，并且当你点击右键查看详细星系时，还能把组间、组内方差展示出来：

<img width=500 src="https://img.alicdn.com/tfs/TB1O7Oec1H2gK0jSZFEXXcqMpXa-1440-900.png">

## 仪表板

仪表板可以将多个 Sheets 内容聚合在一起并自由布局，但仪表板最精髓的功能是图表联动功能：

1. 点击任意图表，选择 “作为筛选条件”。

<img width=500 src="https://img.alicdn.com/tfs/TB1cVjIcebviK0jSZFNXXaApXXa-1440-900.png">

Tableau 的所有图表都支持点选，排除等操作，那么点选这类操作本质上其实是个筛选的过程，比如柱状图点击了某根柱子，可以认为是选择了这根柱子当前的维度值作为筛选条件。

当一个 Sheet 作为筛选条件后，类似点选这种操作产生的筛选就会作用于其他同数据集的图表，因此如上图所示，当点击了条形图的某一根柱子时，上面的销量地图也自动做了筛选，仅展示当前选中的产品的销量分布。

## 故事

Story 更像是 PPT，将分析后有价值或有意义的图表组合在一起，再配合上说明，得出一些结论：

<img width=500 src="https://img.alicdn.com/tfs/TB1wa1gc1L2gK0jSZFmXXc7iXXa-1018-870.png">

如上图所示，比如得到这家超市的大盘数据，这一般也是数据分析的最后一步，最后生成报表。

# 3. 总结

Tableau 的交互式分析思路印证了这句话：

数字、信息，再到理解最终才能产生 Idea。我们从拿到 Excel 导入数据集开始，数据就已经变成了维度和度量的信息，再经过主动思考，将同一份数据进行不同维度的展示，最终得出加州销量最好、家具销售业绩最差、而桌子是负利润的主要来源等等洞见。

通过原文对 Tablueau 功能的分析能看到，Tableau 的核心资产是具备交互式分析能力的图表，这些图表通过智能推荐的方式展示出来，可以在不知道如何分析数据时找到一些灵感，真正做到以数据角度思考，图表展示只是辅助的视觉效果。

目前国内还处于报表制作的时代，即先选择报表再配数据集，这种使用思路是展示数据优先，而不是分析数据优先，笔者认为原因在于国内大部分做报表的业务场景都处于最末端，也就是数据洞见已经有了，再使用 BI 将这个洞见还原出来。而 BI 工具真正想做的还是在前面 “分析洞见” 这一步，希望数据分析师能可以通过 BI 平台挖掘出商业洞见。

要走到这一步，需要国内 BI 平台与使用 BI 的人都发展到下一阶段，而这种探索式数据分析功能早在 2012 年就在国外由 Tableau 团队实现，相信未来三年内国内一定能迎来一波探索式数据分析浪潮！

> 讨论地址是：[精读《Tableau 入门》 · Issue #192 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/192)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
