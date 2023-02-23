/* @flow */

import { parse } from "./parser/index";
import { optimize } from "./optimizer";
import { generate } from "./codegen/index";
import { createCompilerCreator } from "./create-compiler";

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// 将html代码转化为ast语法树，可以用ast树来描述语言本身
export const createCompiler = createCompilerCreator(function baseCompile(
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 解析
  const ast = parse(template.trim(), options);
  if (options.optimize !== false) {
    // 优化静态节点
    optimize(ast, options);
  }
  // 通过ast语法树生成render函数
  const code = generate(ast, options);
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns,
  };
});
