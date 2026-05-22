// pages/login/login.js
const request = require('../../utils/request');
const userManager = require('../../utils/user');

const STORAGE_KEY = 'remembered_login';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

Page({
  data: {
    username: '',
    password: '',
    showPassword: false,
    rememberMe: false,
    loading: false,

    // 焦点控制
    usernameFocus: true,  // 页面加载后自动聚焦用户名
    passwordFocus: false,

    // 键盘避让：卡片上移量(px)
    cardOffset: 0,

    // 错误信息
    usernameError: '',
    passwordError: ''
  },

  /**
   * 用户名输入
   */
  onUsernameInput(e) {
    this.setData({
      username: e.detail.value,
      usernameError: ''  // 清除错误
    });
  },

  /**
   * 用户名获得焦点 — 卡片上移 50px
   */
  onUsernameFocus() {
    this.setData({ cardOffset: 50, usernameFocus: true, passwordFocus: false });
  },

  /**
   * 用户名失去焦点 — 恢复（除非密码获得焦点）
   */
  onUsernameBlur() {
    // 稍等让 password focus 先触发
    setTimeout(() => {
      if (!this.data.passwordFocus) {
        this.setData({ cardOffset: 0 });
      }
    }, 100);
  },

  /**
   * 密码输入
   */
  onPasswordInput(e) {
    this.setData({
      password: e.detail.value,
      passwordError: ''  // 清除错误
    });
  },

  /**
   * 密码获得焦点 — 卡片上移 160px
   */
  onPasswordFocus() {
    this.setData({ cardOffset: 160, usernameFocus: false, passwordFocus: true });
  },

  /**
   * 密码失去焦点 — 恢复
   */
  onPasswordBlur() {
    this.setData({ cardOffset: 0 });
  },

  /**
   * 切换密码可见性
   */
  togglePasswordVisibility() {
    this.setData({
      showPassword: !this.data.showPassword
    });
  },

  /**
   * 切换记住登录
   */
  toggleRemember() {
    const newVal = !this.data.rememberMe;
    this.setData({ rememberMe: newVal });
    // 取消勾选时清除本地记录
    if (!newVal) {
      wx.removeStorageSync(STORAGE_KEY);
    }
  },

  /**
   * 用户名输入完成，跳转密码输入
   */
  focusPassword() {
    this.setData({
      usernameFocus: false,
      passwordFocus: true
    });
  },

  /**
   * 执行登录
   */
  doLogin() {
    // 清除之前的错误
    this.setData({
      usernameError: '',
      passwordError: ''
    });

    const { username, password, rememberMe } = this.data;

    // 表单验证
    if (!username.trim()) {
      this.setData({ usernameError: '请输入用户名' });
      return;
    }

    if (!password) {
      this.setData({ passwordError: '请输入密码' });
      return;
    }

    // 开始登录
    this.setData({ loading: true });

    // 调用登录接口
    request.post('/rbac/login/', {
      username: username.trim(),
      password: password,
      remember_me: rememberMe
    }).then(data => {
      // 登录成功
      this.setData({ loading: false });

      // 记住登录：明文保存用户名、密码和时间戳
      if (rememberMe) {
        wx.setStorageSync(STORAGE_KEY, {
          username: username.trim(),
          password: password,
          timestamp: Date.now()
        });
      }

      // 保存用户信息（data 是 response.data.data）
      userManager.login(data);

      wx.showToast({
        title: '登录成功',
        icon: 'success',
        duration: 1500
      });

      // 延迟返回主页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);

    }).catch(err => {
      this.setData({ loading: false });

      // 处理具体字段错误
      if (err.raw && err.raw.data) {
        const errorData = err.raw.data;

        // 非字段错误（如 non_field_errors）
        if (errorData.non_field_errors) {
          wx.showToast({
            title: errorData.non_field_errors[0] || '登录失败',
            icon: 'none',
            duration: 2500
          });
        }

        // 字段错误
        if (errorData.username) {
          this.setData({ usernameError: errorData.username[0] });
        }
        if (errorData.password) {
          this.setData({ passwordError: errorData.password[0] });
        }

        // 如果没有具体字段错误，显示通用错误
        if (!errorData.username && !errorData.password && errorData.detail) {
          let errorMsg = errorData.detail;
          if (typeof errorMsg === 'object') {
            errorMsg = JSON.stringify(errorMsg);
          }
          wx.showToast({
            title: errorMsg,
            icon: 'none',
            duration: 2500
          });
        }
      } else {
        // 网络错误或其他错误
        const errorMsg = err.message || '登录失败，请重试';
        wx.showToast({
          title: errorMsg,
          icon: 'none',
          duration: 2500
        });
      }
    });
  },

  /**
   * 从本地存储加载记住的登录信息
   */
  loadRememberedLogin() {
    try {
      const stored = wx.getStorageSync(STORAGE_KEY);
      if (!stored) return;

      const { username, password, timestamp } = stored;
      const now = Date.now();

      // 检查是否在 7 天有效期内
      if (now - timestamp <= TTL_MS) {
        this.setData({
          username: username || '',
          password: password || '',
          rememberMe: true
        });
      } else {
        // 过期，清除
        wx.removeStorageSync(STORAGE_KEY);
      }
    } catch (e) {
      // 数据异常，清除
      wx.removeStorageSync(STORAGE_KEY);
    }
  },

  /**
   * 生命周期 - 页面加载
   */
  onLoad() {
    // 如果已经登录，直接返回
    if (userManager.checkLogin()) {
      wx.navigateBack();
      return;
    }
    // 加载记住的登录信息
    this.loadRememberedLogin();
  },

  /**
   * 生命周期 - 页面显示
   */
  onShow() {
    // 每次显示时，自动聚焦用户名输入框
    this.setData({
      usernameFocus: true,
      passwordFocus: false
    });
  }
});
