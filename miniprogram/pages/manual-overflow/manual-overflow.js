// pages/manual-overflow/manual-overflow.js
const request = require('../../utils/request')

Page({
  data: {
    // 报溢单列表 + 选中
    sheetList: [],
    sheetListLoading: false,
    showSheetPicker: false,
    selectedSheetId: null,
    selectedSheetCreatetime: '',

    // 报溢单详情商品
    sheetGoodsList: [],
    sheetGoodsLoading: false,
    showSheetDetail: true,  // 商品明细列表展开/收起

    // 商品搜索
    searchKey: '',
    searchLoading: false,
    searched: false,
    searchResults: [],
    showSearchResults: true,  // 查询结果列表是否显示

    // 选中商品（GoodsInfo）
    selectedItem: null,

    // 当前编辑的 StockSheetGoods.id（有值时为编辑模式）
    editingSheetGoodsId: null,

    // 表单
    formBatch: '',
    formQuantity: '',
    formCost: '',
    formProductionDate: '',
    formExpireDate: '',

    // 数量加减按钮状态
    quantityMinusDisabled: true,

    // 当前页面滚动位置
    currentScrollTop: 0,

    // 提交
    submitLoading: false,
    showSuccessOverlay: false,

    // 键盘适配：仅推起表单卡片，不滚动整个页面
    keyboardHeight: 0,
    keyboardUp: false,

    // 表单 input focus 状态（用于回车切换焦点）
    focusBatch: false,
    focusQuantity: false,
    focusCost: false,
    focusProductionDate: false,
    focusExpireDate: false,

    // 回到顶部
    showBackTop: false
  },

  onLoad() {
    this.fetchSheetList()
    this._setupKeyboardListener()
    this._saveSystemInfo()
  },

  onUnload() {
    if (wx.offKeyboardHeightChange) {
      wx.offKeyboardHeightChange()
    }
  },

  /**
   * 获取系统信息，计算导航栏高度
   */
  _saveSystemInfo() {
    try {
      const info = wx.getSystemInfoSync()
      this._statusBarHeight = info.statusBarHeight || 20
      // 导航栏高度 = 胶囊按钮高度 + 上下间距，估算为 44
      this._navBarHeight = this._statusBarHeight + 44
    } catch (e) {
      this._statusBarHeight = 20
      this._navBarHeight = 64
    }
  },

  /**
   * 监听键盘高度变化
   * 仅推起表单卡片，不滚动整个页面，避免动画抖动
   */
  _setupKeyboardListener() {
    if (!wx.onKeyboardHeightChange) return

    wx.onKeyboardHeightChange((res) => {
      this.setData({
        keyboardHeight: res.height,
        keyboardUp: res.height > 0
      })
    })
  },

  // 监听页面滚动
  onPageScroll(e) {
    const show = e.scrollTop > 1000
    if (show !== this.data.showBackTop) {
      this.setData({ showBackTop: show })
    }
    this.data.currentScrollTop = e.scrollTop
  },

  scrollToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
  },

  // ========== 报溢单列表 ==========
  async fetchSheetList() {
    this.setData({ sheetListLoading: true })
    try {
      const data = await request.get('/stock/sheet/', {
        stock_sheet_type: 80,
        status: 0,
        size: 100
      })
      const list = (data && data.results) || []
      this.setData({ sheetList: list, sheetListLoading: false })
    } catch (err) {
      this.setData({ sheetListLoading: false })
    }
  },

  toggleSheetPicker() {
    this.setData({ showSheetPicker: !this.data.showSheetPicker })
  },

  /**
   * 展开/收起商品明细列表
   */
  toggleSheetDetail() {
    this.setData({ showSheetDetail: !this.data.showSheetDetail })
  },

  /**
   * 从卡片列表选择报溢单 → 加载详情 → 关闭列表
   */
  selectSheet(e) {
    const idx = e.currentTarget.dataset.index
    const sheet = this.data.sheetList[idx]
    if (!sheet) return

    this.setData({
      selectedSheetId: sheet.id,
      selectedSheetCreatetime: sheet.createtime,
      showSheetPicker: false,
      showSheetDetail: true,
      sheetGoodsList: [],
      selectedItem: null
    })
    this.fetchSheetGoods(sheet.id)
  },

  /**
   * 加载报溢单的商品明细
   */
  async fetchSheetGoods(sheetId) {
    this.setData({ sheetGoodsLoading: true })
    try {
      const data = await request.get('/stock/sheet/goods/', { sheet_id: sheetId })
      this.setData({ sheetGoodsList: data || [], sheetGoodsLoading: false })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' })
      this.setData({ sheetGoodsLoading: false })
    }
  },

  // ========== 商品搜索（GoodsInfo 全局搜索） ==========
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
  },

  clearSearch() {
    this.setData({
      searchKey: '',
      searched: false,
      searchResults: [],
      selectedItem: null,
      showSearchResults: true
    })
  },

  /**
   * 切换查询结果列表的显示/隐藏
   */
  toggleSearchResults() {
    this.setData({ showSearchResults: !this.data.showSearchResults })
  },

  /**
   * 点击搜索结果 → 显示物品表单卡片
   * 未选择报溢单时也允许填报，提交时自动关联 sheet
   */
  selectItem(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    this.setData({
      selectedItem: item,
      showSearchResults: true,  // 取消后让列表能重新显示
    })
  },

  async doSearch() {
    const { searchKey } = this.data
    if (!searchKey.trim()) {
      wx.showToast({ title: '请输入搜索内容', icon: 'none' })
      return
    }

    this.setData({ searchLoading: true, searched: false, selectedItem: null })

    try {
      const data = await request.get('/goods/info_search/', { search_key: searchKey })

      if (!data || data.length === 0) {
        wx.showToast({ title: '未找到匹配的商品', icon: 'none' })
        this.setData({ searched: true, searchResults: [], showSearchResults: true })
      } else if (data.length === 1) {
        this.setData({ searched: true, searchResults: data, selectedItem: data[0], showSearchResults: true })
      } else {
        this.setData({ searched: true, searchResults: data, showSearchResults: true })
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '查询失败', icon: 'none' })
      this.setData({ searched: true, searchResults: [] })
    } finally {
      this.setData({ searchLoading: false })
    }
  },

  // ========== 扫码 ==========
  handleScan() {
    wx.navigateTo({
      url: '/pages/scan/scan?mode=return',
      events: {
        scanResult: (data) => {
          this.setData({ searchKey: data.code })
          this.doSearch()
        }
      }
    })
  },

  /**
   * 点击商品明细 row → 回填表单进入编辑模式
   */
  onSheetGoodsRowTap(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return

    this.setData({
      selectedItem: {
        id: item.goodsinfo?.id || item.goodsinfo_id || null,
        name: item.name,
        specification: item.specification,
        manufacturer: item.manufacturer,
        approvalcode: item.approvalcode,
      },
      formBatch: item.batch || '',
      formQuantity: String(item.quantity),
      formCost: String(item.cost),
      formProductionDate: item.production_date || '',
      formExpireDate: item.expire_date || '',
      editingSheetGoodsId: item.id || null,
    })
  },

  /**
   * 取消编辑模式
   */
  cancelEdit() {
    this.setData({
      editingSheetGoodsId: null,
      selectedItem: null,
      formBatch: '',
      formQuantity: '',
      formCost: '',
      formProductionDate: '',
      formExpireDate: '',
      focusBatch: false,
      focusQuantity: false,
      focusCost: false,
      focusProductionDate: false,
      focusExpireDate: false,
      showSearchResults: true,  // 取消后重新显示结果列表
    })
  },

  // ========== 表单输入 ==========
  onBatchInput(e) {
    this.setData({ formBatch: e.detail.value })
  },
  onQuantityInput(e) {
    const val = e.detail.value
    const disabled = !val || parseInt(val) <= 1
    this.setData({ formQuantity: val, quantityMinusDisabled: disabled })
  },
  onQuantityBlur() {
    const formatted = this.formatNumeric(this.data.formQuantity)
    const disabled = !formatted || parseFloat(formatted) <= 1
    this.setData({ formQuantity: formatted, quantityMinusDisabled: disabled })
  },
  onQuantityMinus() {
    if (this.data.quantityMinusDisabled) return
    const val = parseInt(this.data.formQuantity) || 1
    const next = Math.max(1, val - 1)
    this.setData({ formQuantity: String(next), quantityMinusDisabled: next <= 1 })
  },
  onQuantityPlus() {
    const val = parseInt(this.data.formQuantity) || 0
    const next = val + 1
    this.setData({ formQuantity: String(next), quantityMinusDisabled: next <= 1 })
  },
  onCostInput(e) {
    this.setData({ formCost: e.detail.value })
  },
  onCostBlur() {
    this.setData({ formCost: this.formatNumeric(this.data.formCost) })
  },
  onProductionDateInput(e) {
    this.setData({ formProductionDate: e.detail.value })
  },
  onExpireDateInput(e) {
    this.setData({ formExpireDate: e.detail.value })
  },

  /**
   * input 回车键：切换到下一个输入框
   * 顺序：数量 → 进价 → 批号 → 生产日期 → 有效期至
   * 最后一个输入框回车则收起键盘
   */
  onFormConfirm(e) {
    const field = e.currentTarget.dataset.field
    const order = ['quantity', 'cost', 'batch', 'productionDate', 'expireDate']
    const idx = order.indexOf(field)
    if (idx < 0) return

    if (idx < order.length - 1) {
      // 切换到下一个输入框
      const next = order[idx + 1]
      const nextKey = `focus${next.charAt(0).toUpperCase()}${next.slice(1)}`
      const currentKey = `focus${field.charAt(0).toUpperCase()}${field.slice(1)}`
      this.setData({
        [currentKey]: false,
        [nextKey]: true
      })
    } else {
      // 最后一个：收起键盘
      wx.hideKeyboard()
    }
  },

  /**
   * 日期 blur 时自动格式化为 YYYY-MM-DD
   */
  onProductionDateBlur() {
    const formatted = this.parseDateInput(this.data.formProductionDate)
    this.setData({ formProductionDate: formatted })
  },

  onExpireDateBlur() {
    const formatted = this.parseDateInput(this.data.formExpireDate)
    this.setData({ formExpireDate: formatted })
  },

  /**
   * 智能解析日期输入为 YYYY-MM-DD
   * 支持: 20251027, 2025-10-27, 2025/10/27, 10-27, 25-10-27, 1027
   */
  parseDateInput(value) {
    if (!value || !value.trim()) return ''

    const raw = value.trim()
    // 去掉分隔符提取纯数字
    const digits = raw.replace(/\D/g, '')

    if (digits.length === 8) {
      // YYYYMMDD → YYYY-MM-DD
      return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
    }
    if (digits.length === 6) {
      // YYMMDD → 20YY-MM-DD
      return `20${digits.slice(0,2)}-${digits.slice(2,4)}-${digits.slice(4,6)}`
    }
    if (digits.length === 4) {
      // MMDD → current year + MM-DD
      const now = new Date()
      const year = now.getFullYear()
      return `${year}-${digits.slice(0,2)}-${digits.slice(2,4)}`
    }

    // 尝试用 Date 解析
    const d = new Date(raw)
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    return raw
  },

  /**
   * 格式化输入数字：≥0，最多 6 位小数，去尾零
   */
  formatNumeric(val) {
    if (val === '' || val === null || val === undefined) return ''
    const num = parseFloat(String(val).replace(/[^\d.]/g, ''))
    if (isNaN(num) || num < 0) return '0'
    // Round to 6 decimal places, strip trailing zeros
    const fixed = parseFloat(num.toFixed(6))
    return String(fixed)
  },

  // ========== 提交 ==========
  async handleSubmit() {
    const { selectedItem, formBatch, formQuantity, formCost, formProductionDate, formExpireDate, editingSheetGoodsId } = this.data

    if (!selectedItem) {
      wx.showToast({ title: '请先选择商品', icon: 'none' })
      return
    }
    if (!formBatch.trim()) {
      wx.showToast({ title: '请输入批号', icon: 'none' })
      return
    }
    if (!formQuantity || Number(formQuantity) <= 0) {
      wx.showToast({ title: '请输入正确的报溢数量', icon: 'none' })
      return
    }
    if (!formCost || Number(formCost) <= 0) {
      wx.showToast({ title: '请输入正确的进价', icon: 'none' })
      return
    }
    if (!formProductionDate) {
      wx.showToast({ title: '请输入生产日期', icon: 'none' })
      return
    }
    if (!formExpireDate) {
      wx.showToast({ title: '请输入有效期', icon: 'none' })
      return
    }

    this.setData({ submitLoading: true })

    try {
      if (editingSheetGoodsId) {
        // 编辑模式：PATCH 更新已有 StockSheetGoods
        await request.patch(`/stock/sheet/goods/${editingSheetGoodsId}/`, {
          batch: formBatch.trim(),
          quantity: formQuantity,
          cost: formCost,
          production_date: formProductionDate,
          expire_date: formExpireDate,
        })
      } else {
        // 新增模式：POST 创建新 StockSheetGoods
        await request.post('/stock/checking/manual_overflow/', {
          goodsinfo_id: selectedItem.id,
          quantity: formQuantity,
          cost: formCost,
          batch: formBatch.trim(),
          production_date: formProductionDate,
          expire_date: formExpireDate
        })
      }

      this.showLargeSuccess()
      this.setData({
        editingSheetGoodsId: null,
        selectedItem: null,
        formBatch: '',
        formQuantity: '',
        formCost: '',
        formProductionDate: '',
        formExpireDate: '',
        focusBatch: false,
        focusQuantity: false,
        focusCost: false,
        focusProductionDate: false,
        focusExpireDate: false,
        showSearchResults: true,  // 提交后重新显示结果列表
      })
      if (this.data.selectedSheetId) {
        this.fetchSheetGoods(this.data.selectedSheetId)
      } else {
        this.fetchSheetList()
      }
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitLoading: false })
    }
  },

  showLargeSuccess() {
    this.setData({ showSuccessOverlay: true })
    setTimeout(() => {
      this.setData({ showSuccessOverlay: false })
    }, 2000)
  }
})
