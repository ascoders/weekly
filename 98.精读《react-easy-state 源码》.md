# 1. 引言

[react-easy-state](https://github.com/solkimicreb/react-easy-state) 是个比较有趣的库，利用 Proxy 创建了一个非常易用的全局数据流管理方式。

```jsx
import React from "react";
import { store, view } from "react-easy-state";

const counter = store({ num: 0 });
const increment = () => counter.num++;

export default view(() => <button onClick={increment}>{counter.num}</button>);
```

上手非常轻松，通过 `store` 创建一个数据对象，这个对象被任何 React 组件使用时，都会自动建立双向绑定，**任何对这个对象的修改，都会让使用了这个对象的组件重渲染。**

当然，为了实现这一点，需要对所有组件包裹一层 `view`。

# 2. 精读

这个库利用了 [nx-js/observer-util](https://github.com/nx-js/observer-util) 做 Reaction 基础 API，其他核心功能分别是 `store` `view` `batch`，所以我们就从这四个点进行解读。

## Reaction

这个单词名叫 “反应”，是实现双向绑定库的最基本功能单元。

拥有最基本的两个单词和一个概念：`observable` `observe` 与自动触发执行的特性。

```js
import { observable, observe } from "@nx-js/observer-util";

const counter = observable({ num: 0 });
const countLogger = observe(() => console.log(counter.num));

// 会自动触发 countLogger 函数内回调函数的执行。
counter.num++;
```

在第 35 期精读 [精读《dob - 框架实现》](https://github.com/dt-fe/weekly/blob/master/35.%E7%B2%BE%E8%AF%BB%E3%80%8Adob%20-%20%E6%A1%86%E6%9E%B6%E5%AE%9E%E7%8E%B0%E3%80%8B.md#%E6%8A%BD%E4%B8%9D%E5%89%A5%E8%8C%A7%E5%AE%9E%E7%8E%B0%E4%BE%9D%E8%B5%96%E8%BF%BD%E8%B8%AA) “抽丝剥茧，实现依赖追踪” 一节中有详细介绍实现原理，这里就不赘述了。

有了一个具有反应特性的函数，与一个可以 “触发反应” 的对象，那么实现双向绑定更新 View 就不远了。

## store

react-easy-state 的 `store` 就是 `observable(obj)` 包装一下，唯一不同是，由于支持本地数据：

```js
import React from 'react'
import { view, store } from 'react-easy-state'

export default view(() => {
  const counter = store({ num: 0 })
  const increment = () => counter.num++
  return <button={increment}>{counter.num}</div>
})
```

所以当监测到在 React 组件内部创建 `store` 且是 Hooks 环境时，会返回：

```js
return useMemo(() => observable(obj), []);
```

这是因为 React Hooks 场景下的 Function Component 每次渲染都会重新创建 Store，会导致死循环。因此利用 `useMemo` 并将依赖置为 `[]` 使代码在所有渲染周期内，只在初始化执行一次。

> 更多 Hooks 深入解读，可以阅读 [精读《useEffect 完全指南》](https://github.com/dt-fe/weekly/blob/master/96.%E7%B2%BE%E8%AF%BB%E3%80%8AuseEffect%20%E5%AE%8C%E5%85%A8%E6%8C%87%E5%8D%97%E3%80%8B.md)。

## view

根据 Function Component 与 Class Component 的不同，分别进行两种处理，本文主要介绍对 Function Component 的处理方式，因为笔者推荐使用 Function Component 风格。

首先最外层会套上 `memo`，这类似 `PureComponent` 的效果：

```js
return memo(/**/);
```

然后构造一个 `forceUpdate` 用来强制渲染组件：

```js
const [, forceUpdate] = useState();
```

之后，只要利用 `observe` 包裹组件即可，需要注意两点：

1. **使用刚才创建的 `forceUpdate` 在 `store` 修改时调用。**
2. `observe` 初始化不要执行，因为初始化组件自己会渲染一次，再渲染一次就会造成浪费。

所以作者通过 `scheduler` `lazy` 两个参数完成了这两件事：

```js
const render = useMemo(
  () =>
    observe(Comp, {
      scheduler: () => setState({}),
      lazy: true
    }),
  []
);

return render;
```

最后别忘了在组件销毁时取消监听：

```js
useEffect(() => {
  return () => unobserve(render);
}, []);
```

## batch

这也是双向绑定数据流必须解决的经典问题，批量更新合并。

由于修改对象就触发渲染，**这个过程太自动化了，以至于我们都没有机会告诉工具，连续的几次修改能否合并起来只触发一次渲染。** 尤其是 For 循环修改变量时，如果不能合并更新，在某些场景下代码几乎是不可用的。

所以 `batch` 就是为解决这个问题诞生的，让我们有机会控制合并更新的时机：

```js
import React from "react";
import { view, store, batch } from "react-easy-state";

const user = store({ name: "Bob", age: 30 });

function mutateUser() {
  // this makes sure the state changes will cause maximum one re-render,
  // no matter where this function is getting invoked from
  batch(() => {
    user.name = "Ann";
    user.age = 32;
  });
}

export default view(() => (
  <div>
    name: {user.name}, age: {user.age}
  </div>
));
```

`react-easy-state` 通过 `scheduler` 模块完成 `batch` 功能，核心代码只有五行：

```js
export function batch(fn, ctx, args) {
  let result;
  unstable_batchedUpdates(() => (result = fn.apply(ctx, args)));
  return result;
}
```

利用 `unstable_batchedUpdates`，可以保证在其内执行的函数都不会触发更新，也就是之前创建的 `forceUpdate` 虽然被调用，但是失效了，等回调执行完毕时再一起批量更新。

同时代码里还对 `setTimeout` `setInterval` `addEventListener` `WebSocket` 等公共方法进行了 `batch` 包装，让这些回调函数中自带 `batch` 效果。

# 4. 总结

好了，`react-easy-state` 神奇的效果解释完了，希望大家在使用第三方库的时候都能理解背后的原理。

> PS：最后，笔者目前不推荐在 Function Component 模式下使用任何三方数据流库，因为官方功能已经足够好用了！

> 讨论地址是：[精读《react-easy-state》 · Issue #144 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/144)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

**special Sponsors**

- [DevOps 全流程平台](https://e.coding.net/?utm_source=weekly)

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
