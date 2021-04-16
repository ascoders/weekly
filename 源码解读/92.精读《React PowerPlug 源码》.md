# 1. 引言

[React PowerPlug](https://github.com/renatorib/react-powerplug) 是利用 render props 进行更好状态管理的工具库。

React 项目中，一般一个文件就是一个类，状态最细粒度就是文件的粒度。**然而文件粒度并非状态管理最合适的粒度，所以有了 Redux 之类的全局状态库。**

**同样，文件粒度也并非状态管理的最细粒度，更细的粒度或许更合适，因此有了 React PowerPlug。**

比如你会在项目中看到这种眼花缭乱的 `state`:

```typescript
class App extends React.PureComponent {
  state = {
    name: 1,
    isLoading: false,
    isFetchUser: false,
    data: {},
    disableInput: false,
    validate: false,
    monacoInputValue: "",
    value: ""
  };

  render() {
    /**/
  }
}
```

其实真正 `App` 级别的状态并没有那么多，很多 **诸如受控组件 `onChange` 临时保存的无意义 Value 找不到合适的地方存储。**

这时候可以用 `Value` 管理局部状态：

```tsx
<Value initial="React">
  {({ value, set, reset }) => (
    <>
      <Select
        label="Choose one"
        options={["React", "Preact", "Vue"]}
        value={value}
        onChange={set}
      />
      <Button onClick={reset}>Reset to initial</Button>
    </>
  )}
</Value>
```

可以看到，这个问题本质上应该拆成新的 React 类解决，但这也许会导致项目结构更混乱，因此 RenderProps 还是必不可少的。

今天我们就来解读一下 React PowerPlug 的源码。

# 2. 精读

## 2.1. Value

这是一个值操作的工具，功能与 Hooks 中 `useState` 类似，不过多了一个 `reset` 功能（Hooks 其实也未尝不能有，但 Hooks 确实没有 Reset）。

### 用法

```tsx
<Value initial="React">
  {({ value, set, reset }) => (
    <>
      <Select
        label="Choose one"
        options={["React", "Preact", "Vue"]}
        value={value}
        onChange={set}
      />
      <Button onClick={reset}>Reset to initial</Button>
    </>
  )}
</Value>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Value.js)
- 原料：无

State 只存储一个属性 `value`，并赋初始值为 `initial`:

```typescript
export default {
  state = {
    value: this.props.initial
  };
}
```

方法有 `set` `reset`。

`set` 回调函数触发后调用 `setState` 更新 `value`。

`reset` 就是调用 `set` 并传入 `this.props.initial` 即可。

## 2.2. Toggle

Toggle 是最直接利用 Value 即可实现的功能，因此放在 Value 之后说。Toggle 值是 boolean 类型，特别适合配合 Switch 等组件。

> 既然 Toggle 功能弱于 Value，为什么不用 Value 替代 Toggle 呢？这是个好问题，如果你不担心自己代码可读性的话，的确可以永远不用 Toggle。

### 用法

```tsx
<Toggle initial={false}>
  {({ on, toggle }) => <Checkbox onClick={toggle} checked={on} />}
</Toggle>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Toggle.js)
- 原料：Value

核心就是利用 Value 组件，`value` 重命名为 `on`，增加了 `toggle` 方法，继承 `set` `reset` 方法：

```typescript
export default {
  toggle: () => set(on => !on);
}
```

理所因当，将 value 值限定在 boolean 范围内。

## 2.3. Counter

与 Toggle 类似，这也是继承了 Value 就可以实现的功能，计数器。

### 用法

```tsx
<Counter initial={0}>
  {({ count, inc, dec }) => (
    <CartItem
      productName="Lorem ipsum"
      unitPrice={19.9}
      count={count}
      onAdd={inc}
      onRemove={dec}
    />
  )}
</Counter>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Counter.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `count`，增加了 `inc` `dec` `incBy` `decBy` 方法，继承 `set` `reset` 方法。

与 Toggle 类似，Counter 将 value 限定在了数字，那么比如 `inc` 就会这么实现：

```typescript
export default {
  inc: () => set(value => value + 1);
}
```

这里用到了 Value 组件 `set` 函数的多态用法。一般 set 的参数是一个值，但也可以是一个函数，回调是当前的值，这里返回一个 +1 的新值。

## 2.4. List

操作数组。

### 用法

```tsx
<List initial={['#react', '#babel']}>
  {({ list, pull, push }) => (
    <div>
      <FormInput onSubmit={push} />
      {list.map({ tag }) => (
        <Tag onRemove={() => pull(value => value === tag)}>
          {tag}
        </Tag>
      )}
    </div>
  )}
</List>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/List.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `list`，增加了 `first` `last` `push` `pull` `sort` 方法，继承 `set` `reset` 方法。

```typescript
export default {
  list: value,
  first: () => value[0],
  last: () => value[Math.max(0, value.length - 1)],
  set: list => set(list),
  push: (...values) => set(list => [...list, ...values]),
  pull: predicate => set(list => list.filter(complement(predicate))),
  sort: compareFn => set(list => [...list].sort(compareFn)),
  reset
};
```

为了利用 React Immutable 更新的特性，因此将 `sort` 函数由 Mutable 修正为 Immutable，`push` `pull` 同理。

## 2.5. Set

存储数组对象，可以添加和删除元素。类似 ES6 Set。和 List 相比少了许多功能函数，因此只承担添加、删除元素的简单功能。

### 用法

需要注意的是，`initial` 是数组，而不是 Set 对象。

```tsx
<Set initial={["react", "babel"]}>
  {({ values, remove, add }) => (
    <TagManager>
      <FormInput onSubmit={add} />
      {values.map(tag => (
        <Tag onRemove={() => remove(tag)}>{tag}</Tag>
      ))}
    </TagManager>
  )}
</Set>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Set.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `values` 且初始值为 `[]`，增加了 `add` `remove` `clear` `has` 方法，保留 `reset` 方法。

实现依然很简单，`add` `remove` `clear` 都利用 Value 提供的 `set` 进行赋值，只要实现几个操作数组方法即可：

```typescript
const unique = arr => arr.filter((d, i) => arr.indexOf(d) === i);
const hasItem = (arr, item) => arr.indexOf(item) !== -1;
const removeItem = (arr, item) =>
  hasItem(arr, item) ? arr.filter(d => d !== item) : arr;
const addUnique = (arr, item) => (hasItem(arr, item) ? arr : [...arr, item]);
```

`has` 方法则直接复用 `hasItem`。核心还是利用 Value 的 `set` 函数一招通吃，将操作目标锁定为数组类型罢了。

## 2.6. map

Map 的实现与 Set 很像，类似 ES6 的 Map。

### 用法

与 Set 不同，Map 允许设置 Key 名。需要注意的是，`initial` 是对象，而不是 Map 对象。

```tsx
<Map initial={{ sounds: true, music: true, graphics: "medium" }}>
  {({ set, get }) => (
    <Tings>
      <ToggleCheck checked={get("sounds")} onChange={c => set("sounds", c)}>
        Game Sounds
      </ToggleCheck>
      <ToggleCheck checked={get("music")} onChange={c => set("music", c)}>
        Bg Music
      </ToggleCheck>
      <Select
        label="Graphics"
        options={["low", "medium", "high"]}
        selected={get("graphics")}
        onSelect={value => set("graphics", value)}
      />
    </Tings>
  )}
</Map>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Map.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `values` 且初始值为 `{}`，增加了 `set` `get` `clear` `has` `delete` 方法，保留 `reset` 方法。

由于使用对象存储数据结构，操作起来比数组方便太多，已经不需要再解释了。

值得吐槽的是，作者使用了 `!=` 判断 has:

```typescript
export default {
  has: key => values[key] != null;
}
```

这种代码并不值得提倡，首先是不应该使用二元运算符，其次比较推荐写成 `values[key] !== undefined`，毕竟 `set('null', null)` 也应该算有值。

## 2.7. state

State 纯粹为了替代 React `setState` 概念，其本质就是换了名字的 Value 组件。

### 用法

值得注意的是，`setState` 支持函数和值作为参数，是 Value 组件本身支持的，State 组件额外适配了 `setState` 的另一个特性：合并对象。

```tsx
<State initial={{ loading: false, data: null }}>
  {({ state, setState }) => {
    const onStart = data => setState({ loading: true });
    const onFinish = data => setState({ data, loading: false });

    return (
      <DataReceiver data={state.data} onStart={onStart} onFinish={onFinish} />
    );
  }}
</State>
```

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/State.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `state` 且初始值为 `{}`，增加了 `setState` 方法，保留 `reset` 方法。

`setState` 实现了合并对象的功能，也就是传入一个对象，并不会覆盖原始值，而是与原始值做 Merge:

```typescript
export default {
  setState: (updater, cb) =>
    set(
      prev => ({
        ...prev,
        ...(typeof updater === "function" ? updater(prev) : updater)
      }),
      cb
    );
}
```

## 2.8. Active

这是一个内置鼠标交互监听的容器，监听了 `onMouseUp` 与 `onMouseDown`，并依此判断 `active` 状态。

### 用法

```tsx
<Active>
  {({ active, bind }) => (
    <div {...bind}>
      You are {active ? "clicking" : "not clicking"} this div.
    </div>
  )}
</Active>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Active.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `active` 且初始值为 `false`，增加了 `bind` 方法。

`bind` 方法也巧妙利用了 Value 提供的 `set` 更新状态：

```typescript
export default {
  bind: {
    onMouseDown: () => set(true),
    onMouseUp: () => set(false)
  }
};
```

## 2.9. Focus

与 Active 类似，Focus 是当 focus 时才触发状态变化。

### 用法

```tsx
<Focus>
  {({ focused, bind }) => (
    <div>
      <input {...bind} placeholder="Focus me" />
      <div>You are {focused ? "focusing" : "not focusing"} the input.</div>
    </div>
  )}
</Focus>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Focus.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `focused` 且初始值为 `false`，增加了 `bind` 方法。

`bind` 方法与 Active 如出一辙，仅是监听时机变成了 `onFocus` 和 `onBlur`。

## 2.10. FocusManager

不知道出于什么考虑，FocusManager 的官方文档是空的，而且 Help wanted。。

正如名字描述的，这是一个 Focus 控制器，你可以直接调用 `blur` 来取消焦点。

### 用法

笔者给了一个例子，在 5 秒后自动失去焦点：

```tsx
<FocusFocusManager>
  {({ focused, blur, bind }) => (
    <div>
      <input
        {...bind}
        placeholder="Focus me"
        onClick={() => {
          setTimeout(() => {
            blur();
          }, 5000);
        }}
      />
      <div>You are {focused ? "focusing" : "not focusing"} the input.</div>
    </div>
  )}
</FocusFocusManager>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/FocusManager.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `focused` 且初始值为 `false`，增加了 `bind` `blur` 方法。

`blur` 方法直接调用 `document.activeElement.blur()` 来触发其 `bind` 监听的 `onBlur` 达到更新状态的效果。

By the way, 还监听了 `onMouseDown` 与 `onMouseUp`:

```typescript
export default {
  bind: {
    tabIndex: -1,
    onBlur: () => {
      if (canBlur) {
        set(false);
      }
    },
    onFocus: () => set(true),
    onMouseDown: () => (canBlur = false),
    onMouseUp: () => (canBlur = true)
  }
};
```

可能意图是防止在 `mouseDown` 时触发 `blur`，因为 `focus` 的时机一般是 `mouseDown`。

## 2.11. Hover

与 Focus 类似，只是触发时机为 Hover。

### 用法

```tsx
<Hover>
  {({ hovered, bind }) => (
    <div {...bind}>
      You are {hovered ? "hovering" : "not hovering"} this div.
    </div>
  )}
</Hover>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Hover.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `hovered` 且初始值为 `false`，增加了 `bind` 方法。

`bind` 方法与 Active、Focus 如出一辙，仅是监听时机变成了 `onMouseEnter` 和 `onMouseLeave`。

## 2.12. Touch

与 Hover 类似，只是触发时机为 Hover。

### 用法

```tsx
<Touch>
  {({ touched, bind }) => (
    <div {...bind}>
      You are {touched ? "touching" : "not touching"} this div.
    </div>
  )}
</Touch>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Hover.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `touched` 且初始值为 `false`，增加了 `bind` 方法。

`bind` 方法与 Active、Focus、Hover 如出一辙，仅是监听时机变成了 `onTouchStart` 和 `onTouchEnd`。

## 2.13. Field

与 Value 组件唯一的区别，就是支持了 `bind`。

### 用法

这个用法和 Value 没区别：

```tsx
<Field>
  {({ value, set }) => (
    <ControlledField value={value} onChange={e => set(e.target.value)} />
  )}
</Field>
```

但是用 `bind` 更简单：

```tsx
<Field initial="hello world">
  {({ bind }) => <ControlledField {...bind} />}
</Field>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Field.js)
- 原料：Value

依然利用 Value 组件，`value` 保留不变，初始值为 `''`，增加了 `bind` 方法，保留 `set` `reset` 方法。

与 Value 的唯一区别是，支持了 `bind` 并封装 `onChange` 监听，与赋值受控属性 `value`。

```typescript
export default {
  bind: {
    value,
    onChange: event => {
      if (isObject(event) && isObject(event.target)) {
        set(event.target.value);
      } else {
        set(event);
      }
    }
  }
};
```

## 2.14. Form

这是一个表单工具，有点类似 Antd 的 Form 组件。

### 用法

```tsx
<Form initial={{ firstName: "", lastName: "" }}>
  {({ field, values }) => (
    <form
      onSubmit={e => {
        e.preventDefault();
        console.log("Form Submission Data:", values);
      }}
    >
      <input
        type="text"
        placeholder="Your First Name"
        {...field("firstName").bind}
      />
      <input
        type="text"
        placeholder="Your Last Name"
        {...field("lastName").bind}
      />
      <input type="submit" value="All Done!" />
    </form>
  )}
</Form>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Form.js)
- 原料：Value

依然利用 Value 组件，`value` 重命名为 `values` 且初始值为 `{}`，增加了 `setValues` `field` 方法，保留 `reset` 方法。

表单最重要的就是 `field` 函数，为表单的每一个控件做绑定，同时设置一个表单唯一 `key`:

```typescript
export default {
  field: id => {
    const value = values[id];
    const setValue = updater =>
      typeof updater === "function"
        ? set(prev => ({ ...prev, [id]: updater(prev[id]) }))
        : set({ ...values, [id]: updater });

    return {
      value,
      set: setValue,
      bind: {
        value,
        onChange: event => {
          if (isObject(event) && isObject(event.target)) {
            setValue(event.target.value);
          } else {
            setValue(event);
          }
        }
      }
    };
  }
};
```

可以看到，为表单的每一项绑定的内容与 Field 组件一样，只是 Form 组件的行为是批量的。

## 2.15. Interval

Interval 比较有意思，将定时器以 JSX 方式提供出来，并且提供了 `stop` `resume` 方法。

### 用法

```tsx
<Interval delay={1000}>
  {({ start, stop }) => (
    <>
      <div>The time is now {new Date().toLocaleTimeString()}</div>
      <button onClick={() => stop()}>Stop interval</button>
      <button onClick={() => start()}>Start interval</button>
    </>
  )}
</Interval>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/components/Interval.js)
- 原料：无

提供了 `start` `stop` `toggle` 方法。

实现方式是，在组件内部维护一个 Interval 定时器，实现了组件更新、销毁时的计时器更新、销毁操作，可以认为这种定时器的生命周期绑定了 React 组件的生命周期，不用担心销毁和更新的问题。

具体逻辑就不列举了，利用 `setInterval` `clearInterval` 函数基本上就可以了。

## 2.16. Compose

Compose 也是个有趣的组件，可以将上面提到的任意多个组件组合使用。

### 用法

```tsx
<Compose components={[Counter, Toggle]}>
  {(counter, toggle) => (
    <ProductCard
      {...productInfo}
      favorite={toggle.on}
      onFavorite={toggle.toggle}
      count={counter.count}
      onAdd={counter.inc}
      onRemove={counter.dec}
    />
  )}
</Compose>
```

### 源码

- [源码地址](https://github.com/renatorib/react-powerplug/blob/master/src/utils/compose.js)
- 原料：无

通过递归渲染出嵌套结构，并将每一层结构输出的值存储到 `propsList` 中，最后一起传递给组件。**这也是为什么每个函数 `value` 一般都要重命名的原因。**

在 [精读《Epitath 源码 - renderProps 新用法》](https://github.com/dt-fe/weekly/blob/master/75.%E7%B2%BE%E8%AF%BB%E3%80%8AEpitath%20%E6%BA%90%E7%A0%81%20-%20renderProps%20%E6%96%B0%E7%94%A8%E6%B3%95%E3%80%8B.md) 文章中，笔者就介绍了利用 `generator` 解决高阶组件嵌套的问题。

在 [精读《React Hooks》](https://github.com/dt-fe/weekly/blob/master/79.%E7%B2%BE%E8%AF%BB%E3%80%8AReact%20Hooks%E3%80%8B.md) 文章中，介绍了 React Hooks 已经实现了这个特性。

所以当你了解了这三种 "compose" 方法后，就可以在合适的场景使用合适的 compose 方式简化代码。

# 3. 总结

看完了源码分析，不知道你是更感兴趣使用这个库呢，还是已经跃跃欲试开始造轮子了呢？不论如何，这个库的思想在日常的业务开发中都应该大量实践。

另外 Hooks 版的 PowerPlug 已经 4 个月没有更新了（非官方）：[react-powerhooks](https://github.com/kalcifer/react-powerhooks)，也许下一个维护者/贡献者 就是你。

> 讨论地址是：[精读《React PowerPlug 源码》 · Issue #129 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/129)

**如果你想参与讨论，请[点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**
