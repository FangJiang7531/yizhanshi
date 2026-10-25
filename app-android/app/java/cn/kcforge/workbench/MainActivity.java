package cn.kcforge.workbench;

import android.animation.ObjectAnimator;
import android.animation.Animator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.OvershootInterpolator;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * 个人数字工作台 · Android 壳（WebView Hybrid）。
 *
 * 启动体验（本次优化）：
 * - 冷启动窗口背景 = 全屏启动图 → 点图标即切入启动图，全程无白屏；
 * - Activity 内启动层显示同一张图 + 底部「启动中…」三点动态跳动；
 * - 首页就绪后 360ms 淡出启动层，平滑进入登录界面；
 * - 加载全程停留在启动图上；超时/失败按「网络问题 / 服务器问题」分别提示并支持重试。
 *
 * 安全基线（防入侵）：
 * - 只信任白名单域名（站点 + OAuth 授权域），其余链接一律交给系统浏览器；
 * - 证书校验失败一律中止（不实现 onReceivedSslError proceed 旁路）；
 * - 禁用 file/content 协议访问，禁止明文流量（仅本机调试地址例外）；
 * - 唯一 INTERNET 权限，allowBackup=false，导出组件仅启动 Activity。
 */
public class MainActivity extends Activity {

    /** 线上站点（正式地址） */
    private static final String BASE_URL = "https://kcforge.cn";

    /**
     * 站内导航白名单：自有域名 + OAuth 授权必须经过的第三方域
     *（OAuth 必须在应用内完成，否则登录 Cookie 落在外部浏览器，应用内不生效）。
     * localhost / 10.0.2.2 仅供开发调试连本机 dev 服务器。
     */
    private static final String[] ALLOWED_HOSTS = {
            "kcforge.cn", "www.kcforge.cn",
            "github.com", "login.github.com",
            "accounts.google.com", "oauth2.googleapis.com",
            "localhost", "127.0.0.1", "10.0.2.2",
    };

    /** 现代化 UA：Google 登录拦截 WebView 默认 UA，用标准 Chrome UA 通过检测 */
    private static final String APP_UA =
            "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

    /** 启动加载超时（毫秒） */
    private static final long SPLASH_TIMEOUT_MS = 15_000;

    private WebView web;
    private boolean mainFrameFailed = false;
    private long lastBackAt = 0;

    /** 文件选择回调（编辑器插图 / 头像上传） */
    private ValueCallback<Uri[]> fileCallback;
    private static final int REQ_FILE = 51001;

    // ───────── 启动层 ─────────
    private FrameLayout rootLayout;
    private FrameLayout splashLayer;    // 全屏启动图 + 底部文案容器
    private TextView loadingText;      // 「启动中」
    private TextView[] dotViews;       // 三个动态点
    private List<Animator> dotAnims = new ArrayList<>();
    private TextView errorText;        // 超时/失败提示
    private Button retryButton;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean splashDone = false;
    private final Runnable timeoutRunnable = new Runnable() {
        @Override public void run() { onSplashTimeout(); }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        buildSplashLayer();
        setContentView(rootLayout);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);            // 站点为全功能 Web 应用
        s.setDomStorageEnabled(true);            // 主题/草稿本地存储依赖 localStorage
        s.setDatabaseEnabled(true);
        s.setUserAgentString(APP_UA);
        s.setAllowFileAccess(false);             // 禁 file:// 协议
        s.setAllowContentAccess(false);          // 禁 content:// 协议
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); // 禁混合内容
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            s.setSafeBrowsingEnabled(true);      // Google Safe Browsing 显式开启
        }

        // Cookie：登录会话持久化（HttpOnly Cookie 由 CookieManager 全权管理）
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true); // OAuth 回跳域需要
        cm.flush();

        web.setWebViewClient(new AppWebViewClient());
        web.setWebChromeClient(new AppChromeClient());
        web.setDownloadListener(new AppDownloadListener());

        // 启动流程：展示启动图 → 后台加载首页 → 就绪淡出
        startSplashLoading(savedInstanceState);
    }

    // ═══════════════════════ 启动层（图 + 启动中… + 三点 + 错误提示） ═══════════════════════

    /** 纯代码构建启动层（与窗口背景同图，实现零白屏衔接） */
    private void buildSplashLayer() {
        rootLayout = new FrameLayout(this);

        FrameLayout.LayoutParams webLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        rootLayout.addView(web, webLp);

        splashLayer = new FrameLayout(this);
        FrameLayout.LayoutParams splashLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        splashLayer.setBackgroundColor(Color.parseColor("#0B1230"));

        ImageView splashImage = new ImageView(this);
        // nodpi 资源 + src + CENTER_CROP：按屏裁切铺满，不拉伸变形
        splashImage.setImageResource(R.drawable.splash_full);
        splashImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        FrameLayout.LayoutParams imgLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        splashLayer.addView(splashImage, imgLp);

        // 底部：启动中 + 三个点
        LinearLayout bottomBox = new LinearLayout(this);
        bottomBox.setOrientation(LinearLayout.VERTICAL);
        bottomBox.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams boxLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        final float density = getResources().getDisplayMetrics().density;
        boxLp.bottomMargin = (int) (72 * density);
        splashLayer.addView(bottomBox, boxLp);

        LinearLayout textRow = new LinearLayout(this);
        textRow.setOrientation(LinearLayout.HORIZONTAL);
        textRow.setGravity(Gravity.CENTER_VERTICAL);
        bottomBox.addView(textRow);

        loadingText = new TextView(this);
        loadingText.setText("启动中");
        loadingText.setTextColor(0xFFEAF0FF);
        loadingText.setTextSize(15);
        textRow.addView(loadingText,
                new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout dotsRow = new LinearLayout(this);
        dotsRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams dotsLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dotsLp.leftMargin = (int) (6 * density);
        dotsRow.setLayoutParams(dotsLp);
        textRow.addView(dotsRow);

        dotViews = new TextView[3];
        for (int i = 0; i < 3; i++) {
            TextView dot = new TextView(this);
            dot.setText("·");
            dot.setTextColor(0xFF7FA0FF);
            dot.setTextSize(22);
            dot.setLineSpacing(0, 0);
            dot.setIncludeFontPadding(false);
            dot.setPadding((int) (1.5f * density), 0, (int) (1.5f * density), 0);
            dotsRow.addView(dot, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            dotViews[i] = dot;
        }

        // 错误提示（默认隐藏）
        LinearLayout errorBox = new LinearLayout(this);
        errorBox.setOrientation(LinearLayout.VERTICAL);
        errorBox.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams errLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        errLp.bottomMargin = (int) (56 * density);
        splashLayer.addView(errorBox, errLp);

        errorText = new TextView(this);
        errorText.setTextColor(0xFFEAF0FF);
        errorText.setTextSize(14);
        errorText.setGravity(Gravity.CENTER);
        errorText.setShadowLayer(6, 0, 2, 0xB3000000);
        errorText.setVisibility(View.GONE);
        errorBox.addView(errorText, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        retryButton = new Button(this);
        retryButton.setText("重试");
        retryButton.setTextColor(Color.WHITE);
        retryButton.setTextSize(14);
        retryButton.setAllCaps(false);
        // 半透明胶囊按钮（避免依赖系统 Button 背景）
        android.graphics.drawable.GradientDrawable retryBg = new android.graphics.drawable.GradientDrawable();
        retryBg.setColor(0x665152E8);
        retryBg.setCornerRadius(22 * density);
        retryBg.setStroke((int) Math.max(1, density * 0.75f), 0x99FFFFFF);
        retryButton.setBackground(retryBg);
        retryButton.setVisibility(View.GONE);
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                (int) (96 * density), (int) (40 * density));
        btnLp.topMargin = (int) (14 * density);
        btnLp.gravity = Gravity.CENTER_HORIZONTAL;
        errorBox.addView(retryButton, btnLp);
        retryButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { retryLoading(); }
        });

        rootLayout.addView(splashLayer, splashLp);
    }

    /** 启动加载：启动层就位 → 加载首页 → 计时 */
    private void startSplashLoading(Bundle savedInstanceState) {
        splashDone = false;
        errorText.setVisibility(View.GONE);
        retryButton.setVisibility(View.GONE);
        loadingText.setVisibility(View.VISIBLE);
        for (TextView dot : dotViews) dot.setVisibility(View.VISIBLE);
        startDots();

        // 冷启动恢复（进程被杀后不重载丢失状态）
        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
            if (web.getUrl() != null) {
                // 已有历史：等 onPageFinished 即淡出；仍计时防卡死
                armTimeout();
                return;
            }
        }
        web.loadUrl(BASE_URL);
        armTimeout();
    }

    private void armTimeout() {
        handler.removeCallbacks(timeoutRunnable);
        handler.postDelayed(timeoutRunnable, SPLASH_TIMEOUT_MS);
    }

    /** 三点依次上下弹跳（交错 120ms，往复） */
    private void startDots() {
        stopDots();
        for (int i = 0; i < dotViews.length; i++) {
            ObjectAnimator a = ObjectAnimator.ofFloat(dotViews[i], "translationY", 0f, -14f);
            a.setDuration(380);
            a.setStartDelay(i * 120L);
            a.setRepeatCount(ObjectAnimator.INFINITE);
            a.setRepeatMode(ObjectAnimator.REVERSE);
            a.setInterpolator(new OvershootInterpolator(1.8f));
            a.start();
            dotAnims.add(a);
        }
    }

    private void stopDots() {
        for (Animator a : dotAnims) a.cancel();
        dotAnims.clear();
        for (TextView dot : dotViews) dot.setTranslationY(0f);
    }

    /** 首页就绪：淡出启动层，平滑进入登录界面 */
    private void finishSplash() {
        if (splashDone) return;
        splashDone = true;
        handler.removeCallbacks(timeoutRunnable);
        stopDots();
        splashLayer.animate()
                .alpha(0f)
                .setDuration(360)
                .withEndAction(new Runnable() {
                    @Override public void run() { splashLayer.setVisibility(View.GONE); }
                })
                .start();
    }

    /** 超时：区分网络问题 / 服务器问题 */
    private void onSplashTimeout() {
        if (splashDone) return;
        web.stopLoading();
        showError(isNetworkAvailable()
                ? "服务器处于更新或异常状态，并非您的网络问题"
                : "网络连接不可用，请检查您的网络");
    }

    /** 启动阶段失败（主文档加载出错） */
    private void onSplashError() {
        if (splashDone) return;
        web.stopLoading();
        showError(isNetworkAvailable()
                ? "服务器处于更新或异常状态，并非您的网络问题"
                : "网络连接不可用，请检查您的网络");
    }

    private void showError(String message) {
        stopDots();
        loadingText.setVisibility(View.GONE);
        for (TextView dot : dotViews) dot.setVisibility(View.GONE);
        errorText.setText(message);
        errorText.setVisibility(View.VISIBLE);
        retryButton.setVisibility(View.VISIBLE);
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private void retryLoading() {
        errorText.setVisibility(View.GONE);
        retryButton.setVisibility(View.GONE);
        loadingText.setVisibility(View.VISIBLE);
        for (TextView dot : dotViews) dot.setVisibility(View.VISIBLE);
        startDots();
        web.loadUrl(BASE_URL);
        armTimeout();
    }

    /** 网络可用性（有活动网络且具备互联网能力） */
    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            Network network = cm.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return false;
        }
    }

    // ═══════════════════════ 命名内部类（避免 R8 匿名类 bug） ═══════════════════════

    /** 页面导航、错误处理与启动过渡 */
    private class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleUrl(request.getUrl());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleUrl(Uri.parse(url));
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            mainFrameFailed = false;
            // 启动阶段：任何主文档就绪（含登录页）都视为启动完成，平滑淡出启动图
            if (!splashDone && url != null && !url.startsWith("file:///android_asset/")) {
                finishSplash();
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // 仅主文档失败才处理（图片等子资源失败不打扰）
            if (!request.isForMainFrame()) return;
            if (!splashDone) {
                // 启动阶段：停在启动图上给出分类提示
                onSplashError();
                return;
            }
            mainFrameFailed = true;
            view.loadUrl("file:///android_asset/offline.html");
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // 安全红线：证书异常一律中止，绝不能 proceed
            handler.cancel();
            if (!splashDone) {
                onSplashError();
            } else {
                Toast.makeText(MainActivity.this, "安全连接校验失败，已阻止访问", Toast.LENGTH_LONG).show();
            }
        }
    }

    /** 文件选择（图片上传）与权限弹窗拦截 */
    private class AppChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            Intent i = new Intent(Intent.ACTION_GET_CONTENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("image/*");
            try {
                startActivityForResult(Intent.createChooser(i, "选择图片"), REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                Toast.makeText(MainActivity.this, "未找到可用的文件选择器", Toast.LENGTH_SHORT).show();
                return false;
            }
            return true;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            // 站点无定位功能，一律拒绝
            cb.invoke(origin, false, false);
        }
    }

    /** 短链文件下载 → 系统下载管理器 */
    private class AppDownloadListener implements DownloadListener {
        @Override
        public void onDownloadStart(String url, String ua, String disposition, String mime, long size) {
            try {
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(req);
                Toast.makeText(MainActivity.this, "已开始下载", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                openExternal(Uri.parse(url));
            }
        }
    }

    // ═══════════════════════ 生命周期与交互 ═══════════════════════

    /** URL 分流：白名单内站点继续加载；外站链接交给系统浏览器（防钓鱼/恶意页内嵌） */
    private boolean handleUrl(Uri uri) {
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();

        // 只放行 http(s)；mailto/tel/intent 等交给系统
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            openExternal(uri);
            return true;
        }
        for (String allowed : ALLOWED_HOSTS) {
            if (host.equals(allowed)) {
                return false; // WebView 内继续加载
            }
        }
        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "未找到可打开该链接的应用", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(
                    resultCode == RESULT_OK && data != null && data.getData() != null
                            ? new Uri[]{data.getData()}
                            : null);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        // 启动层还在展示且曾失败 → 自动重试一次
        if (!splashDone && errorText.getVisibility() == View.VISIBLE) {
            retryLoading();
            return;
        }
        // 会话内从离线页恢复时自动重试
        if (mainFrameFailed) {
            mainFrameFailed = false;
            web.loadUrl(BASE_URL);
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // 返回键：优先沿 Web 历史后退；无历史时双击退出（保留登录态）
        if (keyCode == KeyEvent.KEYCODE_BACK && web.canGoBack()) {
            web.goBack();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            long now = System.currentTimeMillis();
            if (now - lastBackAt < 2000) {
                moveTaskToBack(true);
            } else {
                lastBackAt = now;
                Toast.makeText(this, "再按一次退出", Toast.LENGTH_SHORT).show();
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(timeoutRunnable);
        stopDots();
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }
}
