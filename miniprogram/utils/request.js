/**
 * 统一网络请求工具
 * 封装 wx.request，提供类似 axios 的拦截器功能
 * 自动处理 Token 注入和 401 响应
 *
 * 使用方式：
 * const request = require('../../utils/request');
 * request.get('/api/endpoint', params).then(res => {}).catch(err => {});
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
 * 解析错误详情，将对象格式转换为可读字符串
 * @param {Object|string} detail - 错误详情
 * @returns {string} 格式化后的错误信息
 */
function parseErrorDetail(detail) {
  if (!detail) return '请求失败';
  
  // 如果是字符串，直接返回
  if (typeof detail === 'string') return detail;
  
  // 如果是对象，遍历所有键值对
  if (typeof detail === 'object' && detail !== null) {
    const errorMessages = [];
    
    for (const key in detail) {
      if (detail.hasOwnProperty(key)) {
        const value = detail[key];
        let valueStr = '';
        
        // 如果 value 是数组，拼接数组中的字符串
        if (Array.isArray(value)) {
          valueStr = value.join(' ');
        } else if (typeof value === 'string') {
          valueStr = value;
        } else {
          valueStr = String(value);
        }
        
        // 格式：key: value
        errorMessages.push(`${key}: ${valueStr}`);
      }
    }
    
    // 如果有多个错误，用换行符分隔
    return errorMessages.join('\n');
  }
  
  return String(detail);
}

/**
 * 显示错误提示（支持多行，带明显错误标识）
 * @param {string} msg - 错误信息（可包含换行符）
 */
function showError(msg) {
  const errorMsg = msg || '操作失败';
  
  // 如果错误信息包含换行符，使用 showModal 显示
  if (errorMsg.includes('\n') || errorMsg.length > 20) {
    wx.showModal({
      title: '❌ 错误',
      content: errorMsg,
      showCancel: false,
      confirmText: '确定'
    });
  } else {
    // 单行的错误，使用 showToast + 红色 X 效果
    wx.showToast({
      title: '错误: ' + errorMsg,
      icon: 'none',
      duration: 5000,  // 延长到5秒
      image: '/images/icon-error.png'  // 使用自定义错误图标
    });
  }
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
          // 业务错误 - 解析错误详情，但不在这里显示
          const errMsg = parseErrorDetail(data.detail || data.msg || '请求失败');

          // 检测到"请重新登录"类提示，清除本地登录状态
          if (
            (typeof data.detail === 'string' && data.detail.includes('请重新登录')) ||
            (typeof data.msg === 'string' && data.msg.includes('请重新登录')) ||
            errMsg.includes('请重新登录')
          ) {
            handleUnauthorized();
          }

          reject({ code: data.code, message: errMsg, data: data, raw: res });
        }
        } else if (statusCode === 401) {
          // 未授权
          handleUnauthorized();
          reject({ code: 401, message: '认证失败，请重新登录', raw: res });
        } else {
          // 其他 HTTP 错误 - 解析错误详情
          const errMsg = parseErrorDetail(data.detail || data.msg || `请求错误(${statusCode})`);

          // 检测"请重新登录"类提示
          if (
            (typeof data.detail === 'string' && data.detail.includes('请重新登录')) ||
            (typeof data.msg === 'string' && data.msg.includes('请重新登录')) ||
            errMsg.includes('请重新登录')
          ) {
            handleUnauthorized();
          }

          reject({ code: statusCode, message: errMsg, data: data, raw: res });
        }
      },
      fail: (err) => {
        // 网络错误
        reject({ code: -1, message: '网络连接异常，请检查网络设置', raw: err });
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
