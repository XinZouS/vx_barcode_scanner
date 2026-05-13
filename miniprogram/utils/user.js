/**
 * 用户状态管理单例
 * 管理用户登录状态、token存储、用户信息
 *
 * 使用单例模式，全局共享同一个实例
 */

class UserManager {
  constructor() {
    if (UserManager.instance) {
      return UserManager.instance;
    }

    // 内存中保存当前用户信息（单例）
    this.currentUser = null;
    this.isLoggedIn = false;

    // 从本地存储恢复登录状态
    this._restoreLoginState();

    UserManager.instance = this;
  }

  /**
   * 从本地存储恢复登录状态
   * @private
   */
  _restoreLoginState() {
    try {
      const token = wx.getStorageSync('token');
      const userInfo = wx.getStorageSync('userInfo');

      if (token && userInfo) {
        this.currentUser = userInfo;
        this.isLoggedIn = true;
      }
    } catch (err) {
      console.error('恢复登录状态失败:', err);
      this.logout();
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance() {
    if (!UserManager.instance) {
      UserManager.instance = new UserManager();
    }
    return UserManager.instance;
  }

  /**
   * 用户登录
   * @param {Object} loginData - 登录返回的数据 { token, username, user_display_name, ... }
   * @returns {Object} 用户信息
   */
  login(loginData) {
    // 从返回数据中解构出 token 和不需要存储的字段
    const { token, routers, permissions, menus, ...userInfo } = loginData;

    // 保存到内存
    this.currentUser = userInfo;
    this.isLoggedIn = true;

    // 保存到本地存储
    wx.setStorageSync('token', token);
    wx.setStorageSync('userInfo', userInfo);

    return userInfo;
  }

  /**
   * 用户退出登录
   */
  logout() {
    // 清空内存
    this.currentUser = null;
    this.isLoggedIn = false;

    // 清空本地存储
    try {
      wx.removeStorageSync('token');
      wx.removeStorageSync('userInfo');
    } catch (err) {
      console.error('退出登录清理失败:', err);
    }
  }

  /**
   * 获取Token
   * @returns {string|null} token
   */
  getToken() {
    if (!this.isLoggedIn) {
      return null;
    }
    return wx.getStorageSync('token') || null;
  }

  /**
   * 获取当前用户信息
   * @returns {Object|null} 用户信息
   */
  getUserInfo() {
    return this.currentUser;
  }

  /**
   * 检查是否已登录
   * @returns {boolean}
   */
  checkLogin() {
    return this.isLoggedIn && !!this.getToken();
  }

  /**
   * 更新用户信息
   * @param {Object} newInfo - 新的用户信息
   */
  updateUserInfo(newInfo) {
    this.currentUser = { ...this.currentUser, ...newInfo };
    wx.setStorageSync('userInfo', this.currentUser);
  }
}

// 导出单例实例
const userManager = UserManager.getInstance();

module.exports = userManager;
