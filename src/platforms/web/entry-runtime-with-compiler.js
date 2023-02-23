/* @flow */

import config from "core/config";
import { warn, cached } from "core/util/index";
import { mark, measure } from "core/util/perf";

import Vue from "./runtime/index";
import { query } from "./util/index";
import { compileToFunctions } from "./compiler/index";
import {
  shouldDecodeNewlines,
  shouldDecodeNewlinesForHref,
} from "./util/compat";

const idToTemplate = cached((id) => {
  const el = query(id);
  return el && el.innerHTML;
});

// 当代码执行import Vue from 'vue'的时候，就是从这个入口来初始化Vue。
// 第一个初始化的过程new Vue - init - $mount - compile - render - VNode - patch - DOM

// 缓存$mount方法
const mount = Vue.prototype.$mount;

// 重写$mount方法
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 获取el的DOM对象
  el = el && query(el);

  /* istanbul ignore if */
  // Vue 不能挂载在 body、html 这样的根节点上。
  if (el === document.body || el === document.documentElement) {
    return this;
  }

  const options = this.$options;
  // resolve template/el and convert to render function
  // 如果没有定义 render 方法，则会把 el 或者 template 字符串转换成 render 方法
  // 优先级，在有el的情况下 1.render() 2.template 3.外部template
  // 1.render()
  if (!options.render) {
    let template = options.template;
    if (template) { // 2.template
      if (typeof template === "string") {
        if (template.charAt(0) === "#") {
          template = idToTemplate(template);
        }
      } else if (template.nodeType) {
        template = template.innerHTML;
      } else {
        if (process.env.NODE_ENV !== "production") {
          warn("invalid template option:" + template, this);
        }
        return this;
      }
    } else if (el) { // 3.外部template
      template = getOuterHTML(el);
    }
    if (template) {

      // compileToFunctions 将template转换为render函数, 然后将render方法挂载在options.render
      const { render, staticRenderFns } = compileToFunctions(
        template,
        {
          outputSourceRange: process.env.NODE_ENV !== "production",
          shouldDecodeNewlines,
          shouldDecodeNewlinesForHref,
          delimiters: options.delimiters,
          comments: options.comments,
        },
        this
      );
      options.render = render;
      options.staticRenderFns = staticRenderFns;
    }
  }
  // 在重写的mount方法中执行缓存的mounted
  return mount.call(this, el, hydrating);
};

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML(el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML;
  } else {
    const container = document.createElement("div");
    container.appendChild(el.cloneNode(true));
    return container.innerHTML;
  }
}

Vue.compile = compileToFunctions;

export default Vue;
