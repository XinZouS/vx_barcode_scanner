const storageUtil = require('../../utils/storage')

Page({
  data: {
    taskId: '',
    taskName: '',
    scanMode: 'single',  // 'single' 或 'continuous'
    isScanning: true,  // 默认开始扫码
    cameraReady: false,  // 权限通过后才渲染 camera 组件
    cooldown: false,
    scannedList: [],  // 本次扫码的数据 [{code, count}]
    scannedCount: 0,
    showCountModal: false,
    currentCode: '',
    inputCount: '',
    lastScanTime: 0,
    cooldownTime: 1000,  // 1秒冷却时间
    // 反馈设置
    vibrateEnabled: true,  // 震动反馈
    mode: 'normal',  // 'normal' 或 'return'（返回结果模式）
    // 扫码类型
    currentScanType: '',  // 当前扫码类型：qrCode/barCode/dataMatrix/pdf417
    currentScanTypeText: ''  // 当前扫码类型提示文本
  },

  onLoad(options) {
    const { taskId, mode } = options
    
    // 设置模式
    if (mode === 'return') {
      this.setData({ mode: 'return', taskId: 'temp_' + Date.now() })
    } else {
      if (!taskId) {
        wx.showToast({
          title: '任务ID缺失',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }
      this.setData({ taskId })
    }
    
    // 获取任务信息
    const task = storageUtil.getTaskById(this.data.taskId)
    if (task) {
      this.setData({ taskName: task.name })
      
      // 将现有数据转换为列表格式用于显示
      const scannedList = storageUtil.getDataArray(task.data)
      this.setData({ 
        scannedList,
        scannedCount: Object.values(task.data).reduce((sum, val) => sum + val, 0)
      })
    }
    
    // 初始化相机：先隐私授权 → 相机权限 → 渲染 camera
    this.initCamera()
  },

  /**
   * 初始化相机（完整流程）
   * 隐私授权 → 相机权限检查 → 渲染 camera 组件
   */
  async initCamera() {
    try {
      // 步骤1：确保隐私协议已同意（发布版必需）
      const privacyOk = await this.ensurePrivacyAuth()
      if (!privacyOk) {
        this.setData({ isScanning: false })
        wx.showModal({
          title: '需要隐私授权',
          content: '扫码功能需要您同意小程序隐私保护指引，请重新进入页面后授权',
          showCancel: false
        })
        return
      }

      // 步骤2：检查相机权限
      const hasPermission = await this.checkCameraPermission()
      if (hasPermission) {
        // 步骤3：用 nextTick 确保 setData 已提交后再渲染 camera
        this.setData({ cameraReady: true, isScanning: true }, () => {
          this.showSuccessFeedback('开始扫码')
        })
      } else {
        this.setData({ isScanning: false })
        wx.showToast({
          title: '未获取相机权限，无法扫码',
          icon: 'none',
          duration: 2000
        })
      }
    } catch (err) {
      console.error('initCamera error:', err)
      this.setData({ isScanning: false })
      wx.showToast({
        title: '相机初始化失败',
        icon: 'none',
        duration: 2000
      })
    }
  },

  /**
   * 确保隐私授权已同意
   * - 基础库 >= 2.32.3：调用 wx.requirePrivacyAuthorize 触发原生弹窗
   * - 旧版基础库：隐私授权由微信自动处理，跳过此步骤
   * @returns {Promise<boolean>}
   */
  ensurePrivacyAuth() {
    return new Promise((resolve) => {
      // 检查 wx.requirePrivacyAuthorize 是否存在（基础库 >= 2.32.3）
      if (typeof wx.requirePrivacyAuthorize !== 'function') {
        // 旧版基础库，无需手动处理
        resolve(true)
        return
      }

      wx.requirePrivacyAuthorize({
        success: () => {
          // 用户同意隐私协议
          resolve(true)
        },
        fail: () => {
          // 用户拒绝或已同意过（已同意也会走 fail 回调）
          // 区分：已同意 → resolve(true)；拒绝 → resolve(false)
          this.checkPrivacyAccepted().then((accepted) => {
            resolve(accepted)
          })
        }
      })
    })
  },

  /**
   * 检查隐私协议是否已被接受
   */
  checkPrivacyAccepted() {
    return new Promise((resolve) => {
      wx.getPrivacySetting({
        success: (res) => {
          // needAuthorization: true 表示需要用户同意但未同意
          resolve(!res.needAuthorization)
        },
        fail: () => {
          // API 不可用，假定已同意
          resolve(true)
        }
      })
    })
  },

  onUnload() {
    // 页面卸载时停止扫码
    this.setData({ isScanning: false })
  },

  /**
   * 相机错误回调 — 细分错误原因并给出针对性提示
   */
  onCameraError(e) {
    const detail = e.detail || {}
    const errMsg = detail.errMsg || ''
    console.error('Camera error:', JSON.stringify(detail))

    // 隐私协议未同意导致的相机失败
    if (errMsg.indexOf('privacy') > -1 || errMsg.indexOf('auth deny') > -1) {
      wx.showModal({
        title: '需要隐私授权',
        content: '相机需要您同意小程序隐私保护指引后才能使用。\n请重新进入页面并同意授权。',
        showCancel: false
      })
      return
    }

    // 相机权限被拒绝（系统级或微信级）
    if (errMsg.indexOf('permission') > -1 || errMsg.indexOf('camera') > -1) {
      wx.showModal({
        title: '相机权限未开启',
        content: '请在系统设置中允许微信访问相机，或在微信设置中开启相机权限。',
        confirmText: '去设置',
        success: (modalRes) => {
          if (modalRes.confirm) {
            wx.openSetting()
          }
        }
      })
      return
    }

    // 其他未知错误
    wx.showModal({
      title: '相机启动失败',
      content: `错误信息：${errMsg || '未知错误'}\n请确认系统设置中微信的相机权限已开启。`,
      confirmText: '去设置',
      success: (modalRes) => {
        if (modalRes.confirm) {
          wx.openSetting()
        }
      }
    })
  },

  /**
   * 相机初始化成功回调
   */
  onCameraInitDone(e) {
    console.log('Camera init done:', e.detail)
    // 相机就绪，可以开始扫码
    if (!this.data.isScanning) {
      this.setData({ isScanning: true })
    }
  },

  /**
   * 检查相机权限，无权限时弹窗引导用户授权
   * 注意：不再使用 wx.authorize，由 <camera> 组件原生的权限弹窗处理首次授权
   * @returns {Promise<boolean>} 是否有权限
   */
  checkCameraPermission() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          const cameraAuth = res.authSetting['scope.camera'];

          if (cameraAuth === true) {
            // 已授权，直接通过
            resolve(true);
          } else if (cameraAuth === false) {
            // 曾拒绝过，引导去设置页
            wx.showModal({
              title: '需要相机权限',
              content: '扫码功能需要访问相机，请在设置中开启相机权限',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.openSetting({
                    success: (settingRes) => {
                      const granted = settingRes.authSetting['scope.camera'] === true;
                      if (!granted) {
                        wx.showToast({ title: '未开启相机权限', icon: 'none' });
                      }
                      resolve(granted);
                    },
                    fail: () => resolve(false)
                  });
                } else {
                  resolve(false);
                }
              }
            });
          } else {
            // undefined — 首次使用，让 <camera> 组件原生弹窗处理授权
            // 直接通过，camera 组件渲染时会自动触发微信原生权限弹窗
            resolve(true);
          }
        },
        fail: () => resolve(false)
      });
    });
  },

  /**
   * 显示成功反馈（明显的绿色打勾提示）
   */
  showSuccessFeedback(message) {
    wx.showToast({
      title: message || '识别成功',
      icon: 'success',
      duration: 800,
      mask: false
    })
  },

  /**
   * 震动反馈（加重）
   */
  vibrateFeedback() {
    if (!this.data.vibrateEnabled) return
    
    // 使用medium级别震动（比light重，比heavy轻）
    wx.vibrateShort({
      type: 'medium',
      success: () => {},
      fail: () => {
        // 如果震动失败（如静音模式），忽略错误
      }
    })
  },

  /**
   * 触发成功反馈
   */
  triggerSuccessFeedback() {
    // 震动反馈（已加重）
    this.vibrateFeedback()
    
    // 显示成功提示（绿色打勾，更明显）
    this.showSuccessFeedback('识别成功')
  },

  /**
   * 切换扫码模式
   */
  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ scanMode: mode })
  },

  /**
   * 开始/暂停扫码
   */
  onToggleScan() {
    const { isScanning } = this.data
    
    if (isScanning) {
      // 暂停扫码：隐藏 camera 释放资源
      this.setData({ isScanning: false, cameraReady: false })
    } else {
      // 重新初始化相机
      this.initCamera()
    }
  },

  /**
   * 扫码成功回调（camera组件scan-code模式）
   */
  onScanCode(e) {
    const { isScanning, cooldown, taskId, mode } = this.data
    
    // 如果不在扫码状态或正在冷却，忽略
    if (!isScanning || cooldown) {
      return
    }
    
    const code = e.detail.result
    const scanType = e.detail.scanType || 'unknown'  // 获取扫码类型
    
    if (!code) {
      return
    }
    
    // 防重复：检查是否在冷却期内
    const now = Date.now()
    if (now - this.data.lastScanTime < this.data.cooldownTime) {
      return
    }
    
    this.setData({ lastScanTime: now })
    
    // 根据扫码类型设置提示信息
    let scanTypeText = '识别成功'
    if (scanType === 'qrCode') {
      scanTypeText = '二维码识别成功'
    } else if (scanType === 'barCode') {
      scanTypeText = '条码识别成功'
    } else if (scanType === 'dataMatrix') {
      scanTypeText = 'DataMatrix识别成功'
    } else if (scanType === 'pdf417') {
      scanTypeText = 'PDF417识别成功'
    }
    
    // 保存扫码类型和提示信息到页面数据中
    this.setData({ 
      currentScanType: scanType,
      currentScanTypeText: scanTypeText
    })
    
    // 显示对应类型的成功提示 + 震动反馈
    this.showSuccessFeedback(scanTypeText)
    this.vibrateFeedback()
    
    // 如果是 return 模式，直接返回结果并关闭页面
    if (mode === 'return') {
      const pages = getCurrentPages()
      const prevPage = pages[pages.length - 2]  // 上一个页面
      
      if (prevPage) {
        // 调用上一个页面的回调，或者设置数据
        if (prevPage.handleScanResult) {
          prevPage.handleScanResult(code)
        } else {
          // 通过 eventChannel 传递数据
          const eventChannel = this.getOpenerEventChannel()
          if (eventChannel) {
            eventChannel.emit('scanResult', { code, scanType })
          }
        }
      }
      
      wx.navigateBack()
      return
    }
    
    // 根据模式处理（普通模式）
    if (this.data.scanMode === 'single') {
      // 单次模式：弹窗让用户输入数量
      this.setData({
        showCountModal: true,
        currentCode: code,
        inputCount: '',
        isScanning: false  // 暂停扫码，等待用户输入
      })
    } else {
      // 连续模式：直接记为1次
      this.processScanResult(code, 1)
    }
  },

  /**
   * 处理扫码结果
   */
  processScanResult(code, count) {
    const { taskId } = this.data
    
    // 触发反馈（震动、视觉提示）
    this.triggerSuccessFeedback()
    
    // 更新到本地缓存
    const success = storageUtil.updateTaskData(taskId, code, count)
    
    if (success) {
      // 更新显示数据
      const task = storageUtil.getTaskById(taskId)
      const scannedList = storageUtil.getDataArray(task.data)
      const scannedCount = Object.values(task.data).reduce((sum, val) => sum + val, 0)
      
      this.setData({
        scannedList,
        scannedCount
      })
      
      // 连续模式下进入冷却期
      if (this.data.scanMode === 'continuous') {
        this.setData({ cooldown: true })
        
        setTimeout(() => {
          this.setData({ cooldown: false })
          
          // 冷却结束后，如果仍在扫码状态，继续扫码
          if (this.data.isScanning) {
            wx.showToast({
              title: '继续扫码',
              icon: 'none',
              duration: 500
            })
          }
        }, this.data.cooldownTime)
      }
    }
  },

  /**
   * 数量输入
   */
  onCountInput(e) {
    this.setData({ inputCount: e.detail.value })
  },

  /**
   * 取消数量输入
   */
  onCancelCount() {
    this.setData({
      showCountModal: false,
      currentCode: '',
      inputCount: ''
    })
    
    // 恢复扫码
    if (this.data.isScanning) {
      this.setData({ isScanning: true })
    }
  },

  /**
   * 确认数量输入
   */
  onConfirmCount() {
    const { currentCode, inputCount } = this.data
    
    const count = parseInt(inputCount) || 1
    
    if (count <= 0) {
      wx.showToast({
        title: '数量必须大于0',
        icon: 'none'
      })
      return
    }
    
    // 处理扫码结果
    this.processScanResult(currentCode, count)
    
    // 关闭弹窗
    this.setData({
      showCountModal: false,
      currentCode: '',
      inputCount: ''
    })
    
    // 单次模式下，自动开始下一次扫码
    setTimeout(() => {
      this.setData({ isScanning: true })
    }, 500)
  },

  /**
   * 完成扫码，返回任务列表
   */
  onFinishScan() {
    wx.showModal({
      title: '完成扫码',
      content: '确定要完成扫码并返回任务列表吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 取消扫码，直接返回
   */
  onCancelScan() {
    wx.navigateBack()
  }
})
