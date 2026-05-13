/**
 * 统一网络请求工具
 * 封装 wx.request，提供类似 axios 的拦截器功能
 * 自动处理 Token 注入和 401 响应
 *
 * 使用方式：
 * const request = require('../../utils/request');
 * request.get('/api/endpoint').then(res => {}).catch(err => {});
 * request.post('/api/endpoint', data).then(res => {});
 */

const userManager = require('./user');

// ============================================================
// 配置区 - API 域名
// ============================================================
// 生产环境：https://boheyuan.cn/api
// 开发环境：http://localhost:8000/api
const BASE_URL = 'https://boheyuan.cn/api';  // ← 生产域名
// ============================================================

/**
 * 显示错误提示
 * @param {string} msg - 错误信息
 */
function showError(msg) {
  wx.showToast({
    title: msg,
    icon: 'none',
    duration: 2500
  });
}

/**
 * 处理 401 未授权错误
 * @private
 */
function handleUnauthorized() {
  userManager.logout();

  // 如果当前不是登录页，则跳转
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && currentPage.route !== 'pages/login/login') {
    wx.redirectTo({
      url: '/pages/login/login'
    });
  }
}

/**
 * 统一请求方法
 * @param {Object} options - 请求配置
 * @returns {Promise}
 */
function request(options) {
  return new Promise((resolve, reject) => {
    const token = userManager.getToken();

    // 请求配置
    const config = {
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        ...options.header
      }
    };

    // 注入 Token
    if (token) {
      config.header['Authorization'] = token;
    }

    // 发送请求
    wx.request({
      ...config,
      success: (res) => {
        const { statusCode, data } = res;

        // 网络层面成功
        if (statusCode >= 200 && statusCode < 300) {
          // 业务层面判断
          if (data.code === 0) {
            // 成功
            resolve(data.data);
          } else {
            // 业务错误
            const errMsg = data.detail || data.msg || '请求失败';
            showError(errMsg);
            reject({ code: data.code, message: errMsg, raw: res });
          }
        } else if (statusCode === 401) {
          // 未授权
          showError('认证失败，请重新登录');
          handleUnauthorized();
          reject({ code: 401, message: '未授权', raw: res });
        } else {
          // 其他 HTTP 错误
          const errMsg = data.detail || `请求错误(${statusCode})`;
          showError(errMsg);
          reject({ code: statusCode, message: errMsg, raw: res });
        }
      },
      fail: (err) => {
        // 网络错误
        showError('网络连接异常，请检查网络设置');
        reject({ code: -1, message: '网络连接异常', raw: err });
      }
    });
  });
}

// 导出便捷方法
module.exports = {
  /**
   * GET 请求
   * @param {string} url - 请求地址
   * @param {Object} params - 查询参数
   */
  get(url, params = {}) {
    // 处理查询参数
    let queryStr = '';
    const queryParams = { ...params };
    if (Object.keys(queryParams).length > 0) {
      queryStr = '?' + Object.keys(queryParams)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
        .join('&');
    }

    return request({
      url: url + queryStr,
      method: 'GET'
    });
  },

  /**
   * POST 请求
   * @param {string} url - 请求地址
   * @param {Object} data - 请求数据
   */
  post(url, data = {}) {
    return request({
      url,
      method: 'POST',
      data
    });
  },

  /**
   * PUT 请求
   * @param {string} url - 请求地址
   * @param {Object} data - 请求数据
   */
  put(url, data = {}) {
    return request({
      url,
      method: 'PUT',
      data
    });
  },

  /**
   * DELETE 请求
   * @param {string} url - 请求地址
   */
  delete(url) {
    return request({
      url,
      method: 'DELETE'
    });
  },

  /**
   * 原始请求方法（完整配置）
   */
  request
};
