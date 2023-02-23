/* @flow */

import Watcher from "../observer/watcher";
import Dep, { pushTarget, popTarget } from "../observer/dep";

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving,
} from "../observer/index";

import {
  warn,
  bind,
  noop,
  hasOwn,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  invokeWithErrorHandling,
} from "../util/index";

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop,
};

export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    return this[sourceKey][key];
  };
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val;
  };

  // vm = { name: 'wsn' }
  // 获取this.name 其实是从this._data.name
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

// 初始化props、methods、data、computed、watch的入口
export function initState(vm: Component) {
  vm._watchers = [];
  const opts = vm.$options;
  if (opts.props) initProps(vm, opts.props);
  if (opts.methods) initMethods(vm, opts.methods);
  if (opts.data) {
    initData(vm);
  } else {
    observe((vm._data = {}), true /* asRootData */);
  }
  if (opts.computed) initComputed(vm, opts.computed);
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch);
  }
}

function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {};
  const props = (vm._props = {});
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = (vm.$options._propKeys = []);
  const isRoot = !vm.$parent;
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false);
  }
  for (const key in propsOptions) {
    keys.push(key);
    const value = validateProp(key, propsOptions, propsData, vm);
    /* istanbul ignore else */
    defineReactive(props, key, value);
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key);
    }
  }
  toggleObserving(true);
}

// 初始化data方法
function initData(vm: Component) {
  let data = vm.$options.data;
  data = vm._data = typeof data === "function" ? getData(data, vm) : data || {};
  // 如果data不是对象则默认赋值对象
  if (!isPlainObject(data)) {
    data = {};
  }
  // proxy data on instance
  const keys = Object.keys(data);
  const props = vm.$options.props;
  let i = keys.length;
  while (i--) {
    const key = keys[i];
    // 判断data是否和props重名
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== "production" &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        );
    } else if (!isReserved(key)) {
      // 判断属性是否以 $ 或者 _开头
      // 用Object.definedProperty将this._data[key] 代理到 this上，可以直接使用this[key]
      // 你在使用this.a 的时候，实际上调用的是this._data.a
      proxy(vm, `_data`, key);
    }
  }
  // observe data
  observe(data, true /* asRootData */);
}

// 如果data是函数，执行函数获取对象
export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 初始化data的时候不要做依赖收集，依赖收集实在初始化视图的时候调用
  pushTarget();
  try {
    return data.call(vm, vm);
  } catch (e) {
    handleError(e, vm, `data()`);
    return {};
  } finally {
    popTarget();
  }
}

const computedWatcherOptions = { lazy: true };

// 初始化计算属性
function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = (vm._computedWatchers = Object.create(null));
  // computed properties are just getters during SSR
  const isSSR = isServerRendering();

  for (const key in computed) {
    const userDef = computed[key];
    // 如果是对象则获取对象上定义的get方法
    // 如果事函数则直接使用
    const getter = typeof userDef === "function" ? userDef : userDef.get;


    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      );
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef);
    }
  }
}

export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering();
  // 对函数的处理
  if (typeof userDef === "function") {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef);
    sharedPropertyDefinition.set = noop;
  } else {
    // 对对象的处理
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop;
    sharedPropertyDefinition.set = userDef.set || noop;
  }
  // 挂在到this上
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

// computed的getter方法实现
function createComputedGetter(key) {
  return function computedGetter() {
    const watcher = this._computedWatchers && this._computedWatchers[key];
    if (watcher) {
      if (watcher.dirty) {
        // 调用evaluation方法后dirty会变为false
        // 在以来的值没有改变之前不会再调用此方法，而是直接使用缓存的值
        // 会调用用户写的getter方法
        watcher.evaluate();
      }
      if (Dep.target) {
        watcher.depend();
      }
      return watcher.value;
    }
  };
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this);
  };
}

function initMethods(vm: Component, methods: Object) {

  for (const key in methods) {

    vm[key] =
      typeof methods[key] !== "function" ? noop : bind(methods[key], vm);
  }
}

// 初始化侦听属性
function initWatch(vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key];
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}

function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler;
    handler = handler.handler;
  }
  if (typeof handler === "string") {
    handler = vm[handler];
  }
  return vm.$watch(expOrFn, handler, options);
}

export function stateMixin(Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {};
  dataDef.get = function () {
    return this._data;
  };
  const propsDef = {};
  propsDef.get = function () {
    return this._props;
  };

  Object.defineProperty(Vue.prototype, "$data", dataDef);
  Object.defineProperty(Vue.prototype, "$props", propsDef);

  Vue.prototype.$set = set;
  Vue.prototype.$delete = del;

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this;
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options);
    }
    options = options || {};
    options.user = true;
    const watcher = new Watcher(vm, expOrFn, cb, options);
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`;
      pushTarget();
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info);
      popTarget();
    }
    return function unwatchFn() {
      watcher.teardown();
    };
  };
}
