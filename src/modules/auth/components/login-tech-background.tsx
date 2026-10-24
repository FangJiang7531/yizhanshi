/**
 * 登录页科技感背景（纯 CSS/SVG 静态实现，无 canvas、无第三方依赖）：
 * - 深空渐变底 + 主题色极光晕；
 * - 网格透视地平面；
 * - 漂浮的「命令行 / 计算式 / 代码片段 / 二进制」等计算机元素（半透明，不喧宾夺主）；
 * - 等宽字体打字机光标动画；prefers-reduced-motion 全量降级。
 *
 * 层级：背景 z-0（pointer-events:none），登录卡片由页面自身渲染，不被遮挡。
 */
export function LoginTechBackground() {
  return (
    <div className="login-bg" aria-hidden>
      {/* 深空渐变底 */}
      <div className="login-bg-base" />

      {/* 透视网格地平面 */}
      <div className="login-bg-grid" />

      {/* 极光晕 */}
      <div className="login-bg-aurora" />

      {/* 计算机元素漂浮层 */}
      <div className="login-bg-items">
        <pre className="login-item login-item-1">
          <span className="login-prompt">$</span> deploy --prod{"\n"}
          <span className="login-ok">✓ build 2.3s</span>
          <span className="login-caret" />
        </pre>
        <pre className="login-item login-item-2">
          f(x) = Σ <span className="login-dim">n=1..∞</span> 1/n²{"\n"}
          <span className="login-dim">     = π²/6 ≈ 1.6449</span>
        </pre>
        <pre className="login-item login-item-3">
          <span className="login-kw">const</span> workbench ={" "}
          <span className="login-str">&quot;一站式&quot;</span>;{"\n"}
          <span className="login-kw">if</span> (idea) {"{"} <span className="login-fn">ship</span>(idea); {"}"}
        </pre>
        <pre className="login-item login-item-4">01001000 01101001{"\n"}01110101 01110011 01100101 01110010</pre>
        <pre className="login-item login-item-5">
          <span className="login-dim">2^10 = 1024</span>
          {"\n"}√2 ≈ 1.41421{"\n"}e ≈ 2.71828
        </pre>
        <pre className="login-item login-item-6">
          <span className="login-prompt">$</span> git push origin main{"\n"}
          <span className="login-ok">✓ 100% —</span> done
        </pre>
        <pre className="login-item login-item-7">while (alive) {"{"} learn(); build(); {"}"}</pre>
        <pre className="login-item login-item-8">∫₀^∞ e^(-x²)dx = √π/2</pre>
      </div>

      {/* 顶部与底部渐隐，衔接内容区 */}
      <div className="login-bg-fade" />
    </div>
  );
}
