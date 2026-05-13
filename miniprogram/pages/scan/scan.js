const storageUtil = require('../../utils/storage')

Page({
  data: {
    taskId: '',
    taskName: '',
    scanMode: 'single',  // 'single' 或 'continuous'
    isScanning: true,  // 默认开始扫码
    cooldown: false,
    scannedList: [],  // 本次扫码的数据 [{code, count}]
    scannedCount: 0,
    showCountModal: false,
    currentCode: '',
    inputCount: '',
    lastScanTime: 0,
    cooldownTime: 1000,  // 1秒冷却时间
    // 反馈设置
    vibrateEnabled: true  // 震动反馈
  },

  onLoad(options) {
    const { taskId } = options
    
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
    
    // 获取任务信息
    const task = storageUtil.getTaskById(taskId)
    if (task) {
      this.setData({ taskName: task.name })
      
      // 将现有数据转换为列表格式用于显示
      const scannedList = storageUtil.getDataArray(task.data)
      this.setData({ 
        scannedList,
        scannedCount: Object.values(task.data).reduce((sum, val) => sum + val, 0)
      })
    }
    
    // 自动开始扫码
    this.showSuccessFeedback('开始扫码')
  },

  onUnload() {
    // 页面卸载时停止扫码
    this.setData({ isScanning: false })
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
      // 暂停扫码
      this.setData({ isScanning: false })
    } else {
      // 开始扫码
      this.setData({ isScanning: true, cooldown: false })
      wx.showToast({
        title: '开始扫码',
        icon: 'success',
        duration: 1000
      })
    }
  },

  /**
   * 扫码成功回调（camera组件scan-code模式）
   */
  onScanCode(e) {
    const { isScanning, cooldown, taskId } = this.data
    
    // 如果不在扫码状态或正在冷却，忽略
    if (!isScanning || cooldown) {
      return
    }
    
    const code = e.detail.result
    
    if (!code) {
      return
    }
    
    // 防重复：检查是否在冷却期内
    const now = Date.now()
    if (now - this.data.lastScanTime < this.data.cooldownTime) {
      return
    }
    
    this.setData({ lastScanTime: now })
    
    // 根据模式处理
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
  }
})
