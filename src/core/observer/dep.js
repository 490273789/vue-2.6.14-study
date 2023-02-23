/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
// 被观察者
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>; // 观察者列表

  constructor () {
    this.id = uid++ // 被观察者的唯一标识
    this.subs = []
  }

  // subs中添加一个watcher
  // 在watcher中被调用
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  // subs中删除watcher
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 在有target（watcher）的情况下，添加依赖，addDep为watcher上的方法
  // 在watcher中被调用
  // 在添加响应式数据的getter中被调用
  depend () {
    if (Dep.target) {
      // 将和这个dep添加到watcher的依赖中
      Dep.target.addDep(this)
    }
  }

  // 在添加响应式数据的setter中被调用
  // 依次执行每个watcher的update方法
  notify () {
    // stabilize the subscriber list first
    // 缓存subs（watcher）列表
    const subs = this.subs.slice()
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
// 依次只能执行一个watcher
// 标记当前要处理的dep，target为watcher
Dep.target = null
const targetStack = []

// targetStack中添加一个target，并将类的target改为当前target
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

// 出栈target，并将类的target指向栈顶的target
export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
