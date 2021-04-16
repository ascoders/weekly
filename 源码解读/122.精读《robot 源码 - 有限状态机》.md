## 1 概述

本期精读的是有限状态机管理工具 [robot](https://github.com/matthewp/robot) 源码。

有限状态机是指有限个数的状态之间相互切换的数学模型，在业务与游戏开发中有限状态都很常见，包括发请求也是一种有限状态机的模型。

笔者将在简介中介绍这个库的使用方式，在精读中介绍实现原理，最后总结在业务中使用的价值。

## 2 简介

这个库的核心就是利用 `createMachine` 创建一个有限状态机：

```typescript
import { createMachine, state, transition } from 'robot3';

const machine = createMachine({
  inactive: state(
    transition('toggle', 'active')
  ),
  active: state(
    transition('toggle', 'inactive')
  )
});

export default machine;
```

如上图所示，我们创建了一个有限状态机 `machine`，包含了两种状态：`inactive` 与 `active`，并且可以通过 `toggle` 动作在两种状态间做切换。

与 React 结合则有 [react-robot](https://github.com/matthewp/react-robot):

```tsx
import { useMachine } from 'react-robot';
import React from 'react';
import machine from './machine'
 
function App() {
  const [current, send] = useMachine(machine);
  
  return (
    <button type="button" onClick={() => send('toggle')}>
      State: {current.name}
    </button>
  )
}
```

通过 `useMachine` 拿到的 `current.name` 表示当前状态值，`send` 用来发送改变状态的指令。

至于为什么要用有限状态机管理工具，官方文档举了个例子 - 点击编辑后进入编辑态，点击保存后返回原始状态的例子：

![](https://img.alicdn.com/tfs/TB16AvLhAL0gK0jSZFAXXcA9pXa-998-96.png)

点击 Edit 按钮后，将进入下图的状态，点击 Save 后如果输入的内容校验通过保存后再回到初始状态：

![](https://img.alicdn.com/tfs/TB1LeYLhpP7gK0jSZFjXXc5aXXa-1013-97.png)

如果不用有限状态机，我们首先会创建两个变量存储是否处于编辑态，以及当前输入文本是什么：

```js
let editMode = false;
let title = '';
```

如果再考虑和后端的交互，就会增加三个状态 - 保存中、校验、保存是否成功：

```js
let editMode = false;
let title = '';
let saving = false;
let validating = false;
let saveHadError = false;
```

就算使用 React、Vue 等框架数据驱动 UI，我们还是免不了对复杂状态进行管理。如果使用有限状态机实现，将是这样的：

```js
import { createMachine, guard, immediate, invoke, state, transition, reduce } from 'robot3';

const machine = createMachine({
  preview: state(
    transition('edit', 'editMode',
      // Save the current title as oldTitle so we can reset later.
      reduce(ctx => ({ ...ctx, oldTitle: ctx.title }))
    )
  ),
  editMode: state(
    transition('input', 'editMode',
      reduce((ctx, ev) => ({ ...ctx, title: ev.target.value }))
    ),
    transition('cancel', 'cancel'),
    transition('save', 'validate')
  ),
  cancel: state(
    immediate('preview',
      // Reset the title back to oldTitle
      reduce(ctx => ({ ...ctx, title: ctx.oldTitle })
    )
  ),
  validate: state(
    // Check if the title is valid. If so go
    // to the save state, otherwise go back to editMode
    immediate('save', guard(titleIsValid)),
    immediate('editMode')
  )
  save: invoke(saveTitle,
    transition('done', 'preview'),
    transition('error', 'error')
  ),
  error: state(
    // Should we provide a retry or...?
  )
});
```

其中 `immediate` 表示直接跳到下一个状态，`reduce` 则可以对状态机内部数据进行拓展。比如 `preview` 返回了 `oldTitle`，那么 `cancle` 时就可以通过 `ctx.oldTitle` 拿到；`invoke` 表示调用第一个函数后，再执行 `state`。

通过上面的代码我们可以看到使用状态机的好处：

1. 状态清晰，先罗列出某个业务逻辑的全部状态，避免遗漏。
2. 状态转换安全。比如 `preview` 只能切换到 `edit` 状态，这样就算在错误的状态发错指令也不会产生异常情况。

## 3 精读

[robot](https://github.com/matthewp/robot) 重要的函数有 `createMachine, state, transition, immediate`，下面一一拆解说明。

### createMachine

[createMachine](https://github.com/matthewp/robot/blob/master/machine.js#L122) 表示创建状态机：

```js
export function createMachine(current, states, contextFn = empty) {
  if(typeof current !== 'string') {
    contextFn = states || empty;
    states = current;
    current = Object.keys(states)[0];
  }
  if(d._create) d._create(current, states);
  return create(machine, {
    context: valueEnumerable(contextFn),
    current: valueEnumerable(current),
    states: valueEnumerable(states)
  });
}
```

可以看到，如果传递了一个对象，通过 `Object.keys(states)[0]` 拿到第一个状态作为当前状态（标记在 `current`），最终将保存三个属性：

- `context` 当前状态机内部属性，初始化是空的。
- `current` 当前状态。
- `states` 所有状态，也就是 `createMachine` 传递的第一个参数。

再看 `create` 函数：

```js
let create = (a, b) => Object.freeze(Object.create(a, b));
```

也就是创建了一个不修改的对象作为状态机。

这个是 `machine` 对象：

```js
let machine = {
  get state() {
    return {
      name: this.current,
      value: this.states[this.current]
    };
  }
};
```

也就是说，状态机内部的状态管理是通过对象完成的，并提供了 `state()` 函数拿到当前的状态名和状态值。

### state

[state](https://github.com/matthewp/robot/blob/master/machine.js#L70) 用来描述状态支持哪些转换：

```js
export function state(...args) {
  let transitions = filter(transitionType, args);
  let immediates = filter(immediateType, args);
  let desc = {
    final: valueEnumerable(args.length === 0),
    transitions: valueEnumerable(transitionsToMap(transitions))
  };
  if(immediates.length) {
    desc.immediates = valueEnumerable(immediates);
    desc.enter = valueEnumerable(enterImmediate);
  }
  return create(stateType, desc);
}
```

`transitions` 与 `immediates` 表示从 `args` 里拿到 `transition` 或 `immediate` 的结果。

方法是通过如下方式定义 `transition` 与 `immediate`:

```js
export let transition = makeTransition.bind(transitionType);
export let immediate = makeTransition.bind(immediateType, null);

function filter(Type, arr) {
  return arr.filter(value => Type.isPrototypeOf(value));
}
```

**那么如果一个函数是通过 `immediate` 创建的，就可以通过 `immediateType.isPrototypeOf()` 的校验，此方法适用范围很广，在任何库里都可以用来校验拿到对应函数创建的对象。**

如果参数数量为 0，表示这个状态是最终态，无法进行转换。**最后通过 `create` 创建一个对象，这个对象就是状态的值**。

### transition

[transition](https://github.com/matthewp/robot/blob/master/machine.js#L53) 是写在 `state` 中描述当前状态可以如何变换的函数，其实际函数是 `makeTransistion`:

```js
function makeTransition(from, to, ...args) {
  let guards = stack(filter(guardType, args).map(t => t.fn), truthy, callBoth);
  let reducers = stack(filter(reduceType, args).map(t => t.fn), identity, callForward);
  return create(this, {
    from: valueEnumerable(from),
    to: valueEnumerable(to),
    guards: valueEnumerable(guards),
    reducers: valueEnumerable(reducers)
  });
}
```

由于：

```js
export let transition = makeTransition.bind(transitionType);
export let immediate = makeTransition.bind(immediateType, null);
```

可见 `from` 为 `null` 即表示立即转换到状态 `to`。`transition` 最终返回一个对象，其中 `guards` 是从 `transition` 或 `immediate` 参数中找到的，由 `guards` 函数创建的对象，当这个对象回调函数执行成功时此状态才生效。

`...args` 对应 `transition('toggle', 'active')` 或 `immediate('save', guard(titleIsValid))`，而 `stack(filter(guardType, args).map(t => t.fn), truthy, callBoth)` 这句话就是从 `...args` 中寻找是否有 `guards`，`reducers` 同理。

最后看看状态是如何改变的，设置状态改变的函数是 [transitionTo](https://github.com/matthewp/robot/blob/master/machine.js#L136):

```js
function transitionTo(service, fromEvent, candidates) {
  let { machine, context } = service;
  for(let { to, guards, reducers } of candidates) {  
    if(guards(context)) {
      service.context = reducers.call(service, context, fromEvent);

      let original = machine.original || machine;
      let newMachine = create(original, {
        current: valueEnumerable(to),
        original: { value: original }
      });

      let state = newMachine.state.value;
      return state.enter(newMachine, service, fromEvent);
    }
  }
}
```

可以看到，如果存在 `guards`，则需要在 `guards` 执行返回成功时才可以正确改变状态。同时 `reducers` 可以修改 `context` 也在 `service.context = reducers.call(service, context, fromEvent);` 这一行体现了出来。最后通过生成一个新的状态机，并将 `current` 标记为 `to`。

最后我们看 `state.enter` 这个函数，这个函数在 [state](https://github.com/matthewp/robot/blob/master/machine.js#L79) 函数中有定义，其本质是继承了 `stateType`:

```js
let stateType = { enter: identity };
```

而 `identity` 这个函数就是立即执行函数：

```js
let identity = a => a;
```

因此相当于返回了新的状态机。

## 4 总结

有限状态机相比普通业务描述，其实是增加了一些状态间转化的约束来达到优化状态管理的目的，并且状态描述也会更规范一些，在业务中具有一定的实用性。

当然并不是所有业务都适用有限状态机，因为新框架还是有一些学习成本要考虑。最后通过源码的学习，我们又了解到一些新的框架级小技巧，可以灵活应用到自己的框架中。

> 讨论地址是：[精读《robot 源码 - 有限状态机》 · Issue #209 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/209)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
