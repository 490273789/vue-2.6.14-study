import { initMixin } from "./init";
import { stateMixin } from "./state";
import { renderMixin } from "./render";
import { eventsMixin } from "./events";
import { lifecycleMixin } from "./lifecycle";
import { warn } from "../util/index";
// Vue的构造函数
// 方便将不同的功能写成插件来对原型进行扩展
function Vue(options) {
  // 如果不是生产环境并且当前this不是Vue的实例
  // 需要使用new关键字调用这个构造函数
  if (process.env.NODE_ENV !== "production" && !(this instanceof Vue)) {
    warn("Vue is a constructor and should be called with the `new` keyword");
  }
  this._init(options);
}
// MVVM不能跳过数据去更新视图，Vue中的$ref违反了这一规定
// 给vue的prototype上扩展方法
// 这里没有使用Class，是因为Vue将这些拓展功能分散到不同的模块中去实现，易于代码的维护和管理
// 如下模块就是给Vue的原型上添加对应的方法
initMixin(Vue); // _init
stateMixin(Vue); // $data、$props、$set、$delete、$watch
eventsMixin(Vue); // $on、$once、$off、$emit
lifecycleMixin(Vue); // _update、$forceUpdate、$destroy
renderMixin(Vue); // _render、 $nextTick

export default Vue;
