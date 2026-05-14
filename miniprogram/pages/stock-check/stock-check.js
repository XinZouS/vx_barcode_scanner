// pages/stock-check/stock-check.js
// 扫码统计页面 - 库存统计功能（简化版）
const request = require('../../utils/request')

Page({
  data: {
    // 统计进度
    progress: {
      checked: 0,
      unchecked: 0,
      total: 0,
      is_in_progress: false
    },
    progressPercent: 0,
    progressWidth: '0%',

    // 搜索相关
    searchKey: '',
    searchLoading: false,
    searched: false,
    searchResults: [],
    currentItem: null,
    quantityDisplay: '',
    isItemExpired: false,
    actualQty: '',

    // 提交相关
    startLoading: false,
    submitLoading: false,

    // 计算属性
    computedDelta: null,
    deltaClass: '',
    submitBtnText: '提交统计结果',
    isChecked: false,

  },

  onLoad() {
    this.fetchProgress()
  },

  onShow() {
    this.fetchProgress()
  },

  /**
   * 接收扫码页面返回的结果
   */
  handleScanResult(code) {
    if (code) {
      this.setData({ searchKey: code })
      this.doSearch()
    }
  },

  // ========== 统计进度相关 ==========
  async fetchProgress() {
    try {
      const data = await request.get('/stock/checking/progress/')
      const percent = data.total > 0 ? Math.round((data.checked / data.total) * 100) : 0
      this.setData({
        progress: data,
        progressPercent: percent,
        progressWidth: percent + '%'
      })
    } catch (err) {
      console.error('获取进度失败:', err)
      this.showError(err)
    }
  },

  async handleStartCheck() {
    const { progress, startLoading } = this.data
    if (startLoading) return

        const confirmMsg = progress.is_in_progress
          ? `当前有统计进行中（已统计 ${progress.checked} 条，待统计 ${progress.unchecked} 条）。\n重新开始将重置所有物品为"待统计"状态，确认吗？`
          : '将把数量大于0的物品标记为待统计状态'

    wx.showModal({
      title: '开始统计',
      content: confirmMsg,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ startLoading: true })
          try {
            const data = await request.post('/stock/checking/start/')
            wx.showToast({
              title: data.detail || '统计已开始',
              icon: 'success'
            })
            await this.fetchProgress()
          } catch (err) {
            console.error('开始统计失败:', err)
            this.showError(err)
          } finally {
            this.setData({ startLoading: false })
          }
        }
      }
    })
  },

  // ========== 扫码功能（使用项目已有的扫码页面）==========
  handleScan() {
    // 跳转到项目已有的扫码页面
    wx.navigateTo({
      url: '/pages/scan/scan?mode=return',  // 添加 mode=return 参数，表示扫码后返回结果
      events: {
        // 监听扫码页面的回调
        scanResult: (data) => {
          const code = data.code
          this.setData({ searchKey: code })
          this.doSearch()
        }
      },
      success: (res) => {
        // 向扫码页面传递回调函数
        res.eventChannel.emit('setScanCallback', { 
          callback: (code) => {
            // 扫码成功后的回调
            this.setData({ searchKey: code })
            this.doSearch()
          }
        })
      }
    })
  },

  // ========== 搜索相关 ==========
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
  },

  clearSearch() {
    this.setData({
      searchKey: '',
      searched: false,
      searchResults: [],
      currentItem: null,
      quantityDisplay: '',
      isItemExpired: false,
      actualQty: '',
      computedDelta: null,
      deltaClass: '',
      submitBtnText: '提交统计结果',
      isChecked: false
    })
  },

  async doSearch() {
    const { searchKey } = this.data
    if (!searchKey.trim()) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }

    this.setData({ searchLoading: true, searched: false })

    try {
      console.log('开始搜索，参数：', {
        key: searchKey
      })
      
      const data = await request.get('/stock/goods_search/', {
        key: searchKey
      })

      console.log('搜索成功，返回数据：', data)

      if (!data || data.length === 0) {
        wx.showToast({ title: '未找到匹配的物品记录', icon: 'none' })
        this.setData({ searched: true, searchResults: [], currentItem: null })
      } else if (data.length === 1) {
        this.selectItem(data[0])
        this.setData({ searched: true, searchResults: [] })
      } else {
        this.setData({ searched: true, searchResults: data })
      }
    } catch (err) {
      console.error('搜索失败:', err)
      console.error('错误详情：', JSON.stringify(err))
      this.showError(err)
      this.setData({ searched: true, searchResults: [], currentItem: null })
    } finally {
      this.setData({ searchLoading: false })
    }
  },

  selectItem(itemOrEvent) {
    // 兼容两种调用方式：
    // 1. 从 WXML bindtap 调用：传入事件对象 e，需从 dataset 中取 item
    // 2. 从 JS 直接调用：直接传入 item 对象
    const item = itemOrEvent.currentTarget ? itemOrEvent.currentTarget.dataset.item : itemOrEvent

    if (!item) {
      console.error('selectItem: item 为空', itemOrEvent)
      return
    }

    console.log('选中物品：', item)

    const quantity = Number(item.quantity) || 0
    const isExpired = this.checkExpired(item.expire_date)

    this.setData({
      currentItem: item,
      searchResults: [],
      quantityDisplay: quantity.toString(),
      isItemExpired: isExpired,
      actualQty: quantity.toString(),
      isChecked: item.ischecked === true
    })

    this.calculateDelta()
  },

  checkExpired(dateStr) {
    if (!dateStr) return false
    return new Date(dateStr) < new Date()
  },

  // ========== 数量相关 ==========
  onActualQtyInput(e) {
    this.setData({ actualQty: e.detail.value })
    this.calculateDelta()
  },

  onQtyMinus() {
    const { actualQty } = this.data
    const currentVal = parseInt(actualQty) || 0
    if (currentVal > 0) {
      const newVal = currentVal - 1
      this.setData({ actualQty: newVal.toString() })
      this.calculateDelta()
    }
  },

  onQtyPlus() {
    const { actualQty } = this.data
    const currentVal = parseInt(actualQty) || 0
    const newVal = currentVal + 1
    this.setData({ actualQty: newVal.toString() })
    this.calculateDelta()
  },

  calculateDelta() {
    const { currentItem, actualQty } = this.data
    if (!currentItem || actualQty === '') {
      this.setData({ 
        computedDelta: null, 
        deltaClass: '',
        submitBtnText: '提交统计结果'
      })
      return
    }

    const delta = Number(currentItem.quantity) - Number(actualQty)
    let deltaClass = ''
    let submitBtnText = '提交统计结果'

    if (delta > 0) {
      deltaClass = 'delta-loss'
      submitBtnText = `提交报损（短缺 ${delta}）`
    } else if (delta < 0) {
      deltaClass = 'delta-overage'
      submitBtnText = `提交报溢（溢出 ${-delta}）`
    } else {
      deltaClass = 'delta-ok'
      submitBtnText = '✓ 数量相符 - 提交'
    }

    this.setData({
      computedDelta: delta,
      deltaClass,
      submitBtnText
    })
  },

  // ========== 提交统计 ==========
  async handleSubmitCheck() {
    const { currentItem, actualQty, submitLoading } = this.data

    if (!currentItem || actualQty === '') {
      wx.showToast({ title: '请输入实际数量', icon: 'none' })
      return
    }

    if (submitLoading) return

    this.setData({ submitLoading: true })

    // 开始提交时短震1下
    wx.vibrateShort({ type: 'medium' })

    try {
      console.log('提交统计，参数：', {
        stock_goods_id: currentItem.id,
        actual_qty: actualQty
      })

      const result = await request.post('/stock/checking/submit/', {
        stock_goods_id: currentItem.id,
        actual_qty: actualQty
      })

      console.log('提交成功，返回数据：', result)

      const delta = Number(result.delta || 0)

      // 提交成功后快速短震2下
      wx.vibrateShort({ type: 'medium' })
      setTimeout(() => {
        wx.vibrateShort({ type: 'medium' })
      }, 100)

      // 提示结果
      if (delta === 0) {
        wx.showToast({ title: '完成：数量相符 ✓', icon: 'success' })
      } else if (delta > 0) {
        wx.showToast({
          title: `完成：短缺 ${Math.abs(delta)}`,
          icon: 'none'
        })
      } else {
        wx.showToast({
          title: `完成：溢出 ${Math.abs(delta)}`,
          icon: 'none'
        })
      }

      // 刷新状态
      await this.fetchProgress()

      // 清空当前商品
      this.setData({
        currentItem: null,
        quantityDisplay: '',
        isItemExpired: false,
        actualQty: '',
        computedDelta: null,
        deltaClass: '',
        submitBtnText: '提交统计结果',
        isChecked: false,
        searchKey: ''
      })
    } catch (err) {
      console.error('提交失败:', err)
      console.error('错误详情：', JSON.stringify(err))
      this.showError(err)
    } finally {
      this.setData({ submitLoading: false })
    }
  },

  // ========== 错误提示 ==========
  showError(err) {
    let message = '操作失败'
    let detail = ''

    // 打印详细错误信息到控制台
    console.error('===== API 错误详情 =====')
    console.error('错误对象：', err)
    if (err.statusCode) {
      console.error('HTTP 状态码：', err.statusCode)
      detail += `HTTP ${err.statusCode}`
    }
    if (err.data) {
      console.error('返回数据：', err.data)
      detail += ' - ' + JSON.stringify(err.data)
    }
    if (err.raw) {
      console.error('原始响应：', err.raw)
    }
    console.error('===== 结束 =====')

    if (err.data && err.data.detail) {
      message = err.data.detail
    } else if (err.data && err.data.message) {
      message = err.data.message
    } else if (err.message) {
      message = err.message
    }

    wx.showToast({
      title: message,
      icon: 'none',
      duration: 3000
    })
  }
})
