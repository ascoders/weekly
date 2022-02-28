[vue-lit](https://github.com/yyx990803/vue-lit) 基于 [lit-html](https://github.com/lit/lit/blob/main/packages/lit-html/README.md) + [@vue/reactivity](https://github.com/vuejs/vue-next/tree/master/packages/reactivity) 仅用 70 行代码就给模版引擎实现了 [Vue Composition API](https://vuejs.org/guide/extras/composition-api-faq.html)，用来开发 web component。

## 概述

```html
<my-component></my-component>

<script type="module">
  import {
    defineComponent,
    reactive,
    html,
    onMounted,
    onUpdated,
    onUnmounted
  } from 'https://unpkg.com/@vue/lit'

  defineComponent('my-component', () => {
    const state = reactive({
      text: 'hello',
      show: true
    })
    const toggle = () => {
      state.show = !state.show
    }
    const onInput = e => {
      state.text = e.target.value
    }

    return () => html`
      <button @click=${toggle}>toggle child</button>
      <p>
      ${state.text} <input value=${state.text} @input=${onInput}>
      </p>
      ${state.show ? html`<my-child msg=${state.text}></my-child>` : ``}
    `
  })

  defineComponent('my-child', ['msg'], (props) => {
    const state = reactive({ count: 0 })
    const increase = () => {
      state.count++
    }

    onMounted(() => {
      console.log('child mounted')
    })

    onUpdated(() => {
      console.log('child updated')
    })

    onUnmounted(() => {
      console.log('child unmounted')
    })

    return () => html`
      <p>${props.msg}</p>
      <p>${state.count}</p>
      <button @click=${increase}>increase</button>
    `
  })
</script>
```

上面定义了 `my-component` 与 `my-child` 组件，并将 `my-child` 作为 `my-component` 的默认子元素。

```js
import {
  defineComponent,
  reactive,
  html, 
  onMounted,
  onUpdated,
  onUnmounted
} from 'https://unpkg.com/@vue/lit'
```

`defineComponent` 定义 custom element，第一个参数是自定义 element 组件名，必须遵循原生 API  [customElements.define](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements) 对组件名的规范，组件名必须包含中划线。

`reactive` 属于 [@vue/reactivity](https://github.com/vuejs/vue-next/tree/master/packages/reactivity) 提供的响应式 API，可以创建一个响应式对象，在渲染函数中调用时会自动进行依赖收集，这样在 Mutable 方式修改值时可以被捕获，并自动触发对应组件的重渲染。

`html` 是 [lit-html](https://github.com/lit/lit/blob/main/packages/lit-html/README.md) 提供的模版函数，通过它可以用 [Template strings](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals) 原生语法描述模版，是一个轻量模版引擎。

`onMounted`、`onUpdated`、`onUnmounted` 是基于 [web component lifecycle](https://developers.google.com/web/fundamentals/web-components/customelements#reactions) 创建的生命周期函数，可以监听组件创建、更新与销毁时机。

接下来看 `defineComponent` 的内容：

```js
defineComponent('my-component', () => {
  const state = reactive({
    text: 'hello',
    show: true
  })
  const toggle = () => {
    state.show = !state.show
  }
  const onInput = e => {
    state.text = e.target.value
  }

  return () => html`
    <button @click=${toggle}>toggle child</button>
    <p>
    ${state.text} <input value=${state.text} @input=${onInput}>
    </p>
    ${state.show ? html`<my-child msg=${state.text}></my-child>` : ``}
  `
})
```

借助模版引擎 [lit-html](https://github.com/lit/lit/blob/main/packages/lit-html/README.md) 的能力，可以同时在模版中传递变量与函数，再借助 [@vue/reactivity](https://github.com/vuejs/vue-next/tree/master/packages/reactivity) 能力，让变量变化时生成新的模版，更新组件 dom。

## 精读

阅读源码可以发现，vue-lit 巧妙的融合了三种技术方案，它们配合方式是：

1. 使用 [@vue/reactivity](https://github.com/vuejs/vue-next/tree/master/packages/reactivity) 创建响应式变量。
2. 利用模版引擎 [lit-html](https://github.com/lit/lit/blob/main/packages/lit-html/README.md) 创建使用了这些响应式变量的 HTML 实例。
3. 利用 [web component](https://developers.google.com/web/fundamentals/web-components/customelements) 渲染模版引擎生成的 HTML 实例，这样创建的组件具备隔离能力。

其中响应式能力与模版能力分别是 [@vue/reactivity](https://github.com/vuejs/vue-next/tree/master/packages/reactivity)、[lit-html](https://github.com/lit/lit/blob/main/packages/lit-html/README.md) 这两个包提供的，我们只需要从源码中寻找剩下的两个功能：如何在修改值后触发模版刷新，以及如何构造生命周期函数的。

首先看如何在值修改后触发模版刷新。以下我把与重渲染相关代码摘出来了：

```js
import {
  effect
} from 'https://unpkg.com/@vue/reactivity/dist/reactivity.esm-browser.js'

customElements.define(
  name,
  class extends HTMLElement {
    constructor() {
      super()
      const template = factory.call(this, props)
      const root = this.attachShadow({ mode: 'closed' })
      effect(() => {
        render(template(), root)
      })
    }
  }
)
```

可以清晰的看到，首先 `customElements.define` 创建一个原生 web component，并利用其 API 在初始化时创建一个 `closed` 节点，该节点对外部 API 调用关闭，即创建的是一个不会受外部干扰的 web component。

然后在 `effect` 回调函数内调用 `html` 函数，即在使用文档里返回的模版函数，由于这个模版函数中使用的变量都采用 `reactive` 定义，所以 `effect` 可以精准捕获到其变化，并在其变化后重新调用 `effect` 回调函数，实现了 “值变化后重渲染” 的功能。

然后看生命周期是如何实现的，由于生命周期贯穿整个实现流程，因此必须结合全量源码看，下面贴出全量核心代码，上面介绍过的部分可以忽略不看，只看生命周期的实现：

```js
let currentInstance

export function defineComponent(name, propDefs, factory) {
  if (typeof propDefs === 'function') {
    factory = propDefs
    propDefs = []
  }

  customElements.define(
    name,
    class extends HTMLElement {
      constructor() {
        super()
        const props = (this._props = shallowReactive({}))
        currentInstance = this
        const template = factory.call(this, props)
        currentInstance = null
        this._bm && this._bm.forEach((cb) => cb())
        const root = this.attachShadow({ mode: 'closed' })
        let isMounted = false
        effect(() => {
          if (isMounted) {
            this._bu && this._bu.forEach((cb) => cb())
          }
          render(template(), root)
          if (isMounted) {
            this._u && this._u.forEach((cb) => cb())
          } else {
            isMounted = true
          }
        })
      }
      connectedCallback() {
        this._m && this._m.forEach((cb) => cb())
      }
      disconnectedCallback() {
        this._um && this._um.forEach((cb) => cb())
      }
      attributeChangedCallback(name, oldValue, newValue) {
        this._props[name] = newValue
      }
    }
  )
}

function createLifecycleMethod(name) {
  return (cb) => {
    if (currentInstance) {
      ;(currentInstance[name] || (currentInstance[name] = [])).push(cb)
    }
  }
}

export const onBeforeMount = createLifecycleMethod('_bm')
export const onMounted = createLifecycleMethod('_m')
export const onBeforeUpdate = createLifecycleMethod('_bu')
export const onUpdated = createLifecycleMethod('_u')
export const onUnmounted = createLifecycleMethod('_um')
```

生命周期实现形如 `this._bm && this._bm.forEach((cb) => cb())`，之所以是循环，是因为比如 `onMount(() => cb())` 可以注册多次，因此每个生命周期都可能注册多个回调函数，因此遍历将其依次执行。

而生命周期函数还有一个特点，即并不分组件实例，因此必须有一个 `currentInstance` 标记当前回调函数是在哪个组件实例注册的，而这个注册的同步过程就在 `defineComponent` 回调函数 `factory` 执行期间，因此才会有如下的代码：

```js
currentInstance = this
const template = factory.call(this, props)
currentInstance = null
```

这样，我们就将 `currentInstance` 始终指向当前正在执行的组件实例，而所有生命周期函数都是在这个过程中执行的，**因此当调用生命周期回调函数时，`currentInstance` 变量必定指向当前所在的组件实例**。

接下来为了方便，封装了 `createLifecycleMethod` 函数，在组件实例上挂载了一些形如 `_bm`、`_bu` 的数组，比如 `_bm` 表示 `beforeMount`，`_bu` 表示 `beforeUpdate`。

接下来就是在对应位置调用对应函数了：

首先在 `attachShadow` 执行之前执行 `_bm` - `onBeforeMount`，因为这个过程确实是准备组件挂载的最后一步。

然后在 `effect` 中调用了两个生命周期，因为 `effect` 会在每次渲染时执行，所以还特意存储了 `isMounted` 标记是否为初始化渲染：

```js
effect(() => {
  if (isMounted) {
    this._bu && this._bu.forEach((cb) => cb())
  }
  render(template(), root)
  if (isMounted) {
    this._u && this._u.forEach((cb) => cb())
  } else {
    isMounted = true
  }
})
```

这样就很容易看懂了，只有初始化渲染过后，从第二次渲染开始，在执行 `render`（该函数来自 `lit-html` 渲染模版引擎）之前调用 `_bu` - `onBeforeUpdate`，在执行了 `render` 函数后调用 `_u` - `onUpdated`。

由于 `render(template(), root)` 根据 `lit-html` 的语法，会直接把 `template()` 返回的 HTML 元素挂载到 `root` 节点，而 `root` 就是这个 web component `attachShadow` 生成的 shadow dom 节点，因此这句话执行结束后渲染就完成了，所以 `onBeforeUpdate` 与 `onUpdated` 一前一后。

最后几个生命周期函数都是利用 web component 原生 API 实现的：

```js
connectedCallback() {
  this._m && this._m.forEach((cb) => cb())
}
disconnectedCallback() {
  this._um && this._um.forEach((cb) => cb())
}
```

分别实现 `mount`、`unmount`。这也说明了浏览器 API 分层的清晰之处，只提供创建和销毁的回调，而更新机制完全由业务代码实现，不管是 [@vue/reactivity](https://github.com/vuejs/vue-next/tree/master/packages/reactivity) 的 `effect` 也好，还是 `addEventListener` 也好，都不关心，所以如果在这之上做完整的框架，需要自己根据实现 `onUpdate` 生命周期。

最后的最后，还利用 `attributeChangedCallback` 生命周期监听自定义组件 html attribute 的变化，然后将其直接映射到对 `this._props[name]` 的变化，这是为什么呢？

```js
attributeChangedCallback(name, oldValue, newValue) {
  this._props[name] = newValue
}
```

看下面的代码片段就知道原因了：

```js
const props = (this._props = shallowReactive({}))
const template = factory.call(this, props)
effect(() => {
  render(template(), root)
})
```

早在初始化时，就将 `_props` 创建为响应式变量，这样只要将其作为 [lit-html](https://github.com/lit/lit/blob/main/packages/lit-html/README.md) 模版表达式的参数（对应 `factory.call(this, props)` 这段，而 `factory` 就是 `defineComponent('my-child', ['msg'], (props) => { ..` 的第三个参数），这样一来，只要这个参数变化了就会触发子组件的重渲染，因为这个 `props` 已经经过 Reactive 处理了。

## 总结

[vue-lit](https://github.com/yyx990803/vue-lit) 实现非常巧妙，学习他的源码可以同时了解一下几种概念：

- reative。
- web component。
- string template。
- 模版引擎的精简实现。
- 生命周期。

以及如何将它们串起来，利用 70 行代码实现一个优雅的渲染引擎。

最后，用这种模式创建的 web component 引入的 runtime lib 在 gzip 后只有 6kb，但却能享受到现代化框架的响应式开发体验，如果你觉得这个 runtime 大小可以忽略不计，那这就是一个非常理想的创建可维护 web component 的 lib。

> 讨论地址是：[精读《vue-lit 源码》· Issue #396 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/396)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）


