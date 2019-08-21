# 1 引言

[htm](https://github.com/developit/htm) 是 preact 作者的新尝试，利用原生 HTML 规范支持了类 JSX 的写法。

# 2 概要

[htm](https://github.com/developit/htm) 没有特别的文档，假如你用过 JSX，那只需要记住下面三个不同点：

- `className` -> `class`。
- 标签引号可选（回归 html 规范）：`<div class=foo>`。
- 支持 HTML 模式的注释：`<div><!-- don't delete this! --></div>`。

> 另外支持了可选结束标签、快捷组件 End 标签，不过这些自己发明的语法不建议记忆。

用法也没什么特别的地方，你可以利用 HTML 原生规范，用直觉去写 JSX：

```js
html`
  <div class="app">
    <${Header} name="ToDo's (${page})" />
    <ul>
      ${todos.map(
        todo => html`
          <li>${todo}</li>
        `
      )}
    </ul>
    <button onClick=${() => this.addTodo()}>Add Todo</button>
    <${Footer}>footer content here<//>
  </div>
`;
```

很显然，由于跳过了 JSX 编译，换成了原生的 [Template Strings](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/template_strings) ，所以所有组件、属性部分都需要改成 `${}` 语法，比如：

`<${Header}>` 这种写法略显别扭，但整体上还是蛮直观的。

你不一定非要用在项目环境中，但当你看到这种语法时，内心一定情不自禁的 WoW，竟然还有这种写法！

下面将带你一起分析 [htm](https://github.com/developit/htm) 的源码，看看作者是如何做到的。

# 3 精读

你可以先自己尝试阅读，源码加上注释一共 90 行：[源码](https://github.com/developit/htm/blob/master/src/index.mjs)。

好了，欢迎继续阅读。

首先你要认识到， `htm` + `vhtml` 才等于你上面看到的 DEMO。

## Htm

`Htm` 是一个 dom template 解析器，它可以将任何 dom template 解析成一颗语法树，而这个语法树的结构是：

```typescript
interface VDom {
  tag: string;
  props: {
    [attrKey: string]: string;
  };
  children: VDom[];
}
```

我们看一个 demo：

```js
function h(tag, props, ...children) {
  return { tag, props, children };
}

const html = htm.bind(h);

html`
  <div>123</div>
`; // { tag: "div", props: {}, children: ["123"] }
```

那具体是怎么做语法解析的呢？

其实实现方式有点像脑经急转弯，毕竟解析 dom template 是浏览器引擎做的事，规范也早已定了下来，有了规范和实现，当然没必要重复造轮子，办法就是利用 HTML 的 AST 生成我们需要的 AST。

首先创建一个 `template` 元素：

```js
const TEMPLATE = document.createElement("template");
```

再装输入的 dom template 字符串塞入（作者通过正则，机智的将自己支持的额外语法先转化为标准语法，再交给 HTML 引擎）：

```js
TEMPLATE.innerHTML = str;
```

最后我们会发现进入了 `walk` 函数，通过 `localName` 拿到标签名；`attributes` 拿到属性值，通过 `firstChild` 与 `nextSibling` 遍历子元素继续走 `walk`，最后 `tag` `props` `children` 三剑客就生成了。

可能你还没看完，就已经结束了。笔者分析这个库，除了告诉你作者的机智思路，还想告诉你的是，站在巨人的肩膀造轮子，真的事半功倍。

## VDom

VDom 是个抽象概念，它负责将实体语法树解析为 DOM。这个工具可以是 preact、vhtml，或者由你自己来实现。

当然，你也可以利用这个 AST 生成 JSON，比如：

```javascript
import htm from "htm";
import jsxobj from "jsxobj";

const html = htm.bind(jsxobj);

console.log(html`
  <webpack watch mode=production>
    <entry path="src/index.js" />
  </webpack>
`);
// {
//   watch: true,
//   mode: 'production',
//   entry: {
//     path: 'src/index.js'
//   }
// }
```

读到这，你觉得还有哪些 “VDom” 可以写呢？其实任何可以根据 `tag` `props` `children` 推导出的结构都可以写成解析插件。

# 4 总结

[htm](https://github.com/developit/htm) 是一个教科书般借力造论子案例：

- 利用 `innerHTML` 会自动生成的标准 AST，解析出符合自己规范的 AST，这其实是进一步抽象 AST。
- 利用原有库进行 DOM 解析，比如 preact 或 vhtml。
- 基于第二点，所以可以生成任何目标代码，比如 json，pdf，excel 等等。

不过这也带来了一个问题：依赖原生 DOM API 会导致无法运行在 NodeJS 环境。

想一想你现在开发的工具库，有没有可以借力的地方呢？有哪些点可以通过借力做得更好从而实现双赢呢？欢迎留下你的思考。

> 讨论地址是：[精读《Htm - Hyperscript 源码》 · Issue #114 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/114)

**如果你想参与讨论，请[点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**
