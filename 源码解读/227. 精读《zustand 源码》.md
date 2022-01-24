[zustand](https://github.com/pmndrs/zustand) 是一个非常时髦的状态管理库，也是 2021 年 Star 增长最快的 React 状态管理库。它的理念非常函数式，API 设计的很优雅，值得学习。

## 概述

首先介绍 [zustand](https://github.com/pmndrs/zustand) 的使用方法。

### 创建 store

通过 `create` 函数创建 store，回调可拿到 `get` `set` 就类似 Redux 的 `getState` 与 `setState`，可以获取 store 瞬时值与修改 store。返回一个 hook 可以在 React 组件中访问 store。

```typescript
import create from 'zustand'

const useStore = create((set, get) => ({
  bears: 0,
  increasePopulation: () => set(state => ({ bears: state.bears + 1 })),
  removeAllBears: () => set({ bears: 0 })
}))
```

上面例子是全局唯一的 store，也可以通过 `createContext` 方式创建多实例 store，结合 Provider 使用：

```tsx
import create from 'zustand'
import createContext from 'zustand/context'

const { Provider, useStore } = createContext()

const createStore = () => create(...)

const App = () => (
  <Provider createStore={createStore}>
    ...
  </Provider>
)
```

### 访问 store

通过 `useStore` 在组件中访问 store。与 redux 不同的是，无论普通数据还是函数都可以存在 store 里，且函数也通过 selector 语法获取。因为函数引用不可变，所以实际上下面第二个例子不会引发重渲染：

```typescript
function BearCounter() {
  const bears = useStore(state => state.bears)
  return <h1>{bears} around here ...</h1>
}

function Controls() {
  const increasePopulation = useStore(state => state.increasePopulation)
  return <button onClick={increasePopulation}>one up</button>
}
```

如果嫌访问变量需要调用多次 `useStore` 麻烦，可以自定义 compare 函数返回一个对象：

```typescript
const { nuts, honey } = useStore(state => ({ nuts: state.nuts, honey: state.honey }), shallow)
```

### 细粒度 memo

利用 `useCallback` 甚至可以跳过普通 compare，而仅关心外部 id 值的变化，如：

```typescript
const fruit = useStore(useCallback(state => state.fruits[id], [id]))
```

原理是 id 变化时，`useCallback` 返回值才会变化，而 `useCallback` 返回值如果不变，`useStore` 的 compare 函数引用对比就会为 `true`，非常巧妙。

### set 合并与覆盖

`set` 函数第二个参数默认为 `false`，即合并值而非覆盖整个 store，所以可以利用这个特性清空 store：

```typescript
const useStore = create(set => ({
  salmon: 1,
  tuna: 2,
  deleteEverything: () => set({ }, true), // clears the entire store, actions included
}))
```

### 异步

所有函数都支持异步，因为修改 store 并不依赖返回值，而是调用 `set`，所以是否异步对数据流框架来说都一样。

### 监听指定变量

还是用英文比较表意，即 `subscribeWithSelector`，这个中间件可以让我们把 selector 用在 subscribe 函数上，相比于 redux 传统的 subscribe，就可以有针对性的监听了：

```typescript
import { subscribeWithSelector } from 'zustand/middleware'
const useStore = create(subscribeWithSelector(() => ({ paw: true, snout: true, fur: true })))

// Listening to selected changes, in this case when "paw" changes
const unsub2 = useStore.subscribe(state => state.paw, console.log)
// Subscribe also exposes the previous value
const unsub3 = useStore.subscribe(state => state.paw, (paw, previousPaw) => console.log(paw, previousPaw))
// Subscribe also supports an optional equality function
const unsub4 = useStore.subscribe(state => [state.paw, state.fur], console.log, { equalityFn: shallow })
// Subscribe and fire immediately
const unsub5 = useStore.subscribe(state => state.paw, console.log, { fireImmediately: true })
```

后面还有一些结合中间件、immer、localstorage、redux like、devtools、combime store 就不细说了，都是一些细节场景。值得一提的是，所有特性都是正交的。

## 精读

其实大部分使用特性都在利用 React 语法，所以可以说 50% 的特性属于 React 通用特性，只是写在了 [zustand](https://github.com/pmndrs/zustand) 文档里，看上去像是 zustand 的特性，所以这个库真的挺会借力的。

### 创建 store 实例

任何数据流管理工具，都有一个最核心的 store 实例。对 zustand 来说，便是定义在 `vanilla.ts` 文件的 `createStore` 了。

`createStore` 返回一个类似 redux store 的数据管理实例，拥有四个非常常见的 API：

```typescript
export type StoreApi<T extends State> = {
  setState: SetState<T>
  getState: GetState<T>
  subscribe: Subscribe<T>
  destroy: Destroy
}
```

首先 `getState` 的实现：

```typescript
const getState: GetState<TState> = () => state
```

就是这么简单粗暴。再看 `state`，就是一个普通对象：

```typescript
let state: TState
```

这就是数据流简单的一面，没有魔法，数据存储用一个普通对象，仅此而已。

接着看 `setState`，它做了两件事，修改 `state` 并执行 `listenser`：

```typescript
const setState: SetState<TState> = (partial, replace) => {
  const nextState = typeof partial === 'function' ? partial(state) : partial
  if (nextState !== state) {
    const previousState = state
    state = replace ? (nextState as TState) : Object.assign({}, state, nextState)
    listeners.forEach((listener) => listener(state, previousState))
  }
}
```

修改 `state` 也非常简单，唯一重要的是 `listener(state, previousState)`，那么这些 `listeners` 是什么时候注册和声明的呢？其实 `listeners` 就是一个 Set 对象：

```typescript
const listeners: Set<StateListener<TState>> = new Set()
```

注册和销毁时机分别是 `subscribe` 与 `destroy` 函数调用时，这个实现很简单、高效。对应代码就不贴了，很显然，`subscribe` 时注册的监听函数会作为 `listener` 添加到 `listeners` 队列中，当发生 `setState` 时便会被调用。

最后我们看 `createStore` 的定义与结尾：

```typescript
function createStore(createState) {
  let state: TState
  const setState = /** ... */
  const getState = /** ... */
  /** ... */
  const api = { setState, getState, subscribe, destroy }
  state = createState(setState, getState, api)
  return api
}
```

虽然这个 `state` 是个简单的对象，但回顾使用文档，我们可以在 `create` 创建 store 利用 callback 对 state 赋值，那个时候的 `set`、`get`、`api` 就是上面代码倒数第二行传入的：

```typescript
import { create } from 'zustand'

const useStore = create((set, get) => ({
  bears: 0,
  increasePopulation: () => set(state => ({ bears: state.bears + 1 })),
  removeAllBears: () => set({ bears: 0 })
}))
```

至此，初始化 store 的所有 API 的来龙去脉就梳理清楚了，逻辑简单清晰。

### create 函数的实现

上面我们说清楚了如何创建 store 实例，但这个实例是底层 API，使用文档介绍的 `create` 函数在 `react.ts` 文件定义，并调用了 `createStore` 创建框架无关数据流。之所 `create` 定义在 `react.ts`，是因为返回的 `useStore` 是一个 Hooks，所以本身具有 React 环境特性，因此得名。

该函数第一行就调用 `createStore` 创建基础 store，因为对框架来说是内部 API，所以命名也叫 api：

```typescript
const api: CustomStoreApi = typeof createState === 'function' ? createStore(createState) : createState

const useStore: any = <StateSlice>(
  selector: StateSelector<TState, StateSlice> = api.getState as any,
  equalityFn: EqualityChecker<StateSlice> = Object.is
) => /** ... */
```

接下来所有代码都在创建 `useStore` 这个函数，我们看下其内部实现：

简单来说就是利用 `subscribe` 监听变化，并在需要的时候强制刷新当前组件，并传入最新的 `state` 给到 `useStore`。所以第一步当然是创建 `forceUpdate` 函数:

```typescript
const [, forceUpdate] = useReducer((c) => c + 1, 0) as [never, () => void]
```

然后通过调用 API 拿到 `state` 并传给 selector，并调用 `equalityFn`（这个函数可以被定制）判断状态是否发生了变化：

```typescript
const state = api.getState()
newStateSlice = selector(state)
hasNewStateSlice = !equalityFn(
  currentSliceRef.current as StateSlice,
  newStateSlice
)
```

如果状态变化了，就更新 `currentSliceRef.current`：

```typescript
useIsomorphicLayoutEffect(() => {
  if (hasNewStateSlice) {
    currentSliceRef.current = newStateSlice as StateSlice
  }
  stateRef.current = state
  selectorRef.current = selector
  equalityFnRef.current = equalityFn
  erroredRef.current = false
})
```

> `useIsomorphicLayoutEffect` 是同构框架常用 API 套路，在前端环境是 `useLayoutEffect`，在 node 环境是 `useEffect`：

说明一下 `currentSliceRef` 与 `newStateSlice` 的功能。我们看 `useStore` 最后的返回值：

```typescript
const sliceToReturn = hasNewStateSlice
  ? (newStateSlice as StateSlice)
  : currentSliceRef.current
useDebugValue(sliceToReturn)
return sliceToReturn
```

发现逻辑是这样的：如果 state 变化了，则返回新的 state，否则返回旧的，这样可以保证 compare 函数判断相等时，返回对象的引用完全相同，这个是不可变数据的核心实现。另外我们也可以学习到阅读源码的技巧，即要经常跳读。

那么如何在 selector 变化时更新 store 呢？中间还有一段核心代码，调用了 `subscribe`，相信你已经猜到了，下面是核心代码片段：

```typescript
useIsomorphicLayoutEffect(() => {
  const listener = () => {
    try {
      const nextState = api.getState()
      const nextStateSlice = selectorRef.current(nextState)
      if (!equalityFnRef.current(currentSliceRef.current as StateSlice, nextStateSlice)) {
        stateRef.current = nextState
        currentSliceRef.current = nextStateSlice
        forceUpdate()
      }
    } catch (error) {
      erroredRef.current = true
      forceUpdate()
    }
  }
  const unsubscribe = api.subscribe(listener)
  if (api.getState() !== stateBeforeSubscriptionRef.current) {
    listener() // state has changed before subscription
  }
  return unsubscribe
}, [])
```

这段代码要先从 `api.subscribe(listener)` 看，这使得任何 `setState` 都会触发 `listener` 的执行，而 `listener` 利用 `api.getState()` 拿到最新 `state`，并拿到上一次的 compare 函数 `equalityFnRef` 执行一下判断值前后是否发生了改变，如果改变则更新 `currentSliceRef` 并进行一次强制刷新（调用 `forceUpdate`）。

### context 的实现

注意到 context 语法，可以创建多个互不干扰的 store 实例：

```tsx
import create from 'zustand'
import createContext from 'zustand/context'

const { Provider, useStore } = createContext()

const createStore = () => create(...)

const App = () => (
  <Provider createStore={createStore}>
    ...
  </Provider>
)
```

首先我们知道 `create` 创建的 store 是实例间互不干扰的，问题是 `create` 返回的 `useStore` 只有一个实例，也没有 `<Provider>` 声明作用域，那么如何构造上面的 API 呢？

首先 `Provider` 存储了 `create` 返回的 `useStore`：

```tsx
const storeRef = useRef<TUseBoundStore>()
storeRef.current = createStore()
```

那么 `useStore` 本身其实并不实现数据流功能，而是将 `<Provider>` 提供的 `storeRef` 拿到并返回：

```typescript
const useStore: UseContextStore<TState> = <StateSlice>(
  selector?: StateSelector<TState, StateSlice>,
  equalityFn = Object.is
) => {
  const useProviderStore = useContext(ZustandContext)
  return useProviderStore(
    selector as StateSelector<TState, StateSlice>,
    equalityFn
  )
}
```

所以核心逻辑还是是现在 `create` 函数里，`context.ts` 只是利用 ReactContext 将 `useStore` “注入” 到组件，且利用 ReactContext 特性，这个注入可以存在多个实例，且不会相互影响。

### 中间件

中间件其实不需要怎么实现。比如看这个 redux 中间件的例子：

```typescript
import { redux } from 'zustand/middleware'
const useStore = create(redux(reducer, initialState))
```

可以将 zustand 用法改变为 reducer，实际上是利用了函数式理念，redux 函数本身可以拿到 `set, get, api`，如果想保持 API 不变，则原样返回 callback 就行了，如果想改变用法，则返回特定的结构，就是这么简单。

为了加深理解，我们看看 redux 中间件源码：

```typescript
export const redux = ( reducer, initial ) => ( set, get, api ) => {
  api.dispatch = action => {
    set(state => reducer(state, action), false, action)
    return action
  }
  api.dispatchFromDevtools = true
  return { dispatch: (...a) => api.dispatch(...a), ...initial }
}
```

将 `set, get, api` 封装为 redux API：`dispatch` 本质就是调用 `set`。

## 总结

[zustand](https://github.com/pmndrs/zustand) 是一个实现精巧的 React 数据流管理工具，自身框架无关的分层合理，中间件实现巧妙，值得学习。

> 讨论地址是：[精读《zustand 源码》· Issue #392 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/392)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
