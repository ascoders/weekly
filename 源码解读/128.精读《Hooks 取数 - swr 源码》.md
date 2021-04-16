## 1 引言

取数是前端业务的重要部分，也经历过几次演化：

- [fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) 的兼容性已经足够好，足以替换包括 `$.post` 在内的各种取数封装。
- 原生用得久了，发现拓展性更好、支持 ssr 的同构取数方案也挺好，比如 [isomorphic-fetch](https://github.com/matthew-andrews/isomorphic-fetch)、[axios](https://github.com/axios/axios)。
- 对于数据驱动场景还是不够，数据流逐渐将取数封装起来，同时针对数据驱动状态变化管理进行了 `data` `isLoading` `error` 封装。
- Hooks 的出现让组件更 Reactive，我们发现取数还是优雅回到了组件里，[swr](https://github.com/zeit/swr) 就是一个教科书般的例子。

[swr](https://github.com/zeit/swr) 在 2019.10.29 号提交，仅仅 12 天就攒了 4000+ star，平均一天收获 300+ star！本周精读就来剖析这个库的功能与源码，了解这个 React Hooks 的取数库的 Why How 与 What。

## 2 概述

首先介绍 swr 的功能。

为了和官方文档有所区别，笔者以探索式思路介绍这个它，但例子都取自官方文档。

### 2.1 为什么用 Hooks 取数

首先回答一个根本问题：为什么用 Hooks 替代 fetch 或数据流取数？

因为 **Hooks 可以触达 UI 生命周期，取数本质上是 UI 展示或交互的一个环节。** 用 Hooks 取数的形式如下：

```typescript
import useSWR from "swr";

function Profile() {
  const { data, error } = useSWR("/api/user", fetcher);

  if (error) return <div>failed to load</div>;
  if (!data) return <div>loading...</div>;
  return <div>hello {data.name}!</div>;
}
```

首先看到的是，以同步写法描述了异步逻辑，这是因为渲染被执行了两次。

`useSWR` 接收三个参数，第一个参数是取数 `key`，这个 `key` 会作为第二个参数 `fetcher` 的第一个参数传入，普通场景下为 URL，第三个参数是配置项。

Hooks 的威力还不仅如此，上面短短几行代码还自带如下特性：

1. 可自动刷新。
2. 组件被销毁再渲染时优先启用本地缓存。
3. 在列表页中浏览器回退可以自动记忆滚动条位置。
4. tabs 切换时，被 focus 的 tab 会重新取数。

当然，自动刷新或重新取数也不一定是我们想要的，[swr](https://github.com/zeit/swr) 允许自定义配置。

### 2.2 配置

上面提到，`useSWR` 还有第三个参数作为配置项。

**独立配置**

通过第三个参数为每个 `useSWR` 独立配置：

```tsx
useSWR("/api/user", fetcher, { revalidateOnFocus: false });
```

配置项可以参考 [文档](https://github.com/zeit/swr#options)。

> 可以配置的有：suspense 模式、focus 重新取数、重新取数间隔/是否开启、失败是否重新取数、timeout、取数成功/失败/重试时的回调函数等等。

> 第二个参数如果是 object 类型，则效果为配置项，第二个 fetcher 只是为了方便才提供的，在 object 配置项里也可以配置 fetcher。

**全局配置**

`SWRConfig` 可以批量修改配置：

```tsx
import useSWR, { SWRConfig } from "swr";

function Dashboard() {
  const { data: events } = useSWR("/api/events");
  // ...
}

function App() {
  return (
    <SWRConfig value={{ refreshInterval: 3000 }}>
      <Dashboard />
    </SWRConfig>
  );
}
```

独立配置优先级高于全局配置，在精读部分会介绍实现方式。

最重量级的配置项是 `fetcher`，它决定了取数方式。

### 2.3 自定义取数方式

自定义取数逻辑其实分几种抽象粒度，比如自定义取数 url，或自定义整个取数函数，而 [swr](https://github.com/zeit/swr) 采取了相对中间粒度的自定义 `fetcher`：

```tsx
import fetch from "unfetch";

const fetcher = url => fetch(url).then(r => r.json());

function App() {
  const { data } = useSWR("/api/data", fetcher);
  // ...
}
```

所以 `fetcher` 本身就是一个拓展点，我们不仅能自定义取数函数，自定义业务处理逻辑，甚至可以自定义取数协议：

```tsx
import { request } from "graphql-request";

const API = "https://api.graph.cool/simple/v1/movies";
const fetcher = query => request(API, query);

function App() {
  const { data, error } = useSWR(
    `{
      Movie(title: "Inception") {
        releaseDate
        actors {
          name
        }
      }
    }`,
    fetcher
  );
  // ...
}
```

这里回应了第一个参数称为取数 Key 的原因，在 graphql 下它则是一段语法描述。

到这里，我们可以自定义取数函数，但却无法控制何时取数，因为 Hooks 写法使取数时机与渲染时机结合在一起。[swr](https://github.com/zeit/swr) 的条件取数机制可以解决这个问题。

### 2.4 条件取数

所谓条件取数，即 `useSWR` 第一个参数为 null 时则会终止取数，我们可以用三元运算符或函数作为第一个参数，使这个条件动态化：

```tsx
// conditionally fetch
const { data } = useSWR(shouldFetch ? "/api/data" : null, fetcher);

// ...or return a falsy value
const { data } = useSWR(() => (shouldFetch ? "/api/data" : null), fetcher);
```

上例中，当 `shouldFetch` 为 false 时则不会取数。

第一个取数参数推荐为回调函数，这样 [swr](https://github.com/zeit/swr) 会 catch 住内部异常，比如：

```tsx
// ... or throw an error when user.id is not defined
const { data, error } = useSWR(() => "/api/data?uid=" + user.id, fetcher);
```

如果 `user` 对象不存在，`user.id` 的调用会失败，此时错误会被 catch 住并抛到 `error` 对象。

实际上，`user.id` 还是一种依赖取数场景，当 `user.id` 发生变化时需要重新取数。

### 2.5 依赖取数

如果一个取数依赖另一个取数的结果，那么当第一个数据结束时才会触发新的取数，这在 [swr](https://github.com/zeit/swr) 中不需要特别关心，只需按照依赖顺序书写 `useSWR` 即可：

```tsx
function MyProjects() {
  const { data: user } = useSWR("/api/user");
  const { data: projects } = useSWR(() => "/api/projects?uid=" + user.id);

  if (!projects) return "loading...";
  return "You have " + projects.length + " projects";
}
```

[swr](https://github.com/zeit/swr) 会尽可能并行没有依赖的请求，并按依赖顺序一次发送有依赖关系的取数。

可以想象，如果手动管理取数，当依赖关系复杂时，为了确保取数的最大可并行，往往需要精心调整取数递归嵌套结构，而在 [swr](https://github.com/zeit/swr) 的环境下只需顺序书写即可，这是很大的效率提升。优化方式在下面源码解读章节详细说明。

依赖取数是自动重新触发取数的一种场景，其实 [swr](https://github.com/zeit/swr) 还支持手动触发重新取数。

### 2.6 手动触发取数

`trigger` 可以通过 Key 手动触发取数：

```tsx
import useSWR, { trigger } from "swr";

function App() {
  return (
    <div>
      <Profile />
      <button
        onClick={() => {
          // set the cookie as expired
          document.cookie =
            "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

          // tell all SWRs with this key to revalidate
          trigger("/api/user");
        }}
      >
        Logout
      </button>
    </div>
  );
}
```

大部分场景不必如此，**因为请求的重新触发由数据和依赖决定，但遇到取数的必要性不由取数参数决定，而是时机时，就需要用手动取数能力了。**

### 2.7 乐观取数

特别在表单场景时，数据的改动是可预期的，此时数据驱动方案只能等待后端返回结果，其实可以优化为本地先修改数据，等后端结果返回后再刷新一次：

```tsx
import useSWR, { mutate } from "swr";

function Profile() {
  const { data } = useSWR("/api/user", fetcher);

  return (
    <div>
      <h1>My name is {data.name}.</h1>
      <button
        onClick={async () => {
          const newName = data.name.toUpperCase();
          // send a request to the API to update the data
          await requestUpdateUsername(newName);
          // update the local data immediately and revalidate (refetch)
          mutate("/api/user", { ...data, name: newName });
        }}
      >
        Uppercase my name!
      </button>
    </div>
  );
}
```

通过 `mutate` 可以在本地临时修改某个 Key 下返回结果，特别在网络环境差的情况下加快响应速度。乐观取数，表示对取数结果是乐观的、可预期的，所以才能在结果返回之前就预测并修改了结果。

### 2.8 Suspense 模式

在 React Suspense 模式下，所有子模块都可以被懒加载，包括代码和请求都可以被等待，只要开启 `suspense` 属性即可：

```tsx
import { Suspense } from "react";
import useSWR from "swr";

function Profile() {
  const { data } = useSWR("/api/user", fetcher, { suspense: true });
  return <div>hello, {data.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<div>loading...</div>}>
      <Profile />
    </Suspense>
  );
}
```

### 2.9 错误处理

`onErrorRetry` 可以统一处理错误，包括在错误发生后重新取数等：

```tsx
useSWR(key, fetcher, {
  onErrorRetry: (error, key, option, revalidate, { retryCount }) => {
    if (retryCount >= 10) return;
    if (error.status === 404) return;

    // retry after 5 seconds
    setTimeout(() => revalidate({ retryCount: retryCount + 1 }), 5000);
  }
});
```

## 3 精读

### 3.1 全局配置

在 Hooks 场景下，包装一层自定义 `Context` 即可实现全局配置。

首先 `SWRConfig` 本质是一个定制 `Context Provider`:

```tsx
const SWRConfig = SWRConfigContext.Provider;
```

在 `useSWR` 中将当前配置与全局配置 Merge 即可，通过 `useContext` 拿到全局配置：

```tsx
config = Object.assign({}, defaultConfig, useContext(SWRConfigContext), config);
```

### 3.2 useSWR 的一些细节

从源码可以看到更多细节用心，`useSWR` 真的比手动调用 `fetch` 好很多。

**兼容性**

`useSWR` 主体代码在 `useEffect` 中，但是为了将请求时机提前，放在了 UI 渲染前（`useLayoutEffect`），并兼容了服务端场景：

```tsx
const useIsomorphicLayoutEffect = IS_SERVER ? useEffect : useLayoutEffect;
```

**非阻塞**

请求时机在浏览器空闲时，因此请求函数被 `requestIdleCallback` 包裹：

```tsx
window["requestIdleCallback"](softRevalidate);
```

`softRevalidate` 是开启了去重的 `revalidate`:

```tsx
const softRevalidate = () => revalidate({ dedupe: true });
```

即默认 2s 内参数相同的重复取数会被取消。

**性能优化**

由于 [swr](https://github.com/zeit/swr) 的 `data`、`isValidating` 等数据状态是利用 `useState` 分开管理的：

```tsx
let [data, setData] = useState(
  (shouldReadCache ? cacheGet(key) : undefined) || config.initialData
);
// ...
let [isValidating, setIsValidating] = useState(false);
```

而取数状态变化时往往 `data` 与 `isValidating` 要一起更新，为了仅触发一次更新，使用了 <del>`unstable_batchedUpdates` 将更新合并为一次：</del>

```tsx
unstable_batchedUpdates(() => {
  setIsValidating(false);
  // ...
  setData(newData);
});
```


其实还有别的解法，比如使用 `useReducer` 管理数据也能达到相同性能效果。
目前源码已经从`unstable_batchedUpdates`切换为 `useReducer`管理
```tsx
dispatch(newState);       
```


### 3.3 初始缓存

当页面切换时，可以暂时以上一次数据替换取数结果，即初始化数据从缓存中拿：

```tsx
const shouldReadCache = config.suspense || !useHydration();

// stale: get from cache
let [data, setData] = useState(
  (shouldReadCache ? cacheGet(key) : undefined) || config.initialData
);
```

上面一段代码在 `useSWR` 的初始化期间，`useHydration` 表示是否为初次加载：

```tsx
let isHydration = true;

export default function useHydration(): boolean {
  useEffect(() => {
    setTimeout(() => {
      isHydration = false;
    }, 1);
  }, []);

  return isHydration;
}
```

### 3.4 支持 suspense

Suspense 分为两块功能：异步加载代码与异步加载数据，现在提到的是异步加载数据相关的能力。

Suspense 要求代码 suspended，即抛出一个可以被捕获的 Promise 异常，在这个 Promise 结束后再渲染组件。

核心代码就这一段，抛出取数的 Promise：

```tsx
throw CONCURRENT_PROMISES[key];
```

等取数完毕后再返回 `useSWR` API 定义的结构：

```tsx
return {
  error: latestError,
  data: latestData,
  revalidate,
  isValidating
};
```

如果没有上面 `throw` 的一步，在取数完毕前组件就会被渲染出来，所以 `throw` 了请求的 Promise 使得这个请求函数支持了 Suspense。

### 3.5 依赖的请求

翻了一下代码，没有找到对循环依赖特别处理的逻辑，**后来看了官方文档才恍然大悟，原来是通过 `try/catch` 并巧妙结合 React 的 UI=f(data) 机制实现依赖取数的。**

看下面这段代码：

```tsx
const { data: user } = useSWR("/api/user");
const { data: projects } = useSWR(() => "/api/projects?uid=" + user.id);
```

怎么做到智能按依赖顺序请求呢？我们看 `useSWR` 取数函数的主体逻辑：

```tsx
const revalidate = useCallback(
  async() => {
    try {
      // 设置 isValidation 为 true
      // 取数、onSuccess 回调
      // 设置 isValidation 为 false
      // 设置缓存
      // unstable_batchedUpdates
    } catch (err) {
      // 撤销取数、缓存等对象
      // 调用 onError回调
    }
  },
  [key]
)

useIsomorphicLayoutEffect(
  ()=>{
    ....
  },
  [key,revalidate,...]
)

```

每次渲染的时候，SWR 会试着执行 `key` 函数（例如 () => "/api/projects?uid=" + user.id)，如果这个函数抛出异常，那么就意味着它的依赖还没有就绪（user === undefined），SWR 将暂停这个数据的请求。在任一数据完成加载时，由于 `setState` 触发重渲染，上述 Hooks 会被重选执行一遍（再次检查数据依赖是否就绪）然后对就绪的数据发起新的一轮请求。

另外对于一些正常请求碰到 error（shouldRetryOnError 默认为 true）的情况下，下次取数的时机是：

```tsx
const count = Math.min(opts.retryCount || 0, 8);
const timeout =
  ~~((Math.random() + 0.5) * (1 << count)) * config.errorRetryInterval;
```

重试时间基本按 2 的指数速度增长。

所以 [swr](https://github.com/zeit/swr) 会优先按照并行方式取数，存在依赖的取数会重试，直到上游 Ready。这种简单的模式稍稍损失了一些性能（没有在上游 Ready 后及时重试下游），但不失为一种巧妙的解法，而且最大化并行也使得大部分场景性能反而比手写的好。

## 4 总结

笔者给仔细阅读本文的同学留下两道思考题：

- 关于 Hooks 取数还是在数据流中取数，你怎么看呢？
- swr 解决依赖取数的方法还有更好的改进办法吗？

> 讨论地址是：[精读《Hooks 取数 - swr 源码》 · Issue #216 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/216)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
