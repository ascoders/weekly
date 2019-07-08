# 1. 引言

本周精读的源码是 [inject-instance](https://github.com/ascoders/inject-instance) 这个库。

这个库的目的是为了实现 Class 的依赖注入。

比如我们通过 `inject` 描述一个成员变量，那么在运行时，这个成员变量的值就会被替换成对应 Class 的实例。这等于让 Class 具备了申明依赖注入的能力：

```js
import {inject} from 'inject-instance'
import B from './B'

class A {
  @inject('B') private b: B
  public name = 'aaa'

  say() {
    console.log('A inject B instance', this.b.name)
  }
}
```

试想一下，如果成员函数 `b` 是通过 New 出来的：

```js
class A {
  private b = new B()

  say() {
    console.log('A inject B instance', this.b.name)
  }
}
```

这个 `b` 就不具备依赖注入的特点，因为被注入的 `b` 是外部已经初始化好的，而不是实例化 A 时动态生成的。

需要依赖注入的一般都是框架级代码，比如定义数据流，存在三个 Store 类，他们之间需要相互调用对方实例：

```js
class A {
  @inject('B') private b: B
}

class B {
  @inject('C') private c: C
}

class C {
  @inject('A') private a: A
}
```

那么对于引用了数据流 A、B、C 的三个组件，**要保证它们访问到的是同一组实例 `A` `B` `C` 该怎么办呢？**

这时候我们需要通过 `injectInstance` 函数统一实例化这些类，保证拿到的实例中，成员变量都是属于同一份实例：

```js
import injectInstance from 'inject-instance'

const instances = injectInstance(A, B, C)
instances.get('A')
instances.get('B')
instances.get('C')
```

那么框架底层可以通过调用 `injectInstance` 方式初始化一组 “正确注入依赖关系的实例”，拿 React 举例，这个动作可以发生在自定义数据流的 `Provider` 函数里：

```js
<Provider stores={{ A, B, C }}>
  <Root />
</Provider>
```

那么在 `Provider` 函数内部通过 `injectInstance` 实例化的数据流，**可以保证 `A` `B` `C` 操作的注入实例都是当前 `Provider` 实例中的那一份**。

# 2. 精读

那么开始源码的解析，首先是整体思路的分析。

我们需要准备两个 API: `inject` 与 `injectInstance`。

`inject` 用来描述要注入的类名，值是与 Class 名相同的字符串，`injectInstance` 是生成一系列实例的入口函数，需要生成最终生效的实例，并放在一个 Map 中。

## inject

`inject` 是个装饰器，它的目的有两个：

1. 修改 Class 基类信息，使其实例化的实例能拿到对应字段注入的 Class 名称。
2. 增加一个字段描述注入了那些 Key。

```ts
const inject = (injectName: string): any => (target: any, propertyKey: string, descriptor: PropertyDescriptor): any => {
    target[propertyKey] = injectName

    // 加入一个标注变量
    if (!target['_injectDecorator__injectVariables']) {
        target['_injectDecorator__injectVariables'] = [propertyKey]
    } else {
        target['_injectDecorator__injectVariables'].push(propertyKey)
    }

    return descriptor
}
```

`target[propertyKey] = injectName` 这行代码中，`propertyKey` 是申明了注入的成员变量名称，比如 Class `A` 中，`propertyKey` 等于 `b`，而 `injectName` 表示这个值需要的对应实例的 Class 名，比如 Class `A` 中，`injectName` 等于 `B`。

而 `_injectDecorator__injectVariables` 是个数组，为 Class 描述了这个类参与注入的 key 共有哪些，这样可以在后面 `injectInstance` 函数中拿到并依次赋值。

## injectInstance

这个函数有两个目的：

1. 生成对应的实例。
2. 将实例中注入部分的成员变量替换成对应实例。

代码不长，直接贴出来：

```ts
const injectInstance = (...classes: Array<any>) => {
    const classMap = new Map<string, any>()
    const instanceMap = new Map<string, any>()

    classes.forEach(eachClass => {
      if (classMap.has(eachClass.name)) {
        throw `duplicate className: ${eachClass.name}`
      }
      classMap.set(eachClass.name, eachClass)
    })

    // 遍历所有用到的类
    classMap.forEach((eachClass: any) => {
      // 实例化
      instanceMap.set(eachClass.name, new eachClass())
    })

    // 遍历所有实例
  instanceMap.forEach((eachInstance: any, key: string) => {
    // 遍历这个类的注入实例类名
    if (eachInstance['_injectDecorator__injectVariables']) {
      eachInstance['_injectDecorator__injectVariables'].forEach((injectVariableKey: string) => {
        const className = eachInstance.__proto__[injectVariableKey];
        if (!instanceMap.get(className)) {
          throw Error(`injectName: ${className} not found!`);
        }

        // 把注入名改成实际注入对象
        eachInstance[injectVariableKey] = instanceMap.get(className);
      });
    }

    // 删除这个临时变量
    delete eachInstance['_injectDecorator__injectVariables'];
  });

  return instanceMap
}
```

可以看到，首先我们将传入的 Class 依次初始化：

```ts
// 遍历所有用到的类
classMap.forEach((eachClass: any) => {
  // 实例化
  instanceMap.set(eachClass.name, new eachClass())
})
```

这是必须提前完成的，因为注入可能存在循环依赖，我们必须在解析注入之前就生成 Class 实例，此时需要注入的字段都是 `undefined`。

第二步就是将这些注入字段的 `undefined` 替换为刚才实例化 Map `instanceMap` 中对应的实例了。

我们通过 `__proto__` 拿到 Class 基类在 `inject` 函数中埋下的 `injectName`，配合 `_injectDecorator__injectVariables` 拿到 key 后，直接遍历所有要替换的 key, 通过类名从 `instanceMap` 中提取即可。

> `__proto__` 仅限框架代码中使用，业务代码不要这么用，造成额外理解成本。

所以总结一下，就是提前实例化 + 根据 `inject` 埋好的信息依次替换注入的成员变量为刚才实例化好的实例。

# 3. 总结

希望读完这篇文章，你能理解依赖注入的使用场景，使用方式，以及一种实现思路。

框架实现依赖注入都是提前收集所有类，统一初始化，通过注入函数打标后全局替换，这是一种思维套路。

如果有其他更有意思的依赖注入实现方案，欢迎讨论。

> 讨论地址是：[精读《Inject Instance 源码》 · Issue #176 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/176)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
