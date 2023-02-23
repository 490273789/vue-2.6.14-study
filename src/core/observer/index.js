/* @flow */

import Dep from "./dep";
import VNode from "../vdom/vnode";
import { arrayMethods } from "./array";
import {
  def,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isValidArrayIndex,
  isServerRendering,
} from "../util/index";

const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true;

export function toggleObserving(value: boolean) {
  shouldObserve = value;
}

/**
 * Observer class that is attached to each observedx
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  // 只有rootData会调用
  vmCount: number; // number of vms that have this object as root $data
  constructor(value: any) {
    this.value = value;
    // 处理数组时使用push、pop等方法时使用
    // 对象是在$set(obj, val)时使用
    // 只有对象或者数组才有observer实例
    this.dep = new Dep();
    // 如果是组件的根Observer 值会自增1
    this.vmCount = 0;

    // 给data上添加一个属性 __ob__ ,值是当前的Observer实例
    // 作用：1、防止重复劫持数据，下次循环如果对象或数组上有这个值就不需要在劫持
    // 2、可以在其他地方获取当前的实例
    def(value, "__ob__", this);
    if (Array.isArray(value)) {
      // 函数劫持、切片编程
      if (hasProto) {
        // 如果有__proto__, 则将数组的__proto__ 指向arrayMethods
        protoAugment(value, arrayMethods);
      } else {
        // 如果没有将重写的方法定义到函数自身
        copyAugment(value, arrayMethods, arrayKeys);
      }
      // 遍历数组将每个属性都添加响应式，处理 {arr: [{a:1}]}这种情况
      this.observeArray(value);
    } else {
      // 处理对象
      this.walk(value);
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]);
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]);
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    def(target, key, src[key]);
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe(value: any, asRootData: ?boolean): Observer | void {
  // 如果不是对象 或者 是VNode的实例，直接退出，不需要观察
  if (!isObject(value) || value instanceof VNode) {
    return;
  }

  // 定义一个观察者
  let ob: Observer | void;
  // 所有的响应式数组和对象都会有一个__ob__属性，所以有这个属性就代表已经观测过了，不需要走观测流程了
  if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
    ob = value.__ob__;
  } else if (
    // Object.isExtensible 值是否否可扩展
    // Object.preventExtensions，Object.seal 或 Object.freeze 方法都可以标记一个对象为不可扩展
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 它是一个对象或者数组、可扩展、不是服务器端渲染、_isVue是false
    // 走监听流程
    ob = new Observer(value);
  }
  if (asRootData && ob) {
    ob.vmCount++;
  }
  return ob;
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep();
  // 获取当前属性的属性描述符，如果是不可配置的直接返回
  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get;
  const setter = property && property.set;
  // 如果属性之前没有getter或者有setter
  // 就会获取这个属性的值，作为下一次调用getter的返回值
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }
  // 递归操作，如果value是对象，只有value是对象或者数组才会有返回值，否则返回undefined
  // {a:{c:1}, b:[1,2,3]}
  let childOb = !shallow && observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter() {
      // 如果有getter则，调用现有的getter，如果没有getter，则使用上面的val
      const value = getter ? getter.call(obj) : val;
      // 在初始化数据的时候不需要添加响应式
      // 只有在页面用到了或者其他地方用到的属性才需要添加
      if (Dep.target) {
        dep.depend(); // 和Dep.target互相添加依赖关系
        if (childOb) {
          childOb.dep.depend();
          if (Array.isArray(value)) {
            // 对数组的每一项执行dep.depend()
            dependArray(value);
          }
        }
      }
      return value;
    },
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val;
      // 性能优化，值不变则不需要更新视图
      //  (newVal !== newVal && value !== value) 比较Nan
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }

      // #7981: for accessor properties without setter
      if (getter && !setter) return; // 存储器属性没有setter的情况也不会更新watcher
      if (setter) {
        setter.call(obj, newVal);
      } else {
        // 闭包,设置完val后，get也可以获取到
        val = newVal;
      }
      // 新添加的值递归添加监听 push({a:1})
      childOb = !shallow && observe(newVal);
      // 通知视图更新
      dep.notify();
    },
  });
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  // 是数组的情况
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 设置数组的长度
    target.length = Math.max(target.length, key);
    // 将设置的值替换到对应的索引中
    target.splice(key, 1, val);
    return val;
  }

  // 如果key为原型上的属性不需要更新视图
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }
  // 如果这个对象或数组已经添加了监听
  // TODO: ob.vmCount是啥？
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    return val;
  }

  // 如果ob不存在说明target不是一个响应式对象，不需要更新视图
  if (!ob) {
    target[key] = val;
    return val;
  }

  // 将新添加的数据添加响应式
  defineReactive(ob.value, key, val);
  // 需要自己触发更新
  ob.dep.notify();
  return val;
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any) {

  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 数组的情况key为index
    // 调用splice方法会自动触发响应式
    target.splice(key, 1);
    return;
  }
  // TODO:
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    return;
  }

  // 如果不是target上的属性也不需要管
  if (!hasOwn(target, key)) {
    return;
  }

  delete target[key];

  // 如果不是响应式对象则不需要通知视图更新
  if (!ob) {
    return;
  }
  ob.dep.notify();
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}
