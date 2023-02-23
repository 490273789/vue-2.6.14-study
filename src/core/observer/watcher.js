/* @flow */
// dep和watcher的关系多对多的关系
// 一个属性会有一个dep，用来收集watcher，可以收集多个watcher
// 如渲染watcher、自定义watcher（vm.$watcher）
// 一个watcher可以对应多个dep
// dep存watcher是因为dep为发布者，需要通知观察者
// watcher中存dep
// 1、是为了watcher销毁时在dep中删除自身
// 2、为v-if做性能优化

import {
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean; // 标记这个watcher是否可用
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function, /* 更新组件的函数 */
    cb: Function, /* 回调函数，渲染组件不用传(noop) */
    options?: ?Object, /* 配置项，渲染组件传before */
    isRenderWatcher?: boolean /* 是否为渲染watcher*/
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this // 指向自身
    }
    vm._watchers.push(this) // 将watcher存放到组件的实例上
    if (options) {
      this.deep = !!options.deep // watch
      this.user = !!options.user // watch
      this.lazy = !!options.lazy // computed 初始化true
      this.sync = !!options.sync
      this.before = options.before // render
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb // 渲染组件 noop
    this.id = ++uid // uid for batching | watcher的唯一标识
    this.active = true
    this.dirty = this.lazy // for lazy watchers | computed 模式
    this.deps = [] // dep实例的集合
    this.newDeps = [] // 新dep实例的集合
    this.depIds = new Set() // dep实例id的集合
    this.newDepIds = new Set() // dep实例id的集合
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') { // 渲染watcher、computed为函数
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
      }
    }
    // 渲染watcher为undefined
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 渲染watcher执行的为渲染函数
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   * 在dep中被调用，互相添加依赖
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 如果是新的dep实例，将watcher添加到新dep中
        // 总结：新dep则互相添加依赖
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 针对类似v-if等情况，避免性能浪费，具体如下：
   * 老的deps中有，新的没有，说明更新后没有使用这个dep，那么就不需要在观察了
   * 注意清除动作都是双向的，watcher清除对应的dep，dep清除对应的watcher
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        // 清理dep中的watcher
        dep.removeSub(this)
      }
    }
    // newDepIds 变为depIds
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    // newDeps 变为deps
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * 暴露给被观察者的函数
   * Will be called when a dependency changes.
   * 依赖变化调用此函数
   */
  update () {
    /* istanbul ignore else */
    // 计算属性
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      // 渲染watcher调用
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * 调度任务接口
   * Will be called by the scheduler.
   * 暴露给调度者的函数
   */
  run () {
    if (this.active) {
      // 渲染
      const value = this.get() // 生成DOM
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   * 调用dep的 depend方法添加这个监听
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   * 1、在实例vm._watchers列表上移除自己
   * 2、组件销毁的时候将自己从订阅者依赖中移除
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        // 移除自己
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        // 将dep中的这个监听移除
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
