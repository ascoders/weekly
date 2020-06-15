## 1 引言

使用 React Hooks 的时候，经常出现执行次数过多甚至死循环的情况，我们可以利用 [use-what-changed](https://github.com/simbathesailor/use-what-changed) 进行依赖分析，找到哪个变量引用一直在变化。

据一个例子，比如你尝试在 Class 组件内部渲染 Function 组件，Class 组件是这么写的：

```jsx
class Parent extends React.PureComponent {
  state = {
    text: "text",
  };

  render() {
    return <Child setText={(text) => this.setState({ text })} />;
  }
}
```

子组件是这么写的：

```jsx
const Child = ({ setText }) => {
  useEffect(() => {
    setText("ok");
  }, [setText]);

  return null;
};
```

那么恭喜你，写出了一个最简单的死循环。这个场景里，我们本意是利用 `useEffect` 调用 `props.setText` 更新父组件的 `text`，但执行 `props.setText` 会导致父组件重渲染，由于父级 `setText={(text) => this.setState({ text })}` 的写法，每次重渲染拿到的 `props.setText` 引用都会变化，因此再次触发了 `useEffect` 回调执行，进而触发死循环。

仅仅打印出值是看不出变化的，引用的改变很隐蔽，为了判断是否变化还得存储上一次的值做比较，非常麻烦，use-what-changed 就是为了解决这个麻烦的。

## 2 精读

use-what-changed 使用方式如下：

```jsx
function App() {
  useWhatChanged([a, b, c, d]); // debugs the below useEffect

  React.useEffect(() => {
    // console.log("some thing changed , need to figure out")
  }, [a, b, c, d]);
}
```

将参数像依赖数组一样传入，刷新页面就可以在控制台看到引用或值是否变化，如果变化，对应行会展示 ✅ 并打印出上次的值与当前值：

<img width=300 src="https://img.alicdn.com/tfs/TB1SN7JKbj1gK0jSZFOXXc7GpXa-908-460.png">

第一步是存储上一次依赖项的值，利用 `useRef` 实现：

```jsx
function useWhatChanged(dependency?: any[]) {
  const dependencyRef = React.useRef(dependency);
}
```

然后利用 `useEffect`，对比 `dependency` 与 `dependencyRef` 的引用即可找到变化项：

```jsx
React.useEffect(() => {
  let changed = false;
  const whatChanged = dependency
    ? dependency.reduce((acc, dep, index) => {
        if (dependencyRef.current && dep !== dependencyRef.current[index]) {
          changed = true;

          const oldValue = dependencyRef.current[index];
          dependencyRef.current[index] = dep;
          acc[`"✅" ${index}`] = {
            "Old Value": getPrintableInfo(oldValue),
            "New Value": getPrintableInfo(dep),
          };

          return acc;
        }

        acc[`"⏺" ${index}`] = {
          "Old Value": getPrintableInfo(dep),
          "New Value": getPrintableInfo(dep),
        };

        return acc;
      }, {})
    : {};

  if (isDevelopment) {
    console.table(whatChanged);
  }
}, [dependency]);
```

1. 直接对比 deps 引用，不想等则将 `changed` 设为 true。
2. 调试模式下，利用 console.table 打印出表格。
3. 依赖项是 dependency，当依赖项变化时才打印 whatChanged。

以上就是其源码的核心逻辑，当然我们还可以简化输出，仅当有引用变化时才打印表格，否则只输出简单的 Log 信息：

```jsx
if (isDevelopment) {
  if (changed) {
    console.table(whatChanged);
  } else {
    console.log(whatChanged);
  }
}
```

### babel 插件

最后 use-what-changed 还提供了 babel 插件，只通过注释就能打印 `useMemo`、`useEffect` 等依赖变化信息。babel 配置如下：

```js
{
  "plugins": [
    [
      "@simbathesailor/babel-plugin-use-what-changed",
      {
        "active": process.env.NODE_ENV === "development" // boolean
      }
    ]
  ]
}
```

使用方式简化为：

```jsx
// uwc-debug
React.useEffect(() => {
  // console.log("some thing changed , need to figure out")
}, [a, b, c, d]);
```

将 Hooks 的 deps 数组直接转化为 use-what-changed 的入参。

## 3 总结

[use-what-changed](https://github.com/simbathesailor/use-what-changed) 补充了 Hooks 依赖变化的调试方法，对于 React 组件重渲染分析可以利用 React Dev Tool，可以参考 [精读《React 性能调试》](https://github.com/dt-fe/weekly/blob/v2/149.%20%E7%B2%BE%E8%AF%BB%E3%80%8AReact%20%E6%80%A7%E8%83%BD%E8%B0%83%E8%AF%95%E3%80%8B.md)。

还有哪些实用的 Hooks 调试工具呢？欢迎分享。

> 讨论地址是：[精读《use-what-changed 源码》· Issue #256 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/256)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
