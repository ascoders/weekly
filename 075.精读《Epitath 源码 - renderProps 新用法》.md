## 1 引言

很高兴这一期的话题是由 [epitath](https://github.com/Astrocoders/epitath) 的作者 [grsabreu](https://github.com/grsabreu) 提供的。

前端发展了 20 多年，随着发展中国家越来越多的互联网从业者涌入，现在前端知识玲琅满足，概念、库也越来越多。虽然内容越来越多，但作为个体的你的时间并没有增多，如何持续学习新知识，学什么将会是个大问题。

前端精读通过吸引优质的用户，提供最前沿的话题或者设计理念，虽然每周一篇文章不足以概括这一周的所有焦点，但可以保证你阅读的这十几分钟没有在浪费时间，每一篇精读都是经过精心筛选的，我们既讨论大家关注的焦点，也能找到仓库角落被遗忘的珍珠。

## 2 概述

在介绍 Epitath 之前，先介绍一下 renderProps。

renderProps 是 jsx 的一种实践方式，renderProps 组件并不渲染 dom，但提供了持久化数据与回调函数帮助减少对当前组件 state 的依赖。

### RenderProps 的概念

[react-powerplug](https://github.com/renatorib/react-powerplug) 就是一个 renderProps 工具库，我们看看可以做些什么：

```jsx
<Toggle initial={true}>
  {({ on, toggle }) => <Checkbox checked={on} onChange={toggle} />}
</Toggle>
```

`Toggle` 就是一个 renderProps 组件，它可以帮助控制受控组件。比如仅仅利用 `Toggle`，我们可以大大简化 `Modal` 组件的使用方式：

```jsx
class App extends React.Component {
  state = { visible: false };

  showModal = () => {
    this.setState({
      visible: true
    });
  };

  handleOk = e => {
    this.setState({
      visible: false
    });
  };

  handleCancel = e => {
    this.setState({
      visible: false
    });
  };

  render() {
    return (
      <div>
        <Button type="primary" onClick={this.showModal}>
          Open Modal
        </Button>
        <Modal
          title="Basic Modal"
          visible={this.state.visible}
          onOk={this.handleOk}
          onCancel={this.handleCancel}
        >
          <p>Some contents...</p>
          <p>Some contents...</p>
          <p>Some contents...</p>
        </Modal>
      </div>
    );
  }
}

ReactDOM.render(<App />, mountNode);
```

这是 Modal 标准代码，我们可以使用 `Toggle` 简化为：

```jsx
class App extends React.Component {
  render() {
    return (
      <Toggle initial={false}>
        {({ on, toggle }) => (
          <Button type="primary" onClick={toggle}>
            Open Modal
          </Button>
          <Modal
            title="Basic Modal"
            visible={on}
            onOk={toggle}
            onCancel={toggle}
          >
            <p>Some contents...</p>
            <p>Some contents...</p>
            <p>Some contents...</p>
          </Modal>
        )}
      </Toggle>
    );
  }
}

ReactDOM.render(<App />, mountNode);
```

省掉了 state、一堆回调函数，而且代码更简洁，更语义化。

> renderProps 内部管理的状态不方便从外部获取，因此只适合保存业务无关的数据，比如 Modal 显隐。

### RenderProps 嵌套问题的解法

renderProps 虽然好用，但当我们想组合使用时，可能会遇到层层嵌套的问题：

```jsx
<Counter initial={5}>
  {counter => {
    <Toggle initial={false}>
      {toggle => {
        <MyComponent counter={counter.count} toggle={toggle.on} />;
      }}
    </Toggle>;
  }}
</Counter>
```

因此 react-powerplugin 提供了 compose 函数，帮助聚合 renderProps 组件：

```jsx
import { compose } from 'react-powerplug'

const ToggleCounter = compose(
  <Counter initial={5} />,
  <Toggle initial={false} />
)

<ToggleCounter>
  {(toggle, counter) => (
    <ProductCard {...} />
  )}
</ToggleCounter>
```

### 使用 Epitath 解决嵌套问题

Epitath 提供了一种新方式解决这个嵌套的问题：

```jsx
const App = epitath(function*() {
  const { count } = yield <Counter />
  const { on } = yield <Toggle />

  return (
    <MyComponent counter={count} toggle={on} />
  )
})

<App />
```

renderProps 方案与 Epitath 方案，可以类比为 回调 方案与 `async/await` 方案。Epitath 和 `compose` 都解决了 renderProps 可能带来的嵌套问题，而 `compose` 是通过将多个 renderProps merge 为一个，而 Epitath 的方案更接近 `async/await` 的思路，利用 `generator` 实现了伪同步代码。

## 3 精读

Epitath 源码一共 40 行，我们分析一下其精妙的方式。

下面是 Epitath 完整的源码：

```jsx
import React from "react";
import immutagen from "immutagen";

const compose = ({ next, value }) =>
  next
    ? React.cloneElement(value, null, values => compose(next(values)))
    : value;

export default Component => {
  const original = Component.prototype.render;
  const displayName = `EpitathContainer(${Component.displayName ||
    "anonymous"})`;

  if (!original) {
    const generator = immutagen(Component);

    return Object.assign(
      function Epitath(props) {
        return compose(generator(props));
      },
      { displayName }
    );
  }

  Component.prototype.render = function render() {
    // Since we are calling a new function to be called from here instead of
    // from a component class, we need to ensure that the render method is
    // invoked against `this`. We only need to do this binding and creation of
    // this function once, so we cache it by adding it as a property to this
    // new render method which avoids keeping the generator outside of this
    // method's scope.
    if (!render.generator) {
      render.generator = immutagen(original.bind(this));
    }

    return compose(render.generator(this.props));
  };

  return class EpitathContainer extends React.Component {
    static displayName = displayName;
    render() {
      return <Component {...this.props} />;
    }
  };
};
```

### immutagen

immutagen 是一个 immutable `generator` 辅助库，每次调用 `.next` 都会生成一个新的引用，而不是自己发生 mutable 改变：

```javascript
import immutagen from "immutagen";

const gen = immutagen(function*() {
  yield 1;
  yield 2;
  return 3;
})(); // { value: 1, next: [function] }

gen.next(); // { value: 2, next: [function] }
gen.next(); // { value: 2, next: [function] }

gen.next().next(); // { value: 3, next: undefined }
```

### compose

看到 compose 函数就基本明白其实现思路了：

```javascript
const compose = ({ next, value }) =>
  next
    ? React.cloneElement(value, null, values => compose(next(values)))
    : value;
```

```javascript
const App = epitath(function*() {
  const { count } = yield <Counter />;
  const { on } = yield <Toggle />;
});
```

通过 immutagen，依次调用 `next`，生成新组件，且下一个组件是上一个组件的子组件，因此会产生下面的效果：

```plain
yield <A>
yield <B>
yield <C>
// 等价于
<A>
  <B>
    <C />
  </B>
</A>
```

到此其源码精髓已经解析完了。

### 存在的问题

[crimx](https://github.com/crimx) 在讨论中提到，Epitath 方案存在的最大问题是，每次 `render` 都会生成全新的组件，这对内存是一种挑战。

稍微解释一下，无论是通过 原生的 renderProps 还是 `compose`，同一个组件实例只生成一次，React 内部会持久化这些组件实例。而 [immutagen](https://github.com/pelotom/immutagen) 在运行时每次执行渲染，都会生成不可变数据，也就是全新的引用，这会导致废弃的引用存在大量 GC 压力，同时 React 每次拿到的组件都是全新的，虽然功能相同。

## 4 总结

[epitath](https://github.com/Astrocoders/epitath) 巧妙的利用了 [immutagen](https://github.com/pelotom/immutagen) 的不可变 `generator` 的特性来生成组件，并且在递归 `.next` 时，将顺序代码解析为嵌套代码，有效解决了 renderProps 嵌套问题。

喜欢 [epitath](https://github.com/Astrocoders/epitath) 的同学赶快入手吧！同时我们也看到 `generator` 手动的步骤控制带来的威力，这是 `async/await` 完全无法做到的。

是否可以利用 [immutagen](https://github.com/pelotom/immutagen) 解决 React Context 与组件相互嵌套问题呢？还有哪些其他前端功能可以利用 immutagen 简化的呢？欢迎加入讨论。

## 5 更多讨论

> 讨论地址是：[精读《Epitath - renderProps 新用法》 · Issue #106 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/106)

**如果你想参与讨论，请[点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**
