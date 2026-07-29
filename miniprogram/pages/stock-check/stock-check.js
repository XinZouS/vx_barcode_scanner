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
    quantityDisplay: '',          // 记录库存（quantity）
    isItemExpired: false,
    actualQty: '',               // 实际库存（quantity_real），默认=记录库存

    // 提交相关
    startLoading: false,
    submitLoading: false,
    finishLoading: false,

    // 完成统计菜单
    showFinishMenu: false,

    // 连续扫码 toggle
    continuousScan: true,

    // 成功提示浮层
    showSuccessOverlay: false,
    successOverlayMsg: '',

    // 计算属性（预计差值等）
    deltaPreview: null,         // 实际库存 − 记录库存（与后端 delta 同向）
    deltaPreviewDisplay: '',    // 格式化后的预计差值显示
    deltaClass: '',             // delta-overage / delta-loss / delta-ok
    submitBtnText: '提交盘点结果',
    isChecked: false,
    showAlreadyCheckedHint: false,  // 已盘点物品二次修改提示

    // 货位相关
    showAllocationDialog: false,
    showCreateAllocationDialog: false,
    allocationList: [],
    filteredAllocations: [],
    allocationSearchKey: '',
    selectedAllocationId: null,
    currentAllocationName: '',
    newAllocationName: '',
    allocationLoading: false,
    // 全局指定货位（跨物品持久化）
    specifiedAllocationId: null,
    specifiedAllocationName: '',
    autoLinkEnabled: true,

    // 未记录列表
    uncheckedList: [],
    uncheckedCount: 0,
    uncheckedPage: 1,
    uncheckedHasMore: false,
    uncheckedLoading: false
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
      isItemExpired: false,
      actualQty: '',
      deltaPreview: null,
      deltaPreviewDisplay: '',
      deltaClass: '',
      submitBtnText: '提交盘点结果',
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
    // 搜索时隐藏未记录列表
    if (this.data.uncheckedList.length > 0) {
      this.clearUnchecked()
    }

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

    const quantity = Number(item.quantity) || 0

    // 实际库存默认填入记录库存，用户核对后直接提交或手动修改
    const actualQty = quantity > 0 ? this.formatNum(quantity) : '0'

    this.setData({
      currentItem: item,
      quantityDisplay: quantity.toString(),
      isItemExpired: item.expire_date ? new Date(item.expire_date) < new Date() : false,
      actualQty,
      isChecked: item.ischecked === true,
      showAlreadyCheckedHint: false
    })

    this.calculateDelta()
  },

  closeGoodsCard() {
    this.setData({
      currentItem: null,
      quantityDisplay: '',
      isItemExpired: false,
      actualQty: '',
      deltaPreview: null,
      deltaPreviewDisplay: '',
      deltaClass: '',
      submitBtnText: '提交盘点结果',
      isChecked: false,
      showAlreadyCheckedHint: false
    })
  },

  // ========== 数量相关 ==========
  onActualQtyInput(e) {
    this.setData({ actualQty: e.detail.value })
    this.calculateDelta()
  },

  /**
   * 输入框 blur 时格式化实际库存：
   * - 仅允许数字、小数点、负号
   * - 去除多余的前导零与尾随零
   * 例如 "-02.3400" → "-2.34", "3.3333" 保持不变
   */
  onActualQtyBlur(e) {
    const raw = (e.detail.value || '').trim()
    if (raw === '' || raw === '-') {
      this.setData({ actualQty: '' })
      this.calculateDelta()
      return
    }
    const formatted = this.formatRealQty(raw)
    this.setData({ actualQty: formatted })
    this.calculateDelta()
  },

  /**
   * 格式化实际库存输入：去除无效字符 → 标准化为数字字符串
   */
  formatRealQty(raw) {
    // 去掉所有非法字符，只保留数字、负号、小数点
    let cleaned = raw.replace(/[^0-9.\-]/g, '')
    // 负号只能在开头，移除其他位置的负号
    const firstMinus = cleaned.indexOf('-')
    if (firstMinus > 0) {
      cleaned = cleaned.replace(/-/g, '')
    } else if (firstMinus === 0) {
      cleaned = '-' + cleaned.slice(1).replace(/-/g, '')
    }
    // 只保留第一个小数点
    const dotIdx = cleaned.indexOf('.')
    if (dotIdx >= 0) {
      const before = cleaned.slice(0, dotIdx + 1)
      const after = cleaned.slice(dotIdx + 1).replace(/\./g, '')
      cleaned = before + after
    }
    // 转数字再转回字符串，自动去除前导零和尾随零
    const num = parseFloat(cleaned)
    if (isNaN(num)) return ''
    return String(num)
  },

  onQtyMinus() {
    const { actualQty } = this.data
    const v = parseFloat(actualQty) || 0
    this.setData({ actualQty: String(v - 1) })
    this.calculateDelta()
  },

  onQtyPlus() {
    const { actualQty } = this.data
    const v = parseFloat(actualQty) || 0
    this.setData({ actualQty: String(v + 1) })
    this.calculateDelta()
  },

  calculateDelta() {
    const { currentItem, actualQty, isChecked } = this.data
    if (!currentItem || actualQty === '') {
      this.setData({
        deltaPreview: null,
        deltaPreviewDisplay: '',
        deltaClass: '',
        submitBtnText: '提交盘点结果',
        showAlreadyCheckedHint: false
      })
      return
    }

    const quantity = Number(currentItem.quantity) || 0
    const inputQty = Number(actualQty)
    if (isNaN(inputQty)) return

    // 预计差值 = 实际库存 − 记录库存（与后端 delta = quantity_real − recorded_qty 一致）
    const deltaPreview = inputQty - quantity
    const absDelta = Math.abs(deltaPreview)
    let deltaClass = '', submitBtnText = '提交盘点结果'

    if (deltaPreview > 0) {
      // 实多 → 报溢
      deltaClass = 'delta-overage'
      submitBtnText = '提交盘点结果（预计报溢）'
    } else if (deltaPreview < 0) {
      // 实少 → 报损
      deltaClass = 'delta-loss'
      submitBtnText = '提交盘点结果（预计报损）'
    } else {
      deltaClass = 'delta-ok'
      submitBtnText = '✓ 提交盘点结果'
    }

    const showAlreadyCheckedHint = isChecked && deltaPreview !== 0

    this.setData({
      deltaPreview,
      deltaPreviewDisplay: absDelta > 0 ? this.formatNum(absDelta) : '0',
      deltaClass,
      submitBtnText,
      showAlreadyCheckedHint
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
  handleSubmitCheck() {
    const { currentItem, actualQty, submitLoading } = this.data
    if (!currentItem || actualQty === '') {
      wx.showToast({ title: '请输入实际库存数量', icon: 'none' })
      return
    }
    if (submitLoading) return

    const inputNum = Number(actualQty) || 0
    const stockQty = Number(currentItem.quantity) || 0

    // 防误操作：实际库存=0 且记录库存>0 时，二次确认报损
    if (inputNum === 0 && stockQty > 0) {
      const itemName = currentItem.name || '该物品'
      const displayAmount = this.formatNum(stockQty)
      const self = this
      setTimeout(() => {
        wx.showModal({
          title: '确认报损',
          content: `实际库存为 0，将把「${itemName}」的全部数量【${displayAmount}】进行报损，确认执行？`,
          confirmText: `确认报损 ${displayAmount}`,
          confirmColor: '#ee0a24',
          cancelText: '取消',
          success(res) {
            if (res.confirm) self._doSubmit()
          },
          fail() {
            wx.showModal({
              title: '确认报损',
              content: `将把「${itemName}」的全部数量【${displayAmount}】进行报损，确认执行？`,
              confirmText: '确认',
              confirmColor: '#ee0a24',
              cancelText: '取消',
              success(res2) { if (res2.confirm) self._doSubmit() }
            })
          }
        })
      }, 50)
      return
    }

    this._doSubmit()
  },

  async _doSubmit() {
    const { currentItem, actualQty } = this.data
    const inputQty = Number(actualQty) || 0

    this.setData({ submitLoading: true })
    wx.vibrateShort({ type: 'medium' })

    try {
      const { specifiedAllocationId, autoLinkEnabled } = this.data
      const itemAllocationId = currentItem.allocation_id || null

      // 发送 quantity_real（实际库存），后端计算 delta 并处理报损/报溢
      const payload = {
        stock_goods_id: currentItem.id,
        quantity_real: String(inputQty)
      }

      // 仅当自动关联开启 + 全局货位已设置 + 与物品当前货位不同时，才带 allocation_id
      if (autoLinkEnabled && specifiedAllocationId && specifiedAllocationId !== itemAllocationId) {
        payload.allocation_id = specifiedAllocationId
      }

      const result = await request.post('/stock/checking/submit/', payload)

      // ── 处理已删除记录（goodsproperty=None 导致物理删除） ──
      if (result.deleted) {
        wx.showToast({ title: result.delete_reason || '该记录已被删除', icon: 'none', duration: 3000 })
        const { searchResults, uncheckedList } = this.data
        this.setData({
          searchResults: searchResults.filter(item => item.id !== currentItem.id),
          uncheckedList: uncheckedList.filter(item => item.id !== currentItem.id),
          currentItem: null
        })
        await this.fetchProgress()
        return
      }

      // ── 使用后端返回的最新数据 ──
      const newQuantity = Number(result.quantity) || 0
      const delta = parseFloat(result.delta) || 0
      const isEnabled = result.is_enable
      const sheetType = result.sheet_type  // 'loss' | 'overflow' | null

      wx.vibrateShort({ type: 'medium' })
      setTimeout(() => { wx.vibrateShort({ type: 'medium' }) }, 100)

      // ── 更新搜索结果列表中该物品（用后端最新数据覆盖） ──
      const { searchResults, uncheckedList } = this.data
      const updatedResults = searchResults.map(item => {
        if (item.id === currentItem.id) {
          return {
            ...item,
            ischecked: true,
            quantity: String(newQuantity),
            quantity_display: this.formatNum(newQuantity || 0),
            is_enable: isEnabled,
            allocation_id: result.allocation_id,
            allocation_name: result.allocation_name
          }
        }
        return item
      })

      // 库存归零（is_enable=false）时从搜索结果移除
      const finalResults = isEnabled === false
        ? updatedResults.filter(item => item.id !== currentItem.id)
        : updatedResults

      this.setData({ searchResults: finalResults })

      // ── 更新 currentItem（后端已更新 quantity=quantity_real） ──
      this.setData({
        currentItem: {
          ...currentItem,
          quantity: String(newQuantity),
          is_enable: isEnabled,
          ischecked: true,
          allocation_id: result.allocation_id,
          allocation_name: result.allocation_name
        },
        quantityDisplay: String(newQuantity),
        actualQty: String(newQuantity),   // 提交后预填 = 更新后的库存，方便再次修改
        isChecked: true
      })

      // 提交成功后从"未记录"列表移除该商品
      const updatedUnchecked = uncheckedList.filter(item => item.id !== currentItem.id)
      if (updatedUnchecked.length !== uncheckedList.length) {
        this.setData({ uncheckedList: updatedUnchecked })
      }

      // ── 成功提示：基于 sheet_type / delta ──
      if (result.already_processed) {
        wx.showToast({ title: '该商品已处理，无需重复提交', icon: 'none', duration: 2000 })
      } else if (sheetType === 'loss') {
        this.showLargeSuccess(`已盘 ${this.formatNum(newQuantity)}，自动报损 ${this.formatNum(Math.abs(delta))}`)
      } else if (sheetType === 'overflow') {
        this.showLargeSuccess(`已盘 ${this.formatNum(newQuantity)}，自动报溢 ${this.formatNum(delta)}`)
      } else if (delta === 0) {
        this.showLargeSuccess('✓ 数量相符')
      } else {
        this.showLargeSuccess(`已盘 ${this.formatNum(newQuantity)}`)
      }

      await this.fetchProgress()

      // 清空当前物品卡片
      this.setData({ currentItem: null })

      // 提交成功后，用当前搜索关键词自动刷新列表（避免已报损商品仍显示在列表中）
      const remainingKey = this.data.searchKey
      if (remainingKey && remainingKey.trim()) {
        this.doSearch()
      } else {
        this.setData({ searchKey: '' })
      }

      // 连续扫码：提交成功后自动打开扫码
      if (this.data.continuousScan) {
        setTimeout(() => { this.handleScan() }, 400)
      }
    } catch (err) {
      this.showError(err)
    } finally {
      this.setData({ submitLoading: false })
    }
  },

  // ========== 完成统计相关 ==========

  showFinishMenu() {
    this.setData({ showFinishMenu: !this.data.showFinishMenu })
  },

  hideFinishMenu() {
    this.setData({ showFinishMenu: false })
  },

  toggleContinuousScan() {
    const newVal = !this.data.continuousScan
    this.setData({ continuousScan: newVal })
    wx.vibrateShort({ type: 'light' })
    wx.showToast({
      title: newVal ? '连续扫码已开启' : '连续扫码已关闭',
      icon: 'none',
      duration: 1200
    })
  },

  handleForceRestart() {
    wx.showModal({
      title: '重新开始',
      content: '将清除本次已统计的数据，并重置统计数量（不会提交报损报溢数量）然后开始新一轮的统计，确定执行吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.hideFinishMenu()
          this.handleStartCheck(true)
        }
      }
    })
  },

  handleFinishCheck() {
    wx.showModal({
      title: '完成统计',
      content: '将完成本次统计并清除"已记录"标记，报损与报溢明细请在"账务商品查询"页面查看。\n确认完成统计吗？',
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

  // ========== 货位相关 ==========
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

  // ========== 未记录列表 ==========
  _normalizeGoodsItem(nested) {
    const gi = nested.goodsproperty?.goodsinfo || {}
    return {
      id: nested.id,
      info: gi.id || null,
      name: gi.name || '--',
      specification: gi.specification || '--',
      manufacturer: gi.manufacturer_name || '--',
      unit: gi.unit || '',
      barcode: gi.barcode || '',
      batch: nested.batch || '',
      expire_date: nested.expire_date || '',
      production_date: nested.production_date || '',
      quantity: nested.quantity || '0',
      ischecked: nested.ischecked,
      allocation_name: nested.goodsproperty?.allocation_name || '',
      allocation_id: nested.allocation_id || null,
      quantity_display: this.formatNum(nested.quantity || 0)
    }
  },

  async fetchUnchecked() {
    const { uncheckedLoading, uncheckedList } = this.data
    if (uncheckedLoading) return

    if (uncheckedList.length > 0) {
      this.clearUnchecked()
      return
    }

    const userManager = require('../../utils/user')
    const userInfo = userManager.getUserInfo()
    const deptId = userInfo?.dept || userInfo?.dept_id || userInfo?.curr_dept_id || ''

    this.setData({ uncheckedLoading: true })
    try {
      const res = await request.get('/stock/goods/', {
        page: 1,
        size: 20,
        dept: deptId,
        ischecked: 'false',
        is_enable: 'true',
        quantity_gt: '0'
      })
      const rawList = (res.results) || []
      const list = rawList.map(item => this._normalizeGoodsItem(item))
      const count = res.count || 0
      const hasMore = list.length < count

      this.setData({
        uncheckedList: list,
        uncheckedCount: count,
        uncheckedPage: 1,
        uncheckedHasMore: hasMore,
        uncheckedLoading: false
      })
    } catch (err) {
      this.showError(err)
      this.setData({ uncheckedLoading: false })
    }
  },

  async loadMoreUnchecked() {
    const { uncheckedLoading, uncheckedHasMore, uncheckedPage } = this.data
    if (uncheckedLoading || !uncheckedHasMore) return

    const userManager = require('../../utils/user')
    const userInfo = userManager.getUserInfo()
    const deptId = userInfo?.dept || userInfo?.dept_id || userInfo?.curr_dept_id || ''

    const nextPage = uncheckedPage + 1
    this.setData({ uncheckedLoading: true })
    try {
      const res = await request.get('/stock/goods/', {
        page: nextPage,
        size: 20,
        dept: deptId,
        ischecked: 'false',
        is_enable: 'true',
        quantity_gt: '0'
      })
      const rawList = (res.results) || []
      const moreItems = rawList.map(item => this._normalizeGoodsItem(item))
      const merged = [...this.data.uncheckedList, ...moreItems]
      const count = res.count || 0
      const hasMore = merged.length < count

      this.setData({
        uncheckedList: merged,
        uncheckedPage: nextPage,
        uncheckedHasMore: hasMore,
        uncheckedLoading: false
      })
    } catch (err) {
      this.showError(err)
      this.setData({ uncheckedLoading: false })
    }
  },

  clearUnchecked() {
    this.setData({ uncheckedList: [], uncheckedCount: 0, uncheckedPage: 1, uncheckedHasMore: false })
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
    if (this.data.allocationLoading) return

    this.setData({ allocationLoading: true })
    try {
      const data = await request.get('/goods/allocation/', { fields: 'id_name' })
      const results = (data && data.results) || data || []

      this.setData({
        allocationList: results,
        filteredAllocations: results,
        allocationLoading: false
      })
    } catch (err) {
      this.showError(err)
      this.setData({ allocationLoading: false })
    }
  },

  closeAllocationDialog() {
    this.setData({
      showAllocationDialog: false,
      allocationSearchKey: '',
      filteredAllocations: [],
      allocationLoading: false
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

      const res = await request.post('/goods/allocation/', formData)

      const newAlloc = res.id ? res : (res.results && res.results[0])
      if (!newAlloc) {
        wx.showToast({ title: '创建成功但未返回数据', icon: 'none' })
        return
      }

      wx.showToast({ title: `货位「${newAlloc.name}」创建成功`, icon: 'success' })

      const { allocationList } = this.data
      const updatedList = [newAlloc, ...allocationList]

      this.setData({
        allocationList: updatedList,
        filteredAllocations: updatedList,
        selectedAllocationId: newAlloc.id,
        showCreateAllocationDialog: false,
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
