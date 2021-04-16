## 1 引言

[IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) 可以轻松判断元素是否可见，在之前的 [精读《用 React 做按需渲染》](https://github.com/dt-fe/weekly/blob/v2/154.%20%E7%B2%BE%E8%AF%BB%E3%80%8A%E7%94%A8%20React%20%E5%81%9A%E6%8C%89%E9%9C%80%E6%B8%B2%E6%9F%93%E3%80%8B.md) 中介绍了原生 API 的方法，这次刚好看到其 React 封装版本 [react-intersection-observer](https://github.com/thebuilder/react-intersection-observer)，让我们看一看 React 封装思路。

## 2 简介

[react-intersection-observer](https://github.com/thebuilder/react-intersection-observer) 提供了 Hook `useInView` 判断元素是否在可视区域内，API 如下：

```jsx
import React from "react";
import { useInView } from "react-intersection-observer";

const Component = () => {
  const [ref, inView] = useInView();

  return (
    <div ref={ref}>
      <h2>{`Header inside viewport ${inView}.`}</h2>
    </div>
  );
};
```

由于判断元素是否可见是基于 dom 的，所以必须将 `ref` 回调函数传递给 **代表元素轮廓的 DOM 元素**，上面的例子中，我们将 `ref` 传递给了最外层 DIV。

`useInView` 还支持下列参数：

- `root`：检测是否可见基于的视窗元素，默认是整个浏览器 viewport。
- `rootMargin`：root 边距，可以在检测时提前或者推迟固定像素判断。
- `threshold`：是否可见的阈值，范围 0 ～ 1，0 表示任意可见即为可见，1 表示完全可见即为可见。
- `triggerOnce`：是否仅触发一次。

## 3 精读

首先从入口函数 `useInView` 开始解读，这是一个 Hook，利用 `ref` 存储上一次 DOM 实例，`state` 则存储 `inView` 元素是否可见的 boolean 值：

```jsx
export function useInView(
  options: IntersectionOptions = {},
): InViewHookResponse {
  const ref = React.useRef<Element>()
  const [state, setState] = React.useState<State>(initialState)

  // 中间部分..

  return [setRef, state.inView, state.entry]
}
```

当组件 ref 被赋值时会调用 `setRef`，回调 `node` 是新的 DOM 节点，因此先 `unobserve(ref.current)` 取消旧节点的监听，再 `observe(node)` 对新节点进行监听，最后 `ref.current = node` 更新旧节点：

```jsx
// 中间部分 1
const setRef = React.useCallback(
  (node) => {
    if (ref.current) {
      unobserve(ref.current);
    }

    if (node) {
      observe(
        node,
        (inView, intersection) => {
          setState({ inView, entry: intersection });

          if (inView && options.triggerOnce) {
            // If it should only trigger once, unobserve the element after it's inView
            unobserve(node);
          }
        },
        options
      );
    }

    // Store a reference to the node, so we can unobserve it later
    ref.current = node;
  },
  [options.threshold, options.root, options.rootMargin, options.triggerOnce]
);
```

另一段是，当 `ref` 不存在时会清空 `inView` 状态，毕竟当不存在监听对象时，inView 值只有重设为默认 false 才合理：

```jsx
// 中间部分 2
useEffect(() => {
  if (!ref.current && state !== initialState && !options.triggerOnce) {
    // If we don't have a ref, then reset the state (unless the hook is set to only `triggerOnce`)
    // This ensures we correctly reflect the current state - If you aren't observing anything, then nothing is inView
    setState(initialState);
  }
});
```

这就是入口文件的逻辑，我们可以看到还有两个重要的函数 `observe` 与 `unobserve`，这两个函数的实现在 [intersection.ts](https://github.com/thebuilder/react-intersection-observer/blob/master/src/intersection.ts) 文件中，这个文件有三个核心函数：`observe`、`unobserve`、`onChange`。

- `observe`：监听 element 是否在可视区域。
- `unobserve`：取消监听。
- `onChange`：处理 `observe` 变化的回调。

先看 `observe`，对于同一个 root 下的监听会做合并操作，因此需要生成 `observerId` 作为唯一标识，这个标识由 `getRootId`、`rootMargin`、`threshold` 共同决定。

对于同一个 root 的监听下，拿到 `new IntersectionObserver()` 创建的 `observerInstance` 实例，调用 `observerInstance.observe` 进行监听。这里存储了两个 Map - `OBSERVER_MAP` 与 `INSTANCE_MAP`，前者是保证同一 root 下 `IntersectionObserver` 实例唯一，后者存储了组件 `inView` 以及回调等信息，在 `onChange` 函数使用：

```jsx
export function observe(
  element: Element,
  callback: ObserverInstanceCallback,
  options: IntersectionObserverInit = {}
) {
  // IntersectionObserver needs a threshold to trigger, so set it to 0 if it's not defined.
  // Modify the options object, since it's used in the onChange handler.
  if (!options.threshold) options.threshold = 0;
  const { root, rootMargin, threshold } = options;
  // Validate that the element is not being used in another <Observer />
  invariant(
    !INSTANCE_MAP.has(element),
    "react-intersection-observer: Trying to observe %s, but it's already being observed by another instance.\nMake sure the `ref` is only used by a single <Observer /> instance.\n\n%s"
  );
  /* istanbul ignore if */
  if (!element) return;
  // Create a unique ID for this observer instance, based on the root, root margin and threshold.
  // An observer with the same options can be reused, so lets use this fact
  let observerId: string =
    getRootId(root) +
    (rootMargin
      ? `${threshold.toString()}_${rootMargin}`
      : threshold.toString());

  let observerInstance = OBSERVER_MAP.get(observerId);
  if (!observerInstance) {
    observerInstance = new IntersectionObserver(onChange, options);
    /* istanbul ignore else  */
    if (observerId) OBSERVER_MAP.set(observerId, observerInstance);
  }

  const instance: ObserverInstance = {
    callback,
    element,
    inView: false,
    observerId,
    observer: observerInstance,
    // Make sure we have the thresholds value. It's undefined on a browser like Chrome 51.
    thresholds:
      observerInstance.thresholds ||
      (Array.isArray(threshold) ? threshold : [threshold]),
  };

  INSTANCE_MAP.set(element, instance);
  observerInstance.observe(element);

  return instance;
}
```

对于 `onChange` 函数，因为采用了多元素监听，所以需要遍历 `changes` 数组，并判断 `intersectionRatio` 超过阈值判定为 `inView` 状态，通过 `INSTANCE_MAP` 拿到对应实例，修改其 `inView` 状态并执行 `callback`。

这个 `callback` 就对应了 `useInView` Hook 中 `observe` 的第二个参数回调：

```jsx
function onChange(changes: IntersectionObserverEntry[]) {
  changes.forEach((intersection) => {
    const { isIntersecting, intersectionRatio, target } = intersection;
    const instance = INSTANCE_MAP.get(target);

    // Firefox can report a negative intersectionRatio when scrolling.
    /* istanbul ignore else */
    if (instance && intersectionRatio >= 0) {
      // If threshold is an array, check if any of them intersects. This just triggers the onChange event multiple times.
      let inView = instance.thresholds.some((threshold) => {
        return instance.inView
          ? intersectionRatio > threshold
          : intersectionRatio >= threshold;
      });

      if (isIntersecting !== undefined) {
        // If isIntersecting is defined, ensure that the element is actually intersecting.
        // Otherwise it reports a threshold of 0
        inView = inView && isIntersecting;
      }

      instance.inView = inView;
      instance.callback(inView, intersection);
    }
  });
}
```

最后是 `unobserve` 取消监听的实现，在 `useInView` `setRef` 灌入新 Node 节点时，会调用 `unobserve` 对旧节点取消监听。

首先利用 `INSTANCE_MAP` 找到实例，调用 `observer.unobserve(element)` 销毁监听。最后销毁不必要的 `INSTANCE_MAP` 与 `ROOT_IDS` 存储。

```jsx
export function unobserve(element: Element | null) {
  if (!element) return;
  const instance = INSTANCE_MAP.get(element);

  if (instance) {
    const { observerId, observer } = instance;
    const { root } = observer;

    observer.unobserve(element);

    // Check if we are still observing any elements with the same threshold.
    let itemsLeft = false;
    // Check if we still have observers configured with the same root.
    let rootObserved = false;
    /* istanbul ignore else  */
    if (observerId) {
      INSTANCE_MAP.forEach((item, key) => {
        if (key !== element) {
          if (item.observerId === observerId) {
            itemsLeft = true;
            rootObserved = true;
          }
          if (item.observer.root === root) {
            rootObserved = true;
          }
        }
      });
    }
    if (!rootObserved && root) ROOT_IDS.delete(root);
    if (observer && !itemsLeft) {
      // No more elements to observe for threshold, disconnect observer
      observer.disconnect();
    }

    // Remove reference to element
    INSTANCE_MAP.delete(element);
  }
}
```

从其实现角度来看，为了保证正确识别到子元素存在，一定要保证 `ref` 能持续传递给组件最外层 DOM，如果出现传递断裂，就会判定当前组件不在视图内，比如：

```jsx
const Component = () => {
  const [ref, inView] = useInView();

  return <Child ref={ref} />;
};

const Child = ({ loading, ref }) => {
  if (loading) {
    // 这一步会判定为 inView：false
    return <Spin />;
  }

  return <div ref={ref}>Child</div>;
};
```

如果你的代码基于 `inView` 做了阻止渲染的判定，那么这个组件进入 loading 后就无法改变状态了。为了避免这种情况，要么不要让 `ref` 的传递断掉，要么当没有拿到 `ref` 对象时判定 `inView` 为 true。

## 4 总结

分析了这么多 React- 类的库，其核心思想有两个：

1. 将原生 API 转换为框架特有 API，比如 React 系列的 Hooks 与 ref。
2. 处理生命周期导致的边界情况，比如 dom 被更新时先 `unobserve` 再重新 `observe`。

看过 [react-intersection-observer](https://github.com/thebuilder/react-intersection-observer) 的源码后，你觉得还有可优化的地方吗？欢迎讨论。

> 讨论地址是：[react-intersection-observer 源码》· Issue #257 · dt-fe/weekly](https://github.com/dt-fe/weekly/issues/257)

**如果你想参与讨论，请 [点击这里](https://github.com/dt-fe/weekly)，每周都有新的主题，周末或周一发布。前端精读 - 帮你筛选靠谱的内容。**

> 关注 **前端精读微信公众号**

<img width=200 src="https://img.alicdn.com/tfs/TB165W0MCzqK1RjSZFLXXcn2XXa-258-258.jpg">

> 版权声明：自由转载-非商用-非衍生-保持署名（[创意共享 3.0 许可证](https://creativecommons.org/licenses/by-nc-nd/3.0/deed.zh)）
