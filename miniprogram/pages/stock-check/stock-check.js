// pages/stock-check/stock-check.js
// 扫码统计页面 - 库存统计功能
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
    quantityDisplay: '',      // 库存数量（quantity）
    checkQuantityDisplay: '--',  // 已统计数量（check_quantity）
    checkQtyClass: '',       // 颜色类：qty-red/qty-green/qty-yellow
    isItemExpired: false,
    actualQty: '',           // 本次输入的实际清点数量

    // 提交相关
    startLoading: false,
    submitLoading: false,
    finishLoading: false,

    // 完成统计菜单
    showFinishMenu: false,

    // 成功提示浮层
    showSuccessOverlay: false,
    successOverlayMsg: '',

    // 计算属性（对齐 Vue newDelta / checkQtyClass）
    computedDelta: null,
    deltaPreview: null,         // quantity - check_quantity - actualQty
    deltaPreviewDisplay: '',    // 格式化后的预计差值显示
    deltaClass: '',             // delta-loss / delta-overage / delta-ok
    submitBtnText: '提交统计结果',
    isChecked: false,
    showAlreadyCheckedHint: false,  // 已盘==库存 但本次输入会改变已盘数量

    // 货位相关
    showAllocationDialog: false,
    showCreateAllocationDialog: false,
    allocationList: [],
    filteredAllocations: [],
    allocationSearchKey: '',
    selectedAllocationId: null,
    currentAllocationName: '',
    newAllocationName: '',
    // 全局指定货位（跨物品持久化）
    specifiedAllocationId: null,
    specifiedAllocationName: '',
    autoLinkEnabled: true
  },

  onLoad() {
    this.fetchProgress()
    // 从 storage 恢复全局货位设置
    const saved = wx.getStorageSync('stockCheckAllocation')
    if (saved && saved.id) {
      this.setData({
        specifiedAllocationId: saved.id,
        specifiedAllocationName: saved.name || '',
        autoLinkEnabled: saved.autoLink !== false
      })
    }
  },

  onShow() {
    this.fetchProgress()
  },

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
      this.showError(err)
    }
  },

  async handleStartCheck(force = false) {
    const { progress, startLoading } = this.data
    if (startLoading) return

    const confirmMsg = progress.is_in_progress
      ? `当前有统计进行中（已统计 ${progress.checked} 条，待统计 ${progress.unchecked} 条）。\n重新开始将重置所有物品为"待统计"状态，确认吗？`
      : '将把数量大于0的物品标记为待统计状态'

    const doStart = async () => {
      this.setData({ startLoading: true })
      try {
        const data = await request.post('/stock/checking/start/')
        wx.showToast({
          title: data.detail || '统计已开始',
          icon: 'success'
        })
        await this.fetchProgress()
      } catch (err) {
        this.showError(err)
      } finally {
        this.setData({ startLoading: false })
      }
    }

    if (force) {
      // 强制重启，不弹确认框
      await doStart()
    } else {
      wx.showModal({
        title: '开始统计',
        content: confirmMsg,
        confirmText: '确认',
        cancelText: '取消',
        success: async (res) => {
          if (res.confirm) {
            await doStart()
          }
        }
      })
    }
  },

  // ========== 扫码功能 ==========
  handleScan() {
    wx.navigateTo({
      url: '/pages/scan/scan?mode=return',
      events: {
        scanResult: (data) => {
          const code = data.code
          this.setData({ searchKey: code })
          this.doSearch()
        }
      },
      success: (res) => {
        res.eventChannel.emit('setScanCallback', {
          callback: (code) => {
            this.setData({ searchKey: code })
            this.doSearch()
          }
        })
      }
    })
  },

  /**
   * 跳转手动报溢页面
   */
  goManualOverflow() {
    wx.navigateTo({
      url: '/pages/manual-overflow/manual-overflow'
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
      checkQuantityDisplay: '--',
      checkQtyClass: '',
      isItemExpired: false,
      actualQty: '',
      computedDelta: null,
      deltaPreview: null,
      deltaPreviewDisplay: '',
      deltaClass: '',
      submitBtnText: '提交统计结果',
      isChecked: false,
      showAlreadyCheckedHint: false
    })
  },

  async doSearch() {
    const { searchKey } = this.data
    if (!searchKey.trim()) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }

    this.setData({ searchLoading: true, searched: false, currentItem: null })

    try {
      const data = await request.get('/stock/goods_search/', {
        key: searchKey
      })

      if (!data || data.length === 0) {
        wx.showToast({ title: '未找到匹配的物品记录', icon: 'none' })
        this.setData({ searched: true, searchResults: [], currentItem: null })
      } else if (data.length === 1) {
        this.selectItem(data[0])
        this.setData({ searched: true, searchResults: data })
      } else {
        this.setData({ searched: true, searchResults: data })
      }
    } catch (err) {
      this.showError(err)
      this.setData({ searched: true, searchResults: [], currentItem: null })
    } finally {
      this.setData({ searchLoading: false })
    }
  },

  selectItem(itemOrEvent) {
    const item = itemOrEvent.currentTarget ? itemOrEvent.currentTarget.dataset.item : itemOrEvent
    if (!item) return

    const checkQty = item.check_quantity != null ? parseFloat(item.check_quantity) : 0
    const quantity = Number(item.quantity) || 0

    // 颜色：0→灰色，<库存→红色，==→绿色，>→黄色（对齐 Vue checkQtyClass）
    let checkQtyClass = ''
    if (checkQty === 0) {
      checkQtyClass = 'qty-gray'
    } else if (checkQty < quantity) {
      checkQtyClass = 'qty-red'
    } else if (checkQty === quantity) {
      checkQtyClass = 'qty-green'
    } else {
      checkQtyClass = 'qty-yellow'
    }

    // 自动填入剩余未盘数量：quantity - check_quantity（对齐 Vue）
    const autoQty = quantity - checkQty
    const actualQty = autoQty >= 0 ? String(autoQty) : String(autoQty)

    // 已盘数量 == 库存时，提示用户
    const showAlreadyCheckedHint = checkQty === quantity && quantity > 0

    this.setData({
      currentItem: item,
      quantityDisplay: quantity.toString(),
      checkQuantityDisplay: checkQty.toString(),
      checkQtyClass,
      isItemExpired: item.expire_date ? new Date(item.expire_date) < new Date() : false,
      actualQty,
      isChecked: item.ischecked === true,
      showAlreadyCheckedHint
    })

    // 自动填入后计算期望差值
    this.calculateDelta()
  },

  closeGoodsCard() {
    this.setData({
      currentItem: null,
      quantityDisplay: '',
      checkQuantityDisplay: '--',
      checkQtyClass: '',
      isItemExpired: false,
      actualQty: '',
      deltaPreview: null,
      deltaPreviewDisplay: '',
      deltaClass: '',
      submitBtnText: '提交盘点结果',
      isChecked: false,
      showAlreadyCheckedHint: false,
      searchKey: ''
    })
  },

  // ========== 数量相关 ==========
  onActualQtyInput(e) {
    this.setData({ actualQty: e.detail.value })
    this.calculateDelta()
  },

  onQtyMinus() {
    const { actualQty } = this.data
    const v = parseInt(actualQty) || 0
    if (v > 0) {
      this.setData({ actualQty: (v - 1).toString() })
      this.calculateDelta()
    }
  },

  onQtyPlus() {
    const { actualQty } = this.data
    const v = parseInt(actualQty) || 0
    this.setData({ actualQty: (v + 1).toString() })
    this.calculateDelta()
  },

  calculateDelta() {
    const { currentItem, actualQty } = this.data
    if (!currentItem || actualQty === '') {
      this.setData({
        deltaPreview: null,
        deltaPreviewDisplay: '',
        deltaClass: '',
        submitBtnText: '提交统计结果'
      })
      return
    }

    const quantity = Number(currentItem.quantity) || 0
    const checkQty = Number(currentItem.check_quantity) || 0
    const actQty = Number(actualQty)
    if (isNaN(actQty)) return

    // 新公式（对齐 Vue newDelta）： quantity - check_quantity - actualQty
    const deltaPreview = quantity - checkQty - actQty
    const absDelta = Math.abs(deltaPreview)
    let deltaClass = '', submitBtnText = '提交盘点结果'

    if (deltaPreview > 0) {
      deltaClass = 'delta-loss'
      submitBtnText = '提交盘点结果（预计报损）'
    } else if (deltaPreview < 0) {
      deltaClass = 'delta-overage'
      submitBtnText = '提交盘点结果（预计报溢）'
    } else {
      deltaClass = 'delta-ok'
      submitBtnText = '✓ 提交盘点结果'
    }

    this.setData({
      deltaPreview,
      deltaPreviewDisplay: absDelta > 0 ? this.formatNum(absDelta) : '0',
      deltaClass,
      submitBtnText
    })
  },

  /**
   * 格式化数字：四舍五入到最多 6 位小数，去除尾 0
   */
  formatNum(n) {
    const rounded = Math.round(Math.abs(n) * 1e6) / 1e6
    let str = rounded.toFixed(6)
    str = str.replace(/\.?0+$/, '')
    return str || '0'
  },

  // ========== 提交统计 ==========
  async handleSubmitCheck() {
    const { currentItem, actualQty, submitLoading } = this.data
    if (!currentItem || actualQty === '') {
      wx.showToast({ title: '请输入本次清点数量', icon: 'none' })
      return
    }
    if (submitLoading) return

    this.setData({ submitLoading: true })
    wx.vibrateShort({ type: 'medium' })

    try {
      const { specifiedAllocationId, autoLinkEnabled } = this.data
      const itemAllocationId = currentItem.allocation_id || null

      const payload = {
        stock_goods_id: currentItem.id,
        actual_qty: actualQty
      }

      // 仅当自动关联开启 + 全局货位已设置 + 与物品当前货位不同时，才带 allocation_id
      if (autoLinkEnabled && specifiedAllocationId && specifiedAllocationId !== itemAllocationId) {
        payload.allocation_id = specifiedAllocationId
      }

      const result = await request.post('/stock/checking/submit/', payload)

      // 更新 currentItem 的 check_quantity（从接口返回）
      const newCheckQty = result.check_quantity != null ? String(result.check_quantity) : '0'
      const quantity = Number(currentItem.quantity) || 0
      const chkNum = parseFloat(newCheckQty) || 0

      let checkQtyClass = ''
      if (chkNum === 0) checkQtyClass = 'qty-gray'
      else if (chkNum < quantity) checkQtyClass = 'qty-red'
      else if (chkNum === quantity) checkQtyClass = 'qty-green'
      else checkQtyClass = 'qty-yellow'

      wx.vibrateShort({ type: 'medium' })
      setTimeout(() => { wx.vibrateShort({ type: 'medium' }) }, 100)

      // 更新搜索结果列表中该物品的 ischecked 状态
      const { searchResults } = this.data
      const updatedResults = searchResults.map(item => {
        if (item.id === currentItem.id) {
          return { ...item, ischecked: true, check_quantity: newCheckQty }
        }
        return item
      })
      this.setData({ searchResults: updatedResults })

      // 成功提示
      if (chkNum === quantity) {
        this.showLargeSuccess('数量相符 ✓')
      } else if (chkNum < quantity) {
        this.showLargeSuccess(`已盘 ${newCheckQty}`)
      } else {
        this.showLargeSuccess(`已盘 ${newCheckQty}，超出库存`)
      }

      await this.fetchProgress()

      // 如果有搜索结果列表，保留列表；否则清空回到 placeholder
      if (this.data.searchResults.length > 0) {
        this.setData({ currentItem: null })
      } else {
        this.setData({ currentItem: null, searchKey: '' })
      }
    } catch (err) {
      this.showError(err)
    } finally {
      this.setData({ submitLoading: false })
    }
  },

  // ========== 完成统计相关 ==========

  /**
   * 显示完成统计/重新开始 菜单
   */
  showFinishMenu() {
    this.setData({ showFinishMenu: true })
  },

  /**
   * 隐藏菜单
   */
  hideFinishMenu() {
    this.setData({ showFinishMenu: false })
  },

  /**
   * 强制重新开始（跳过完成统计）
   */
  handleForceRestart() {
    this.hideFinishMenu()
    this.handleStartCheck(true)
  },

  /**
   * 完成统计：弹窗确认后调用 finish/ 接口
   */
  handleFinishCheck() {
    wx.showModal({
      title: '完成统计',
      content: '将完成本次统计并清算物品数量差异，自动生成报损报溢单，需要人工审核后手动提交。\n确认完成统计吗？',
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ finishLoading: true, showFinishMenu: false })
          try {
            const data = await request.post('/stock/checking/finish/')
            wx.showToast({
              title: data.detail || '统计已完成',
              icon: 'success',
              duration: 3000
            })
            await this.fetchProgress()
          } catch (err) {
            this.showError(err)
          } finally {
            this.setData({ finishLoading: false })
          }
        }
      }
    })
  },

  /**
   * 打开货位弹窗（指定货位 + 当前货位 共用）
   */
  async openAllocationDialog() {
    await this.fetchAllocations()
    this.setData({
      showAllocationDialog: true,
      selectedAllocationId: this.data.specifiedAllocationId,
      allocationSearchKey: '',
      filteredAllocations: this.data.allocationList
    })
  },

  onAutoLinkChange(e) {
    const autoLinkEnabled = e.detail.value
    this.setData({ autoLinkEnabled })
    wx.setStorageSync('stockCheckAllocation', {
      id: this.data.specifiedAllocationId,
      name: this.data.specifiedAllocationName,
      autoLink: autoLinkEnabled
    })
  },

  confirmAllocation() {
    const { selectedAllocationId, allocationList } = this.data
    if (!selectedAllocationId) {
      wx.showToast({ title: '请选择货位', icon: 'none' })
      return
    }
    const selected = allocationList.find(item => item.id === selectedAllocationId)
    if (!selected) {
      wx.showToast({ title: '货位不存在', icon: 'none' })
      return
    }
    this.setData({
      specifiedAllocationId: selected.id,
      specifiedAllocationName: selected.name,
      showAllocationDialog: false,
      allocationSearchKey: '',
      filteredAllocations: []
    })
    wx.setStorageSync('stockCheckAllocation', {
      id: selected.id,
      name: selected.name,
      autoLink: this.data.autoLinkEnabled
    })
    wx.showToast({ title: `已指定货位：${selected.name}`, icon: 'none' })
  },

  // ========== 货位列表获取/搜索/新增 ==========

  async fetchAllocations() {
    try {
      const data = await request.get('/goods/allocation/')
      const list = (data && data.results) || []
      this.setData({ allocationList: list, filteredAllocations: list })
    } catch (err) {
      this.showError(err)
    }
  },

  closeAllocationDialog() {
    this.setData({
      showAllocationDialog: false,
      allocationSearchKey: '',
      filteredAllocations: []
    })
  },

  onAllocationSearchInput(e) {
    const key = e.detail.value.toLowerCase()
    const { allocationList } = this.data
    if (!key) {
      this.setData({ allocationSearchKey: e.detail.value, filteredAllocations: allocationList })
      return
    }
    const filtered = allocationList.filter(item => item.name.toLowerCase().includes(key))
    this.setData({ allocationSearchKey: e.detail.value, filteredAllocations: filtered })
  },

  selectAllocation(e) {
    this.setData({ selectedAllocationId: e.currentTarget.dataset.id })
  },

  openCreateAllocationDialog() {
    this.setData({ showCreateAllocationDialog: true, newAllocationName: '' })
  },

  closeCreateAllocationDialog() {
    this.setData({ showCreateAllocationDialog: false, newAllocationName: '' })
  },

  onNewAllocationInput(e) {
    this.setData({ newAllocationName: e.detail.value })
  },

  async submitCreateAllocation() {
    const { newAllocationName } = this.data
    const userManager = require('../../utils/user')
    if (!newAllocationName.trim()) {
      wx.showToast({ title: '请输入货位名称', icon: 'none' })
      return
    }

    try {
      const currentUser = userManager.getUserInfo()
      const formData = { name: newAllocationName.trim() }
      if (currentUser && currentUser.id) {
        formData.updateuser = currentUser.id
      }

      // request.js 返回 data.data = 后端返回体
      // 新增接口直接返回 { id, name, ... } 对象（不是 { results } 列表）
      const res = await request.post('/goods/allocation/', formData)

      // 兼容两种返回结构
      const newAlloc = res.id ? res : (res.results && res.results[0])
      if (!newAlloc) {
        wx.showToast({ title: '创建成功但未返回数据', icon: 'none' })
        return
      }

      wx.showToast({ title: `货位「${newAlloc.name}」创建成功`, icon: 'success' })

      // 将新货位插入列表前面，弹窗中预选中，只关创建弹窗
      const { allocationList } = this.data
      const updatedList = [newAlloc, ...allocationList]

      this.setData({
        allocationList: updatedList,
        filteredAllocations: updatedList,
        selectedAllocationId: newAlloc.id,
        showCreateAllocationDialog: false,
        // 不关 showAllocationDialog，让用户继续点"确定"
        newAllocationName: ''
      })
    } catch (err) {
      this.showError(err)
    }
  },

  preventBubble() {},

  // ========== 成功大勾浮层 ==========
  showLargeSuccess(msg) {
    this.setData({ showSuccessOverlay: true, successOverlayMsg: msg })
    setTimeout(() => {
      this.setData({ showSuccessOverlay: false, successOverlayMsg: '' })
    }, 2000)
  },

  // ========== 错误提示 ==========
  parseErrorDetail(detail) {
    if (!detail) return '操作失败'
    if (typeof detail === 'string') return detail
    if (typeof detail === 'object' && detail !== null) {
      const msgs = []
      for (const key in detail) {
        if (detail.hasOwnProperty(key)) {
          const v = detail[key]
          const vStr = Array.isArray(v) ? v.join(' ') : (typeof v === 'string' ? v : String(v))
          msgs.push(`${key}: ${vStr}`)
        }
      }
      return msgs.join('\n')
    }
    return String(detail)
  },

  showError(err) {
    const message = (err && err.message) || '操作失败'
    wx.showModal({
      title: '【错误】',
      content: message,
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#fa5151'
    })
  }
})
