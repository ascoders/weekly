## 1 引言

[unstated](https://github.com/jamiebuilds/unstated) 是基于 Class Component 的数据流管理库，[unstated-next](https://github.com/jamiebuilds/unstated-next) 是针对 Function Component 的升级版，且特别优化了对 Hooks 的支持。

与类 redux 库相比，这个库设计的别出心裁，而且这两个库源码行数都特别少，与 180 行的 unstated 相比，unstated-next 只有不到 40 行，但想象空间却更大，且用法符合直觉，所以本周精读就会从用法与源码两个角度分析这两个库。

## 2 概述

**首先问，什么是数据流？React 本身就提供了数据流，那就是 `setState` 与 `useState`，数据流框架存在的意义是解决跨组件数据共享与业务模型封装。**

还有一种说法是，React 早期声称自己是 UI 框架，不关心数据，因此需要生态提供数据流插件弥补这个能力。但其实 React 提供的 `createContext` 与 `useContext` 已经能解决这个问题，只是使用起来稍显麻烦，而 unstated 系列就是为了解决这个问题。

### unstated

unstated 解决的是 Class Component 场景下组件数据共享的问题。

相比直接抛出用法，笔者还原一下作者的思考过程：利用原生 `createContext` 实现数据流需要两个 UI 组件，且实现方式冗长：

```jsx
const Amount = React.createContext(1);

class Counter extends React.Component {
  state = { count: 0 };
  increment = amount => {
    this.setState({ count: this.state.count + amount });
  };
  decrement = amount => {
    this.setState({ count: this.state.count - amount });
  };
  render() {
    return (
      <Amount.Consumer>
        {amount => (
          <div>
            <span>{this.state.count}</span>
            <button onClick={() => this.decrement(amount)}>-</button>
            <button onClick={() => this.increment(amount)}>+</button>
          </div>
        )}
      </Amount.Consumer>
    );
  }
}

class AmountAdjuster extends React.Component {
  state = { amount: 0 };
  handleChange = event => {
    this.setState({
      amount: parseInt(event.currentTarget.value, 10)
    });
  };
  render() {
    return (
      <Amount.Provider value={this.state.amount}>
        <div>
          {this.props.children}
          <input
            type="number"
            value={this.state.amount}
            onChange={this.handleChange}
          />
        </div>
      </Amount.Provider>
    );
  }
}

render(
  <AmountAdjuster>
    <Counter />
  </AmountAdjuster>
);
```

而我们要做的，**是将 `setState` 从具体的某个 UI 组件上剥离，形成一个数据对象实体，可以被注入到任何组件。**

这就是 `unstated` 的使用方式：

```jsx
import React from "react";
import { render } from "react-dom";
import { Provider, Subscribe, Container } from "unstated";

class CounterContainer extends Container {
  state = {
    count: 0
  };

  increment() {
    this.setState({ count: this.state.count + 1 });
  }

  decrement() {
    this.setState({ count: this.state.count - 1 });
  }
}

function Counter() {
  return (
    <Subscribe to={[CounterContainer]}>
      {counter => (
        <div>
          <button onClick={() => counter.decrement()}>-</button>
          <span>{counter.state.count}</span>
          <button onClick={() => counter.increment()}>+</button>
        </div>
      )}
    </Subscribe>
  );
}

render(
  <Provider>
    <Counter />
  </Provider>,
  document.getElementById("root")
);
```

首先要为 `Provider` 正名：`Provider` 是解决单例 Store 的最佳方案，当项目与组件都是用了数据流，需要分离作用域时，`Provider` 便派上了用场。如果项目仅需单 Store 数据流，那么与根节点放一个 `Provider` 等价。

其次 `CounterContainer` 成为一个真正数据处理类，只负责存储与操作数据，通过 `<Subscribe to={[CounterContainer]}>` RenderProps 方法将 `counter` 注入到 Render 函数中。

**unstated 方案本质上利用了 `setState`，但将 `setState` 与 UI 剥离，并可以很方便的注入到任何组件中。**

类似的是，其升级版 `unstated-next` 本质上利用了 `useState`，利用了自定义 Hooks 可以与 UI 分离的特性，加上 `useContext` 的便捷性，利用不到 40 行代码实现了比 `unstated` 更强大的功能。

### unstated-next

`unstated-next` 用 40 行代码号称 React 数据管理库的终结版，让我们看看它是怎么做到的！

还是从思考过程说起，笔者发现其 README 也提供了对应思考过程，就以其 README 里的代码作为案例。

首先，使用 Function Component 的你会这样使用数据流：

```jsx
function CounterDisplay() {
  let [count, setCount] = useState(0);
  let decrement = () => setCount(count - 1);
  let increment = () => setCount(count + 1);
  return (
    <div>
      <button onClick={decrement}>-</button>
      <p>You clicked {count} times</p>
      <button onClick={increment}>+</button>
    </div>
  );
}
```

如果想将数据与 UI 分离，利用 Custom Hooks 就可以完成，这不需要借助任何框架：

```jsx
function useCounter() {
  let [count, setCount] = useState(0);
  let decrement = () => setCount(count - 1);
  let increment = () => setCount(count + 1);
  return { count, decrement, increment };
}

function CounterDisplay() {
  let counter = useCounter();
  return (
    <div>
      <button onClick={counter.decrement}>-</button>
      <p>You clicked {counter.count} times</p>
      <button onClick={counter.increment}>+</button>
    </div>
  );
}
```

如果想将这个数据分享给其他组件，利用 `useContext` 就可以完成，这不需要借助任何框架：

```jsx
function useCounter() {
  let [count, setCount] = useState(0);
  let decrement = () => setCount(count - 1);
  let increment = () => setCount(count + 1);
  return { count, decrement, increment };
}

let Counter = createContext(null);

function CounterDisplay() {
  let counter = useContext(Counter);
  return (
    <div>
      <button onClick={counter.decrement}>-</button>
      <p>You clicked {counter.count} times</p>
      <button onClick={counter.increment}>+</button>
    </div>
  );
}

function App() {
  let counter = useCounter();
  return (
    <Counter.Provider value={counter}>
      <CounterDisplay />
      <CounterDisplay />
    </Counter.Provider>
  );
}
```

但这样还是显示使用了 `useContext` 的 API，并且对 `Provider` 的封装没有形成固定模式，这就是 `usestated-next` 要解决的问题。

所以这就是 `unstated-next` 的使用方式：

```jsx
import { createContainer } from "unstated-next";

function useCounter() {
  let [count, setCount] = useState(0);
  let decrement = () => setCount(count - 1);
  let increment = () => setCount(count + 1);
  return { count, decrement, increment };
}

let Counter = createContainer(useCounter);

function CounterDisplay() {
  let counter = Counter.useContainer();
  return (
    <div>
      <button onClick={counter.decrement}>-</button>
      <p>You clicked {counter.count} times</p>
      <button onClick={counter.increment}>+</button>
    </div>
  );
}

function App() {
  return (
    <Counter.Provider>
      <CounterDisplay />
      <CounterDisplay />
    </Counter.Provider>
  );
}
```

可以看到，`createContainer` 可以将任何 Hooks 包装成一个数据对象，这个对象有 `Provider` 与 `useContainer` 两个 API，其中 `Provider` 用于对某个作用域注入数据，而 `useContainer` 可以取到这个数据对象在当前作用域的实例。

对 Hooks 的参数也进行了规范化，我们可以通过 `initialState` 设定初始化数据，且不同作用域可以嵌套并赋予不同的初始化值：

```jsx
function useCounter(initialState = 0) {
  let [count, setCount] = useState(initialState);
  let decrement = () => setCount(count - 1);
  let increment = () => setCount(count + 1);
  return { count, decrement, increment };
}

const Counter = createContainer(useCounter);

function CounterDisplay() {
  let counter = Counter.useContainer();
  return (
    <div>
      <button onClick={counter.decrement}>-</button>
      <span>{counter.count}</span>
      <button onClick={counter.increment}>+</button>
    </div>
  );
}

function App() {
  return (
    <Counter.Provider>
      <CounterDisplay />
      <Counter.Provider initialState={2}>
        <div>
          <div>
            <CounterDisplay />
          </div>
        </div>
      </Counter.Provider>
    </Counter.Provider>
  );
}
```

**可以看到，React Hooks 已经非常适合做状态管理，而生态应该做的事情是尽可能利用其能力进行模式化封装。**

> 有人可能会问，取数和副作用怎么办？`redux-saga` 和其他中间件都没有，这个数据流是不是阉割版？

首先我们看 Redux 为什么需要处理副作用的中间件。这是因为 `reducer` 是一个同步纯函数，其返回值就是操作结果中间不能有异步，且不能有副作用，所以我们需要一种异步调用 `dispatch` 的方法，或者一个副作用函数来存放这些 “脏” 逻辑。

而在 Hooks 中，我们可以随时调用 `useState` 提供的 `setter` 函数修改值，这早已天然解决了 `reducer` 无法异步的问题，同时也实现了 `redux-chunk` 的功能。

而异步功能也被 `useEffect` 这个 React 官方 Hook 替代。**我们看到这个方案可以利用 React 官方提供的能力完全覆盖 Redux 中间件的能力，对 Redux 库实现了降维打击，所以下一代数据流方案随着 Hooks 的实现是真的存在的**。

最后，相比 Redux 自身以及其生态库的理解成本（笔者不才，初学 Redux 以及其周边 middleware 时理解了好久），Hooks 的理解学习成本明显更小。

**很多时候，人们排斥一个新技术，并不是因为新技术不好，而是这可能让自己多年精通的老手艺带来的 “竞争优势” 完全消失。可能一个织布老专家手工织布效率是入门学员的 5 倍，但换上织布机器后，这个差异很快会被抹平，老织布专家面临被淘汰的危机，所以维护这份老手艺就是维护他自己的利益。希望每个团队中的老织布工人都能主动引入织布机。**

> 再看取数中间件，我们一般需要解决 **取数业务逻辑封装** 与 **取数状态封装**，通过 redux 中间件可以封装在内，通过一个 `dispatch` 解决。

其实 Hooks 思维下，利用 [swr](<[swr](https://github.com/dt-fe/weekly/blob/v2/128.%E7%B2%BE%E8%AF%BB%E3%80%8AHooks%20%E5%8F%96%E6%95%B0%20-%20swr%20%E6%BA%90%E7%A0%81%E3%80%8B.md)>) `useSWR` 一样能解决：

```jsx
function Profile() {
  const { data, error } = useSWR("/api/user");
}
```

取数的业务逻辑封装在 `fetcher` 中，这个在 `SWRConfigContext.Provider` 时就已注入，还可以控制作用域！完全利用 React 提供的 Context 能力，可以感受到实现底层原理的一致性和简洁性，越简单越优美的数学公式越可能是真理。

而取数状态已经封装在 `useSWR` 中，配合 Suspense 能力，连 Loading 状态都不用关心了。

## 3 精读

### unstated

我们再梳理一下 `unstated` 这个库做了哪些事情。

1. 利用 `Provider` 申明作用范围。
2. 提供 `Container` 作为可以被继承的类，继承它的 Class 作为 Store。
3. 提供 `Subscribe` 作为 RenderProps 用法注入 Store，注入的 Store 实例由参数 `to` 接收到的 Class 实例决定。

对于第一点，`Provider` 在 Class Component 环境下要初始化 `StateContext`，这样才能在 `Subscribe` 中使用：

```jsx
const StateContext = createReactContext(null);

export function Provider(props) {
  return (
    <StateContext.Consumer>
      {parentMap => {
        let childMap = new Map(parentMap);

        if (props.inject) {
          props.inject.forEach(instance => {
            childMap.set(instance.constructor, instance);
          });
        }

        return (
          <StateContext.Provider value={childMap}>
            {props.children}
          </StateContext.Provider>
        );
      }}
    </StateContext.Consumer>
  );
}
```

对于第二点，对于 `Container`，需要提供给 Store `setState` API，按照 React 的 `setState` 结构实现了一遍。

值得注意的是，还存储了一个 `_listeners` 对象，并且可通过 `subscribe` 与 `unsubscribe` 增删。

`_listeners` 存储的其实是当前绑定的组件 `onUpdate` 生命周期，然后在 `setState` 时主动触发对应组件的渲染。`onUpdate` 生命周期由 `Subscribe` 函数提供，最终调用的是 `this.setState`，这个在 `Subscribe` 部分再说明。

以下是 `Container` 的代码实现：

```jsx
export class Container<State: {}> {
  state: State;
  _listeners: Array<Listener> = [];

  constructor() {
    CONTAINER_DEBUG_CALLBACKS.forEach(cb => cb(this));
  }

  setState(
    updater: $Shape<State> | ((prevState: $Shape<State>) => $Shape<State>),
    callback?: () => void
  ): Promise<void> {
    return Promise.resolve().then(() => {
      let nextState;

      if (typeof updater === "function") {
        nextState = updater(this.state);
      } else {
        nextState = updater;
      }

      if (nextState == null) {
        if (callback) callback();
        return;
      }

      this.state = Object.assign({}, this.state, nextState);

      let promises = this._listeners.map(listener => listener());

      return Promise.all(promises).then(() => {
        if (callback) {
          return callback();
        }
      });
    });
  }

  subscribe(fn: Listener) {
    this._listeners.push(fn);
  }

  unsubscribe(fn: Listener) {
    this._listeners = this._listeners.filter(f => f !== fn);
  }
}
```

对于第三点，`Subscribe` 的 `render` 函数将 `this.props.children` 作为一个函数执行，并把对应的 Store 实例作为参数传递，这通过 `_createInstances` 函数实现。

`_createInstances` 利用 `instanceof` 通过 Class 类找到对应的实例，并通过 `subscribe` 将自己组件的 `onUpdate` 函数传递给对应 Store 的 `_listeners`，在解除绑定时调用 `unsubscribe` 解绑，防止不必要的 renrender。

以下是 `Subscribe` 源码：

```jsx
export class Subscribe<Containers: ContainersType> extends React.Component<
  SubscribeProps<Containers>,
  SubscribeState
> {
  state = {};
  instances: Array<ContainerType> = [];
  unmounted = false;

  componentWillUnmount() {
    this.unmounted = true;
    this._unsubscribe();
  }

  _unsubscribe() {
    this.instances.forEach(container => {
      container.unsubscribe(this.onUpdate);
    });
  }

  onUpdate: Listener = () => {
    return new Promise(resolve => {
      if (!this.unmounted) {
        this.setState(DUMMY_STATE, resolve);
      } else {
        resolve();
      }
    });
  };

  _createInstances(
    map: ContainerMapType | null,
    containers: ContainersType
  ): Array<ContainerType> {
    this._unsubscribe();

    if (map === null) {
      throw new Error(
        "You must wrap your <Subscribe> components with a <Provider>"
      );
    }

    let safeMap = map;
    let instances = containers.map(ContainerItem => {
      let instance;

      if (
        typeof ContainerItem === "object" &&
        ContainerItem instanceof Container
      ) {
        instance = ContainerItem;
      } else {
        instance = safeMap.get(ContainerItem);

        if (!instance) {
          instance = new ContainerItem();
          safeMap.set(ContainerItem, instance);
        }
      }

      instance.unsubscribe(this.onUpdate);
      instance.subscribe(this.onUpdate);

      return instance;
    });

    this.instances = instances;
    return instances;
  }

  render() {
    return (
      <StateContext.Consumer>
        {map =>
          this.props.children.apply(
            null,
            this._createInstances(map, this.props.to)
          )
        }
      </StateContext.Consumer>
    );
  }
}
```

总结下来，`unstated` 将 State 外置是通过自定义 Listener 实现的，在 Store `setState` 时触发收集好的 `Subscribe` 组件的 rerender。

### unstated-next

`unstated-next` 这个库只做了一件事情：

1. 提供 `createContainer` 将自定义 Hooks 封装为一个数据对象，提供 `Provider` 注入与 `useContainer` 获取 Store 这两个方法。

正如之前解析所说，`unstated-next` 可谓将 Hooks 用到了极致，认为 Hooks 已经完全具备数据流管理的全部能力，我们只要包装一层规范即可：

```jsx
export function createContainer(useHook) {
  let Context = React.createContext(null);

  function Provider(props) {
    let value = useHook(props.initialState);
    return <Context.Provider value={value}>{props.children}</Context.Provider>;
  }

  function useContainer() {
    let value = React.useContext(Context);
    if (value === null) {
      throw new Error("Component must be wrapped with <Container.Provider>");
    }
    return value;
  }

  return { Provider, useContainer };
}
```

可见，`Provider` 就是对 `value` 进行了约束，**固化了 Hooks 返回的 value 直接作为 `value` 传递给 `Context.Provider` 这个规范。**

而 `useContainer` 就是对 `React.useContext(Context)` 的封装。

真的没有其他逻辑了。

唯一需要思考的是，在自定义 Hooks 中，我们用 `useState` 管理数据还是 `useReducer` 管理数据的问题，这个是个仁者见仁的问题。不过我们可以对自定义 Hooks 进行嵌套封装，支持一些更复杂的数据场景，比如：

```jsx
function useCounter(initialState = 0) {
  const [count, setCount] = useState(initialState);
  const decrement = () => setCount(count - 1);
  const increment = () => setCount(count + 1);
  return { count, decrement, increment };
}

function useUser(initialState = {}) {
  const [name, setName] = useState(initialState.name);
  const [age, setAge] = useState(initialState.age);
  const registerUser = userInfo => {
    setName(userInfo.name);
    setAge(userInfo.age);
  };
  return { user: { name, age }, registerUser };
}

function useApp(initialState) {
  const { count, decrement, increment } = useCounter(initialState.count);
  const { user, registerUser } = useUser(initialState.user);
  return { count, decrement, increment, user, registerUser };
}

const App = createContainer(useApp);
```

## 4 总结

借用 `unstated-next` 的标语：“never think about React state management libraries ever again” - 用了 `unstated-next` 再也不要考虑其他 React 状态管理库了。

而有意思的是，`unstated-next` 本身也只是对 Hooks 的一种模式化封装，Hooks 已经能很好解决状态管理的问题，我们真的不需要 “再造” React 数据流工具了。

> 讨论地址是：[精读《unstated 与 unstated-next 源码》 · Issue #218 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/218)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
